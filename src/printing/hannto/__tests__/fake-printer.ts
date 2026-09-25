/**
 * Поддельный принтер для тестов: ведёт себя как настоящий Hannto.
 *
 * Отвечает теми же кадрами, что снятые с устройства: рукопожатие
 * Диффи — Хеллмана, зашифрованные ответы JSON со своим счётчиком сообщений
 * (не с нашим — принтер нумерует ответы независимо, сопоставлять надо по
 * `id` внутри JSON). Это позволяет прогонять весь разговор целиком, включая
 * ошибки и обрывы, не имея принтера под рукой.
 */

import {decryptEcb, encryptEcb} from '../aes';
import {
  Channel,
  Encoding,
  type Frame,
  Interactive,
  buildFrame,
  readFrames,
} from '../frames';
import {intToHexAscii, modPow, padEnd, padFront} from '../handshake';
import {decodeUtf8, encodeUtf8} from '../text';
import type {HanntoLink} from '../session';

/** Модуль и основание — те же, что выдаёт настоящая прошивка. */
export const FAKE_P = 0xe6969d3d495be32cn;
export const FAKE_G = 2n;
const FAKE_SECRET = 0x1f2e3d4cn;

export interface FakePrinterOptions {
  /** Заряд в процентах. */
  battery?: number;
  /** Сколько отпечатков до чистки. */
  cleanRemain?: number;
  /** Код неисправности; 0 — всё хорошо. */
  error?: number;
  /** Что отвечать на `mixed_status`: очередь состояний, последнее повторяется. */
  states?: string[];
  /** Отказать в рукопожатии. */
  rejectHandshake?: boolean;
  /** Не отвечать на команды вовсе — проверка таймаутов. */
  silent?: boolean;
  /** Вернуть ошибку на этот метод. */
  failMethod?: string;
  /** Резать ответы на части такого размера — проверка сборки многочастных. */
  splitAt?: number;
  /** Слать части задом наперёд — проверка сборки не по порядку. */
  reverseParts?: boolean;
}

export class FakePrinter implements HanntoLink {
  readonly written: Uint8Array[] = [];
  /** Собранный из кусков файл — тест сверяет его с исходным. */
  readonly received: number[] = [];
  /** Номера заданий, которые мы выдали. */
  jobId = 0;
  /** Размер, заявленный в `print_job`: по нему отсекается дополнение шифра. */
  fileSize = 0;
  /** Сколько раз спрашивали состояние. */
  statusCalls = 0;
  /** Сколько кадров разобрано — записей может быть меньше из-за склейки. */
  frameCount = 0;
  key: Uint8Array | null = null;

  private readonly options: FakePrinterOptions;
  private listeners: ((data: Uint8Array) => void)[] = [];
  private buffer: Uint8Array = new Uint8Array(0);
  private message = 14;
  private stateIndex = 0;

  constructor(options: FakePrinterOptions = {}) {
    this.options = options;
  }

