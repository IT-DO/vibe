/**
 * Рукопожатие с принтером: выработка общего ключа по Диффи — Хеллману.
 *
 * Ключ не хранится ни в приложении, ни в устройстве — он вырабатывается
 * заново при каждом подключении. Это важное следствие: печатать может любой,
 * кто дотянулся до принтера по Bluetooth, никакие токены и учётные записи
 * не нужны.
 *
 * У прошивки есть особенность, без которой ничего не сходится: большие числа
 * передаются не двоичными, а как строка шестнадцатеричных цифр в ASCII.
 * То есть байты `45 36 39 36` — это символы «E696», а значит число 0xE696.
 * Из-за этого 16-байтное поле несёт всего 64 бита.
 */

import {encryptEcb} from './aes';
import {
  Channel,
  Encoding,
  Interactive,
  buildFrame,
} from './frames';

/** Длина тела «привета» от принтера: G(4) + P(16) + RA(16). */
export const SERVER_HELLO_SIZE = 36;

/** Размер выработанного ключа. */
export const KEY_SIZE = 16;

const ASCII_ZERO = 0x30;

/** Число из ASCII-записи шестнадцатеричных цифр. */
export function hexAsciiToInt(bytes: Uint8Array): bigint {
  let text = '';
  for (const byte of bytes) {
    if (byte === 0) {
      break; // хвостовые нули — дополнение, а не цифры
    }
    text += String.fromCharCode(byte);
  }
  if (!/^[0-9a-fA-F]+$/.test(text)) {
    throw new Error(`Ожидались шестнадцатеричные цифры, пришло «${text}»`);
  }
  return BigInt('0x' + text);
}

/** Обратное преобразование: число в ASCII-запись заглавными буквами. */
export function intToHexAscii(value: bigint): Uint8Array {
  const text = value.toString(16).toUpperCase();
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    out[i] = text.charCodeAt(i);
  }
  return out;
}

/** Выравнивает вправо в 16 байтах, дополняя слева символом «0». */
export function padFront(source: Uint8Array): Uint8Array {
  const out = new Uint8Array(16).fill(ASCII_ZERO);
  out.set(source.subarray(0, 16), Math.max(0, 16 - source.length));
  return out;
}

/** Выравнивает влево в 16 байтах, дополняя справа нулевыми байтами. */
export function padEnd(source: Uint8Array): Uint8Array {
  const out = new Uint8Array(16);
  out.set(source.subarray(0, 16));
  return out;
}

/** Возведение в степень по модулю — основа Диффи — Хеллмана. */
export function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n;
  let b = base % modulus;
  let e = exponent;
  while (e > 0n) {
    if (e & 1n) {
      result = (result * b) % modulus;
    }
    b = (b * b) % modulus;
    e >>= 1n;
  }
  return result;
}

export interface ServerHello {
  readonly g: bigint;
  readonly p: bigint;
  readonly ra: bigint;
  /** Исходные байты модуля — принтер ждёт их обратно зашифрованными. */
  readonly pBytes: Uint8Array;
}

/** Разбирает «привет» принтера. */
export function parseServerHello(body: Uint8Array): ServerHello {
  if (body.length < SERVER_HELLO_SIZE) {
    throw new Error(
      `Ответ принтера ${body.length} байт вместо ${SERVER_HELLO_SIZE}`,
    );
  }
  const pBytes = body.slice(4, 20);
  return {
    g: hexAsciiToInt(body.slice(0, 4)),
    p: hexAsciiToInt(pBytes),
    ra: hexAsciiToInt(body.slice(20, 36)),
    pBytes,
  };
}

export interface Confirmation {
  /** Тело ответного кадра: наша половина ключа и проверочное значение. */
  readonly body: Uint8Array;
  /** Общий ключ сессии. */
  readonly key: Uint8Array;
  /** Секрет — нужен только тестам и разбору журналов. */
  readonly secret: bigint;
}

/**
 * Вычисляет общий ключ и собирает подтверждение.
 *
 * @param hello   разобранный ответ принтера
 * @param secret  наш секрет; задаётся только в тестах, иначе случайный
 */
export function computeConfirmation(hello: ServerHello, secret?: bigint): Confirmation {
  const b = secret ?? randomSecret(hello.p);
  const rb = modPow(hello.g, b, hello.p);
  const shared = modPow(hello.ra, b, hello.p);

  // Наша половина: выравнивание слева нулями-символами, как ждёт прошивка.
  let rbBytes = intToHexAscii(rb);
  if (rbBytes.length < 16) {
    rbBytes = padFront(rbBytes);
  }

  // Ключ: та же запись, но дополненная справа нулевыми байтами.
  let keyBytes = intToHexAscii(shared);
  if (keyBytes.length < 16) {
    keyBytes = padEnd(keyBytes);
  }
  const key = keyBytes.slice(0, KEY_SIZE);

  // Принтер проверяет нас тем, что мы вернём его же модуль под шифром.
  const proof = encryptEcb(key, hello.pBytes).slice(0, 16);

  const body = new Uint8Array(32);
  body.set(rbBytes.subarray(0, 16));
  body.set(proof, 16);

  return {body, key, secret: b};
}

/** Случайный секрет в диапазоне, который принимает прошивка. */
function randomSecret(p: bigint): bigint {
  const bytes = new Uint8Array(8);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte);
  }
  // 2 < b < p — требование протокола.
  return (value % (p - 4n)) + 2n;
}

/** Кадр «привета», с которого начинается разговор. */
export function buildHello(sequence: number): Uint8Array {
  const body = new Uint8Array([0x68, 0x65, 0x6c, 0x6c, 0x6f]); // "hello"
  return buildFrame({
    channel: Channel.auth,
    interactive: Interactive.clientHello,
    encoding: Encoding.json,
    sequence,
    message: sequence,
    body,
    encrypted: true,
  });
}

/** Кадр подтверждения с нашей половиной ключа. */
export function buildConfirm(sequence: number, confirmation: Confirmation): Uint8Array {
  return buildFrame({
    channel: Channel.auth,
    interactive: Interactive.clientConfirm,
    encoding: Encoding.json,
    sequence,
    message: sequence,
    body: confirmation.body,
    encrypted: true,
  });
}
