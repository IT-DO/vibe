import {decodeBase64, encodeBase64} from '../base64';

/** Эталонные векторы из RFC 4648 §10. */
const RFC_VECTORS: [string, string][] = [
  ['', ''],
  ['f', 'Zg=='],
  ['fo', 'Zm8='],
  ['foo', 'Zm9v'],
  ['foob', 'Zm9vYg=='],
  ['fooba', 'Zm9vYmE='],
  ['foobar', 'Zm9vYmFy'],
];

const bytesOf = (ascii: string) =>
  Uint8Array.from([...ascii].map(c => c.charCodeAt(0)));

describe('encodeBase64', () => {
  it.each(RFC_VECTORS)('кодирует «%s» как «%s»', (input, expected) => {
    expect(encodeBase64(bytesOf(input))).toBe(expected);
  });

  it('правильно дополняет хвост из одного байта', () => {
    expect(encodeBase64(new Uint8Array([0x00]))).toBe('AA==');
    expect(encodeBase64(new Uint8Array([0xff]))).toBe('/w==');
  });

  it('правильно дополняет хвост из двух байт', () => {
    expect(encodeBase64(new Uint8Array([0xff, 0xff]))).toBe('//8=');
  });

  it('кодирует старший бит без потерь', () => {
    expect(encodeBase64(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('/9j/4A==');
  });

  it('длина результата кратна четырём', () => {
    for (let n = 0; n < 20; n++) {
      expect(encodeBase64(new Uint8Array(n)).length % 4).toBe(0);
    }
  });
});

describe('decodeBase64', () => {
  it.each(RFC_VECTORS)('декодирует «%s» обратно в «%s»', (expected, input) => {
    expect(decodeBase64(input)).toEqual(bytesOf(expected));
  });

  it('игнорирует переводы строк и пробелы', () => {
    expect(decodeBase64('Zm9v\nYmFy')).toEqual(bytesOf('foobar'));
    expect(decodeBase64('Zm9v YmFy')).toEqual(bytesOf('foobar'));
  });

  it('работает без знаков дополнения', () => {
    expect(decodeBase64('Zg')).toEqual(bytesOf('f'));
    expect(decodeBase64('Zm8')).toEqual(bytesOf('fo'));
  });
});

describe('полный цикл', () => {
  it('сохраняет все 256 значений байта', () => {
    const all = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      all[i] = i;
    }
    expect(decodeBase64(encodeBase64(all))).toEqual(all);
  });

  it('сохраняет данные любой длины', () => {
    for (let length = 0; length < 100; length++) {
      const data = new Uint8Array(length);
      for (let i = 0; i < length; i++) {
        data[i] = (i * 37 + length * 11) & 0xff;
      }
      expect(decodeBase64(encodeBase64(data))).toEqual(data);
    }
  });

  it('переживает объём настоящего снимка', () => {
    // 2,4 МБ — типичный JPEG листа 10×15.
    const data = new Uint8Array(2_400_000);
    for (let i = 0; i < data.length; i += 997) {
      data[i] = i & 0xff;
    }
    const roundTrip = decodeBase64(encodeBase64(data));
    expect(roundTrip.length).toBe(data.length);
    // Побайтовое сравнение вручную: toEqual на таком массиве слишком медленный.
    let identical = true;
    for (let i = 0; i < data.length && identical; i++) {
      identical = roundTrip[i] === data[i];
    }
    expect(identical).toBe(true);
  });
});
