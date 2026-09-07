/**
 * Base64 без глобальных `btoa`/`atob` — в Hermes их нет.
 *
 * Через эти функции проходят все снимки: `react-native-fs` умеет писать
 * бинарные файлы только из base64-строки. Ошибка здесь испортила бы каждый
 * отпечаток, поэтому код отделён от файловой обёртки и покрыт тестами.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Обратная таблица: код символа -> его значение. */
const LOOKUP = new Int16Array(128).fill(-1);
for (let i = 0; i < ALPHABET.length; i++) {
  LOOKUP[ALPHABET.charCodeAt(i)] = i;
}

/** Байты -> base64. */
export function encodeBase64(data: Uint8Array): string {
  let out = '';
  let i = 0;

  // Основной цикл по полным тройкам байт.
  for (; i + 2 < data.length; i += 3) {
    const triple = (data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!;
    out +=
      ALPHABET[(triple >> 18) & 0x3f]! +
      ALPHABET[(triple >> 12) & 0x3f]! +
      ALPHABET[(triple >> 6) & 0x3f]! +
      ALPHABET[triple & 0x3f]!;
  }

  // Хвост: один или два байта дополняются знаками «=».
  const remaining = data.length - i;
  if (remaining === 1) {
    const b0 = data[i]!;
    out += ALPHABET[b0 >> 2]! + ALPHABET[(b0 & 0x03) << 4]! + '==';
  } else if (remaining === 2) {
    const b0 = data[i]!;
    const b1 = data[i + 1]!;
    out +=
      ALPHABET[b0 >> 2]! +
      ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)]! +
      ALPHABET[(b1 & 0x0f) << 2]! +
      '=';
  }

  return out;
}

/** Base64 -> байты. Пробелы, переводы строк и «=» игнорируются. */
export function decodeBase64(text: string): Uint8Array {
  // Считаем значимые символы, чтобы выделить буфер сразу нужного размера.
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 128 && LOOKUP[code]! >= 0) {
      count++;
    }
  }

  const out = new Uint8Array((count * 3) >> 2);
  let accumulator = 0;
  let bits = 0;
  let at = 0;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const value = code < 128 ? LOOKUP[code]! : -1;
    if (value < 0) {
      continue;
    }
    accumulator = (accumulator << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[at++] = (accumulator >> bits) & 0xff;
    }
  }

  return out.subarray(0, at);
}
