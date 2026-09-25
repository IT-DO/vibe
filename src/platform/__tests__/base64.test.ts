import {fromBase64, toBase64} from '../base64';

const bytes = (...values: number[]) => Uint8Array.from(values);

describe('base64 для моста Bluetooth', () => {
  it('совпадает с эталоном на известных строках', () => {
    // Примеры из RFC 4648 — проверка не кода самим собой, а внешним образцом.
    expect(toBase64(bytes(102))).toBe('Zg==');
    expect(toBase64(bytes(102, 111))).toBe('Zm8=');
    expect(toBase64(bytes(102, 111, 111))).toBe('Zm9v');
    expect(toBase64(bytes(102, 111, 111, 98))).toBe('Zm9vYg==');
    expect(toBase64(bytes(102, 111, 111, 98, 97))).toBe('Zm9vYmE=');
    expect(toBase64(bytes(102, 111, 111, 98, 97, 114))).toBe('Zm9vYmFy');
  });

  it('разбирает те же строки обратно', () => {
    expect(Array.from(fromBase64('Zg=='))).toEqual([102]);
    expect(Array.from(fromBase64('Zm8='))).toEqual([102, 111]);
    expect(Array.from(fromBase64('Zm9vYmFy'))).toEqual([102, 111, 111, 98, 97, 114]);
  });

  it('пустые данные не ломают ни кодирование, ни разбор', () => {
    expect(toBase64(new Uint8Array(0))).toBe('');
    expect(fromBase64('')).toHaveLength(0);
  });

  it('переносы строк от Android пропускаются', () => {
    // Base64.DEFAULT переносит каждые 76 символов — и в конце тоже.
    expect(Array.from(fromBase64('Zm9v\nYmFy\n'))).toEqual([102, 111, 111, 98, 97, 114]);
    expect(Array.from(fromBase64('Zm9v\r\nYmFy'))).toEqual([102, 111, 111, 98, 97, 114]);
    expect(Array.from(fromBase64(' Zm9v YmFy '))).toEqual([102, 111, 111, 98, 97, 114]);
  });

  it('все 256 значений байта проходят туда и обратно', () => {
    const all = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      all[i] = i;
    }
    expect(fromBase64(toBase64(all))).toEqual(all);
  });

  it('кадр протокола переживает мост без изменений', () => {
    // Настоящий кадр подтверждения рукопожатия — в нём есть и 0x7e, и 0x00.
    const frame = new Uint8Array(54);
    for (let i = 0; i < frame.length; i++) {
      frame[i] = (i * 37 + 11) & 0xff;
    }
    frame[0] = 0x7e;
    frame[frame.length - 1] = 0x7e;
    expect(fromBase64(toBase64(frame))).toEqual(frame);
  });

  it('длина любого куска сохраняется', () => {
    for (let size = 0; size < 40; size++) {
      const data = new Uint8Array(size).fill(0xab);
      expect(fromBase64(toBase64(data))).toHaveLength(size);
    }
  });

  it('кусок файла в 992 байта проходит целиком', () => {
    const chunk = new Uint8Array(992);
    for (let i = 0; i < chunk.length; i++) {
      chunk[i] = (i * 173) & 0xff;
    }
    expect(fromBase64(toBase64(chunk))).toEqual(chunk);
  });
});
