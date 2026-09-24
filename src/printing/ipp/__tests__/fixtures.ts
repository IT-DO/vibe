/**
 * Тестовые заготовки: собираем байты IPP «руками», не пользуясь собственным
 * кодировщиком. Иначе тест декодера проверял бы сам себя.
 */

import {ByteWriter, encodeUtf8} from '../../../utils/bytes';

/** Атрибут: тег + имя + значение (значение уже в байтах, без префикса длины). */
export function attr(tag: number, name: string, value: Uint8Array): Uint8Array {
  const w = new ByteWriter(64);
  const nameBytes = encodeUtf8(name);
  w.u8(tag).u16(nameBytes.length).bytes(nameBytes).u16(value.length).bytes(value);
  return w.toBytes();
}

/** Дополнительное значение предыдущего атрибута (name-length = 0). */
export function extraValue(tag: number, value: Uint8Array): Uint8Array {
  const w = new ByteWriter(32);
  w.u8(tag).u16(0).u16(value.length).bytes(value);
  return w.toBytes();
}

export const text = (s: string): Uint8Array => encodeUtf8(s);

export const int32 = (n: number): Uint8Array => new ByteWriter(4).u32(n).toBytes();

export const bool = (b: boolean): Uint8Array => new Uint8Array([b ? 1 : 0]);

export const resolution = (x: number, y: number, units = 3): Uint8Array =>
  new ByteWriter(9).u32(x).u32(y).u8(units).toBytes();

/** Заголовок ответа: версия, статус, request-id. */
export function responseHeader(status: number, requestId: number): Uint8Array {
  return new ByteWriter(8).u8(2).u8(0).u16(status).u32(requestId).toBytes();
}

/** Склеивает части в цельное сообщение. */
export function message(...parts: Uint8Array[]): Uint8Array {
  const w = new ByteWriter(512);
  for (const p of parts) {
    w.bytes(p);
  }
  return w.toBytes();
}

/** Оборачивает тело IPP в HTTP-ответ с Content-Length. */
export function httpWrap(body: Uint8Array, status = 200): Uint8Array {
  const head = encodeUtf8(
    `HTTP/1.1 ${status} OK\r\nContent-Type: application/ipp\r\nContent-Length: ${body.length}\r\n\r\n`,
  );
  return message(head, body);
}
