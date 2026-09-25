/**
 * UTF-8 для протокола принтера.
 *
 * Почему свой, а не `TextEncoder`: в Hermes его нет без полифила, а текст
 * ходит в обе стороны по каналу, который нельзя испортить. Наивное
 * `charCodeAt() & 0xff` работает только для латиницы и молча портит всё
 * остальное — сообщение принтера об ошибке пришло бы нечитаемым как раз
 * тогда, когда его нужнее всего прочитать.
 */

/** Текст в байты UTF-8. */
export function encodeUtf8(text: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);

    // Суррогатная пара — один символ за пределами базовой плоскости.
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
        i++;
      }
    }

    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return Uint8Array.from(out);
}

/**
 * Байты UTF-8 в текст.
 *
 * Хвостовые нули отбрасываются: блочный шифр дополняет ими тело кадра,
 * и это дополнение, а не данные. Испорченные последовательности заменяются
 * на «�» — разговор с принтером не должен падать из-за одного сбойного байта.
 */
export function decodeUtf8(bytes: Uint8Array): string {
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) {
    end--;
  }

  let text = '';
  let i = 0;
  while (i < end) {
    const byte = bytes[i]!;
    let code: number;
    let size: number;

    if (byte < 0x80) {
      code = byte;
      size = 1;
    } else if ((byte & 0xe0) === 0xc0) {
      code = byte & 0x1f;
      size = 2;
    } else if ((byte & 0xf0) === 0xe0) {
      code = byte & 0x0f;
      size = 3;
    } else if ((byte & 0xf8) === 0xf0) {
      code = byte & 0x07;
      size = 4;
    } else {
      text += '�';
      i++;
      continue;
    }

    if (i + size > end) {
      text += '�';
      break;
    }

    let valid = true;
    for (let k = 1; k < size; k++) {
      const next = bytes[i + k]!;
      if ((next & 0xc0) !== 0x80) {
        valid = false;
        break;
      }
      code = (code << 6) | (next & 0x3f);
    }

    if (!valid) {
      text += '�';
      i++;
      continue;
    }

    i += size;
    if (code > 0xffff) {
      code -= 0x10000;
      text += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
    } else {
      text += String.fromCharCode(code);
    }
  }
  return text;
}
