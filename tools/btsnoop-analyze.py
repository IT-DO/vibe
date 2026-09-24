#!/usr/bin/env python3
"""
Разбор журнала Bluetooth (btsnoop) с печатью на Xiaomi Portable Photo Printer 1S.

Зачем: у принтера нет Wi-Fi, печатает он по закрытому протоколу поверх
Bluetooth, и единственный способ узнать этот протокол — посмотреть, что
шлёт в принтер приложение Xiaomi Home. Инструмент проходит путь от сырого
журнала до разобранных кадров:

    btsnoop -> HCI -> ACL -> L2CAP -> RFCOMM -> кадры прикладного протокола

Запуск:
    python3 tools/btsnoop-analyze.py btsnoop_hci.log [--dump папка]

Как снять журнал — в docs/PRINTER.md, что удалось разобрать — в
docs/BLUETOOTH-PROTOCOL.md.
"""

import argparse
import collections
import math
import os
import struct
import sys

FLAG_RECEIVED = 1
H4_ACL = 2
PSM_RFCOMM = 3
RFCOMM_UIH = 0xEF

FRAME_START = b'\x7e\x64\x00'
HEADER_SIZE = 20


def read_btsnoop(path):
    """Пакеты HCI из файла btsnoop: (время, принят ли, тип H4, тело)."""
    with open(path, 'rb') as f:
        header = f.read(16)
        if header[:8] != b'btsnoop\x00':
            sys.exit('Это не файл btsnoop. Нужен btsnoop_hci.log из отчёта об ошибке.')
        while True:
            record = f.read(24)
            if len(record) < 24:
                return
            _, included, flags, _, timestamp = struct.unpack('>IIIIq', record)
            data = f.read(included)
            if len(data) < included or not data:
                return
            yield timestamp, bool(flags & FLAG_RECEIVED), data[0], data[1:]


def l2cap_frames(packets):
    """Собирает кадры L2CAP из фрагментов ACL."""
    pending = {}
    for timestamp, received, h4, body in packets:
        if h4 != H4_ACL or len(body) < 4:
            continue
        handle_flags, acl_len = struct.unpack('<HH', body[:4])
        handle = handle_flags & 0x0FFF
        boundary = (handle_flags >> 12) & 0x3
        payload = body[4:4 + acl_len]
        key = (handle, received)

        if boundary == 2 or key not in pending:
            if len(payload) < 4:
                continue
            length, cid = struct.unpack('<HH', payload[:4])
            pending[key] = [cid, length, bytearray(payload[4:])]
        else:
            pending[key][2].extend(payload)

        cid, length, buffer = pending[key]
        if len(buffer) >= length:
            yield timestamp, received, cid, bytes(buffer[:length])
            del pending[key]


def rfcomm_stream(frames):
    """Полезная нагрузка RFCOMM в обе стороны."""
    outgoing, incoming = bytearray(), bytearray()
    for _, received, cid, data in frames:
        if len(data) < 3:
            continue
        address, control = data[0], data[1]
        dlci = address >> 2
        if (control & RFCOMM_UIH) != RFCOMM_UIH or dlci == 0:
            continue

        i = 2
        length = data[i]
        if length & 1:
            length >>= 1
            i += 1
        else:
            length = (length >> 1) | (data[i + 1] << 7)
            i += 2
        if (control >> 4) & 1:      # кредитный контроль потока
            i += 1

        chunk = data[i:i + length]
        (incoming if received else outgoing).extend(chunk)
    return bytes(outgoing), bytes(incoming)


def app_frames(stream):
    """
    Кадры прикладного протокола.

    Границы ищутся по началу `7E 64 00` и возрастающему номеру пакета:
    завершающий байт 0x7E встречается и внутри данных, поэтому опираться
    на него нельзя.
    """
    candidates = []
    position = 0
    while True:
        position = stream.find(FRAME_START, position)
        if position < 0 or position + HEADER_SIZE > len(stream):
            break
        header = stream[position:position + HEADER_SIZE]
        candidates.append((position, header, struct.unpack('<I', header[6:10])[0]))
        position += 1

    frames, expected = [], 1
    for offset, header, sequence in candidates:
        if sequence != expected:
            continue
        expected += 1
        length = header[18] + ((header[19] & 0x03) << 8)
        frames.append({
            'offset': offset,
            'channel': header[3],
            'command': header[4],
            'flag': header[5],
            'sequence': sequence,
            'id': struct.unpack('<I', header[10:14])[0],
            'parts': struct.unpack('<H', header[14:16])[0],
            'part': struct.unpack('<H', header[16:18])[0],
            'attribute': header[19],
            'payload': stream[offset + HEADER_SIZE:offset + HEADER_SIZE + length],
        })
    return frames


