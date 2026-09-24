/**
 * Байтовые примитивы для бинарных протоколов (IPP, PWG Raster).
 *
 * Намеренно не используем Node `Buffer`: в React Native на Hermes его нет без
 * полифилла. Работаем на голых `Uint8Array` и своей реализации UTF-8, чтобы
 * один и тот же код гонялся и в приложении, и в юнит-тестах на Node.
 *
 * Порядок байтов везде big-endian — так требуют и IPP (RFC 8010),
 * и PWG Raster (версия «RaS2»).
 */

/** Пишет big-endian поток с автоматическим ростом буфера. */
export class ByteWriter {
  private buf: Uint8Array;
  private len = 0;

  constructor(initialCapacity = 256) {
    this.buf = new Uint8Array(Math.max(16, initialCapacity));
  }

  /** Сколько байт уже записано. */
  get length(): number {
    return this.len;
  }

  private ensure(extra: number): void {
    const need = this.len + extra;
    if (need <= this.buf.length) {
      return;
    }
    let cap = this.buf.length * 2;
    while (cap < need) {
      cap *= 2;
    }
    const next = new Uint8Array(cap);
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
  }

  u8(value: number): this {
    this.ensure(1);
    this.buf[this.len++] = value & 0xff;
    return this;
  }

  u16(value: number): this {
    this.ensure(2);
    this.buf[this.len++] = (value >>> 8) & 0xff;
    this.buf[this.len++] = value & 0xff;
    return this;
  }

  /** 32-битное целое, big-endian. Годится и для знаковых значений IPP. */
  u32(value: number): this {
    this.ensure(4);
    this.buf[this.len++] = (value >>> 24) & 0xff;
    this.buf[this.len++] = (value >>> 16) & 0xff;
    this.buf[this.len++] = (value >>> 8) & 0xff;
    this.buf[this.len++] = value & 0xff;
    return this;
  }

  /** IEEE-754 float32, big-endian (нужен для заголовка PWG Raster). */
  f32(value: number): this {
    this.ensure(4);
    const tmp = new DataView(new ArrayBuffer(4));
    tmp.setFloat32(0, value, false);
    for (let i = 0; i < 4; i++) {
      this.buf[this.len++] = tmp.getUint8(i);
    }
    return this;
  }

  bytes(data: Uint8Array): this {
    this.ensure(data.length);
    this.buf.set(data, this.len);
    this.len += data.length;
    return this;
  }

  /** N нулевых байт — заполнение фиксированных полей. */
  zeros(count: number): this {
    this.ensure(count);
    this.len += count;
    return this;
  }

  /** UTF-8 строка без префикса длины. */
  utf8(text: string): this {
    return this.bytes(encodeUtf8(text));
  }

  /**
   * Строка, дополненная нулями до ровно `size` байт (C-строка фиксированной
   * длины из заголовка CUPS/PWG Raster). Длинные строки обрезаются.
   */
  cString(text: string, size: number): this {
    const raw = encodeUtf8(text);
    const take = Math.min(raw.length, size - 1);
    this.ensure(size);
    this.buf.set(raw.subarray(0, take), this.len);
    this.len += size;
    return this;
  }

  /** Копия записанных данных. */
  toBytes(): Uint8Array {
    return this.buf.slice(0, this.len);
  }
}

/** Читает big-endian поток с проверкой границ. */
export class ByteReader {
  private pos = 0;

  constructor(private readonly buf: Uint8Array) {}

  get offset(): number {
    return this.pos;
  }

  get remaining(): number {
    return this.buf.length - this.pos;
  }

  get eof(): boolean {
    return this.pos >= this.buf.length;
  }

  private need(count: number): void {
    if (this.pos + count > this.buf.length) {
      throw new RangeError(
        `Обрыв данных: нужно ${count} Б на смещении ${this.pos}, доступно ${this.remaining} Б`,
      );
    }
  }

  u8(): number {
    this.need(1);
    return this.buf[this.pos++]!;
  }

  u16(): number {
    this.need(2);
    return (this.buf[this.pos++]! << 8) | this.buf[this.pos++]!;
  }

  /** Беззнаковое 32-битное. */
  u32(): number {
    this.need(4);
    return (
      this.buf[this.pos++]! * 0x1000000 +
      ((this.buf[this.pos++]! << 16) | (this.buf[this.pos++]! << 8) | this.buf[this.pos++]!)
    );
  }

  /** Знаковое 32-битное (значения IPP типа `integer` могут быть отрицательными). */
  i32(): number {
    this.need(4);
    return (
      (this.buf[this.pos++]! << 24) |
      (this.buf[this.pos++]! << 16) |
      (this.buf[this.pos++]! << 8) |
      this.buf[this.pos++]!
    );
  }

  bytes(count: number): Uint8Array {
    this.need(count);
    const out = this.buf.subarray(this.pos, this.pos + count);
    this.pos += count;
    return out;
  }

  utf8(count: number): string {
    return decodeUtf8(this.bytes(count));
  }

  skip(count: number): void {
    this.need(count);
    this.pos += count;
  }
}

/** Строка JS -> UTF-8. Суррогатные пары сворачиваются в 4-байтовые последовательности. */
export function encodeUtf8(text: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let cp = text.charCodeAt(i);
    // Старший суррогат, за которым идёт младший — собираем полный code point.
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        cp = (cp - 0xd800) * 0x400 + (low - 0xdc00) + 0x10000;
        i++;
      }
    }
    if (cp < 0x80) {
      out.push(cp);
    } else if (cp < 0x800) {
      out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    } else if (cp < 0x10000) {
      out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      out.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    }
  }
  return new Uint8Array(out);
}

/** UTF-8 -> строка JS. Некорректные последовательности заменяются на U+FFFD. */
export function decodeUtf8(data: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < data.length) {
    const b0 = data[i]!;
    let cp: number;
    let size: number;
    if (b0 < 0x80) {
      cp = b0;
      size = 1;
    } else if ((b0 & 0xe0) === 0xc0) {
      cp = b0 & 0x1f;
      size = 2;
    } else if ((b0 & 0xf0) === 0xe0) {
      cp = b0 & 0x0f;
      size = 3;
    } else if ((b0 & 0xf8) === 0xf0) {
      cp = b0 & 0x07;
      size = 4;
    } else {
      out += '�';
      i++;
      continue;
    }
    if (i + size > data.length) {
      out += '�';
      break;
    }
    for (let k = 1; k < size; k++) {
      const bk = data[i + k]!;
      if ((bk & 0xc0) !== 0x80) {
        cp = -1;
        break;
      }
      cp = (cp << 6) | (bk & 0x3f);
    }
    i += size;
    if (cp < 0) {
      out += '�';
    } else if (cp > 0xffff) {
      cp -= 0x10000;
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    } else {
      out += String.fromCharCode(cp);
    }
  }
  return out;
}

/** Склеивает куски в один массив (сборка ответа из TCP-чанков). */
export function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) {
    total += c.length;
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** Ищет подпоследовательность `needle` в `hay` начиная с `from`; -1 если нет. */
export function indexOfBytes(hay: Uint8Array, needle: Uint8Array, from = 0): number {
  if (needle.length === 0) {
    return from;
  }
  const last = hay.length - needle.length;
  outer: for (let i = Math.max(0, from); i <= last; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) {
        continue outer;
      }
    }
    return i;
  }
  return -1;
}
