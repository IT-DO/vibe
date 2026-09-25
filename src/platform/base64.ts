/**
 * Base64 для моста в нативный модуль Bluetooth.
 *
 * Классический Bluetooth в React Native передаёт двоичные данные через мост
 * строкой base64 — иначе байты выше 0x7F портятся. Полифила `Buffer` в
 * Hermes нет, и тянуть его ради двух функций незачем, поэтому кодек свой:
 * чистый, без зависимостей, проверяемый теми же тестами, что и остальной
 * тракт печати.
 *
 * Важная мелочь: Android кодирует с `Base64.DEFAULT`, а тот переносит строку
 * каждые 76 символов. Декодер обязан такие переносы пропускать, иначе первый
 * же большой ответ принтера развалится.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Обратная таблица: код символа -> его значение. 255 — символ недопустим. */
const REVERSE = (() => {
  const table = new Uint8Array(256).fill(255);
  for (let i = 0; i < ALPHABET.length; i++) {
    table[ALPHABET.charCodeAt(i)] = i;
  }
  return table;
})();

/** Байты в строку base64. */
export function toBase64(bytes: Uint8Array): string {
  let out = '';
  let i = 0;

  for (; i + 2 < bytes.length; i += 3) {
    const triple = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out +=
      ALPHABET[(triple >> 18) & 63]! +
      ALPHABET[(triple >> 12) & 63]! +
      ALPHABET[(triple >> 6) & 63]! +
      ALPHABET[triple & 63]!;
  }

  const rest = bytes.length - i;
  if (rest === 1) {
    const value = bytes[i]! << 16;
    out += ALPHABET[(value >> 18) & 63]! + ALPHABET[(value >> 12) & 63]! + '==';
  } else if (rest === 2) {
    const value = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out +=
      ALPHABET[(value >> 18) & 63]! +
      ALPHABET[(value >> 12) & 63]! +
      ALPHABET[(value >> 6) & 63]! +
      '=';
  }
  return out;
}

/**
 * Строка base64 в байты.
 *
 * Пробелы, переносы строк и дополняющие «=» пропускаются: то, что приходит
 * с Android, форматировано переносами, а хвост обрезать по длине надёжнее,
 * чем доверять их числу.
 */
export function fromBase64(text: string): Uint8Array {
  const out = new Uint8Array(((text.length + 3) >> 2) * 3);
  let length = 0;
  let accumulator = 0;
  let bits = 0;

  for (let i = 0; i < text.length; i++) {
    const value = REVERSE[text.charCodeAt(i)];
    if (value === undefined || value === 255) {
      continue; // перенос строки, пробел, «=» или мусор
    }
    accumulator = (accumulator << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[length++] = (accumulator >> bits) & 0xff;
    }
  }
  return out.subarray(0, length);
}