def entropy(data):
    if not data:
        return 0.0
    counts = collections.Counter(data)
    total = len(data)
    return -sum(n / total * math.log2(n / total) for n in counts.values())


def block_repeats(data, size=16):
    """Повторы блоков — признак блочного шифра в режиме ECB."""
    blocks = [data[i:i + size] for i in range(0, len(data) - size + 1, size)]
    counts = collections.Counter(blocks)
    return sum(n - 1 for n in counts.values() if n > 1), len(blocks)


CHANNELS = {0xFF: 'рукопожатие', 0x03: 'команды', 0x04: 'данные изображения'}


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('log', help='btsnoop_hci.log из отчёта об ошибке')
    parser.add_argument('--dump', metavar='ПАПКА',
                        help='куда сложить собранные потоки и данные изображения')
    args = parser.parse_args()

    packets = list(read_btsnoop(args.log))
    frames = list(l2cap_frames(packets))
    outgoing, incoming = rfcomm_stream(frames)

    print(f'Пакетов HCI: {len(packets)}')
    channels = collections.Counter(cid for _, _, cid, _ in frames)
    rfcomm_used = any(cid >= 0x40 for cid in channels)
    print(f'Каналов L2CAP: {len(channels)}'
          f'{" (включая RFCOMM — это Bluetooth Classic, не BLE)" if rfcomm_used else ""}')
    if 0x0004 in channels:
        print('  внимание: есть канал ATT — часть обмена шла по BLE')
    print(f'\nТелефон -> принтер: {len(outgoing)} байт')
    print(f'Принтер -> телефон: {len(incoming)} байт')

    for title, stream in (('ТЕЛЕФОН -> ПРИНТЕР', outgoing), ('ПРИНТЕР -> ТЕЛЕФОН', incoming)):
        parsed = app_frames(stream)
        print(f'\n=== {title}: кадров {len(parsed)} ===')
        grouped = collections.Counter(f['channel'] for f in parsed)
        for channel, count in sorted(grouped.items()):
            selected = [f for f in parsed if f['channel'] == channel]
            total = sum(len(f['payload']) for f in selected)
            name = CHANNELS.get(channel, f'0x{channel:02x}')
            print(f'  канал {name:20} {count:4} кадров, {total:7} байт')

        image = b''.join(f['payload'] for f in parsed if f['channel'] == 0x04)
        if image:
            repeats, blocks = block_repeats(image)
            first = next(f for f in parsed if f['channel'] == 0x04)
            print(f'\n  изображение: {len(image)} байт в {first["parts"]} частях')
            print(f'  энтропия {entropy(image):.3f} бит/байт '
                  f'({"похоже на шифрование или сжатие" if entropy(image) > 7.9 else "не зашифровано"})')
            print(f'  повторов 16-байтных блоков: {repeats} из {blocks} '
                  f'({"есть — похоже на режим ECB" if repeats else "нет"})')
            if image[:3] == b'\xff\xd8\xff':
                print('  начинается с сигнатуры JPEG — данные открыты!')

        handshake = [f for f in parsed if f['channel'] == 0xFF]
        for frame in handshake:
            text = ''.join(chr(b) if 32 <= b < 127 else '.' for b in frame['payload'])
            print(f'  рукопожатие cmd=0x{frame["command"]:02x}: "{text[:64]}"')

    if args.dump:
        os.makedirs(args.dump, exist_ok=True)
        open(os.path.join(args.dump, 'outgoing.bin'), 'wb').write(outgoing)
        open(os.path.join(args.dump, 'incoming.bin'), 'wb').write(incoming)
        image = b''.join(f['payload'] for f in app_frames(outgoing) if f['channel'] == 0x04)
        if image:
            open(os.path.join(args.dump, 'image.bin'), 'wb').write(image)
        print(f'\nПотоки сохранены в {args.dump}')


if __name__ == '__main__':
    main()