  subscribe(listener: (data: Uint8Array) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(item => item !== listener);
    };
  }

  async write(data: Uint8Array): Promise<void> {
    this.written.push(data);
    const merged = new Uint8Array(this.buffer.length + data.length);
    merged.set(this.buffer);
    merged.set(data, this.buffer.length);
    const {frames, rest} = readFrames(merged);
    this.buffer = rest;
    for (const frame of frames) {
      this.frameCount += 1;
      this.handle(frame);
    }
  }

  /** Обрывает связь: приложение должно это пережить. */
  disconnect(): void {
    this.listeners = [];
  }

  private emit(frame: Uint8Array): void {
    for (const listener of [...this.listeners]) {
      listener(frame);
    }
  }

  private handle(frame: Frame): void {
    if (frame.channel === Channel.auth) {
      this.handshake(frame);
      return;
    }
    if (frame.channel === Channel.fileEncrypted) {
      this.collectFile(frame);
      return;
    }
    if (frame.channel === Channel.dataEncrypted && !this.options.silent) {
      this.command(frame);
    }
  }

  private handshake(frame: Frame): void {
    if (frame.interactive === Interactive.clientHello) {
      const ra = modPow(FAKE_G, FAKE_SECRET, FAKE_P);
      const body = new Uint8Array(36);
      body.set(intToHexAscii(FAKE_G));                    // основание, хвост нулями
      body.set(padFront(intToHexAscii(FAKE_P)), 4);       // модуль
      body.set(padFront(intToHexAscii(ra)), 20);          // половина принтера
      this.emit(this.reply(Interactive.serverHello, Encoding.hex, body, false));
      return;
    }

    if (frame.interactive === Interactive.clientConfirm) {
      // Восстанавливаем общий ключ из половины приложения — как прошивка.
      const rb = BigInt('0x' + new TextDecoder().decode(frame.body.subarray(0, 16)));
      const shared = modPow(rb, FAKE_SECRET, FAKE_P);
      let keyBytes = intToHexAscii(shared);
      if (keyBytes.length < 16) {
        keyBytes = padEnd(keyBytes);
      }
      this.key = keyBytes.slice(0, 16);

      const answer = this.options.rejectHandshake ? 'no' : 'ok';
      const body = new Uint8Array(3);
      for (let i = 0; i < answer.length; i++) {
        body[i] = answer.charCodeAt(i);
      }
      this.emit(this.reply(Interactive.serverConfirm, Encoding.hex, body, false));
    }
  }

  private collectFile(frame: Frame): void {
    const plain = decryptEcb(this.key!, frame.body);
    const job = new DataView(plain.buffer, plain.byteOffset).getUint32(0, true);
    if (job !== this.jobId) {
      throw new Error(`Кусок помечен заданием ${job}, а печатаем ${this.jobId}`);
    }
    // Блочный шифр дополняет последний кусок нулями. Настоящий принтер
    // знает длину файла из `print_job` и лишнее отбрасывает — делаем так же.
    const room = this.fileSize - this.received.length;
    for (const byte of plain.subarray(4, 4 + Math.max(0, room))) {
      this.received.push(byte);
    }
  }

  private command(frame: Frame): void {
    const text = decodeUtf8(decryptEcb(this.key!, frame.body));
    const request = JSON.parse(text) as {method: string; id: number; params: unknown};

    if (request.method === this.options.failMethod) {
      this.send({id: request.id, error: {code: -1, message: 'нет бумаги'}});
      return;
    }

    switch (request.method) {
      case 'get_prop':
        this.send({
          id: request.id,
          result: [{sku: 'BHR9974GL', fw_ver: '2.1.2_0015', hw_ver: 'REVB', did: '4000430552'}],
        });
        break;
      case 'mixed_status': {
        this.statusCalls += 1;
        const states = this.options.states ?? ['idle'];
        const category = states[Math.min(this.stateIndex, states.length - 1)]!;
        this.stateIndex += 1;
        this.send({
          id: request.id,
          result: {
            category,
            sub_category: category === 'idle' ? 'init' : 'decoding',
            error: this.options.error ?? 0,
            battery: 3,
            'battery-level': this.options.battery ?? 83,
            clean_remain: this.options.cleanRemain ?? 6,
            ...(this.jobId ? {job_id: this.jobId, job_type: 0, prt_copies: 0} : {}),
          },
        });
        break;
      }
      case 'print_job':
        this.jobId += 15;
        this.fileSize = (request.params as {file_size: number}).file_size;
        this.send({id: request.id, result: {job_id: this.jobId}});
        break;
      case 'job_info':
        this.send({
          id: request.id,
          result: [
            {
              job_id: this.jobId,
              job_type: 0,
              job_state: 'finished',
              prt_copies: 1,
              transfer_time: 8727,
              print_time: 51777,
            },
          ],
        });
        break;
      default:
        this.send({id: request.id, error: {code: -2, message: 'неизвестный метод'}});
    }
  }

  /** Незапрошенное событие — приложение должно его пропустить. */
  sendEvent(): void {
    this.send({method: 'event.big_data', params: {total: {printed: 15}}});
  }

  private send(payload: unknown): void {
    const bytes = encodeUtf8(JSON.stringify(payload));

    const limit = this.options.splitAt ?? bytes.length;
    const parts = Math.max(1, Math.ceil(bytes.length / limit));
    this.message += 1;
    const message = this.message;

    const order = [...Array(parts).keys()];
    if (this.options.reverseParts) {
      order.reverse();
    }
    for (const i of order) {
      const slice = bytes.subarray(i * limit, (i + 1) * limit);
      this.emit(
        buildFrame({
          channel: Channel.dataEncrypted,
          interactive: Interactive.response,
          encoding: Encoding.json,
          sequence: 0, // принтер не нумерует ответы нашим счётчиком
          message,
          body: encryptEcb(this.key!, slice),
          encrypted: true,
          parts,
          part: i + 1,
        }),
      );
    }
  }

  private reply(
    interactive: number,
    encoding: number,
    body: Uint8Array,
    encrypted: boolean,
  ): Uint8Array {
    this.message += 1;
    return buildFrame({
      channel: Channel.auth,
      interactive,
      encoding,
      sequence: this.message - 14,
      message: this.message,
      body,
      encrypted,
    });
  }
}
