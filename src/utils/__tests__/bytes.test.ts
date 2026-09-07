import {
  ByteReader,
  ByteWriter,
  concatBytes,
  decodeUtf8,
  encodeUtf8,
  indexOfBytes,
} from '../bytes';

describe('UTF-8', () => {
  const samples = [
    '',
    'ipp/print',
    'Фото на память',
    'na_index-4x6_4x6in',
    'Ёжик — 🦔 в тумане',
    'Ⅷ ± ∞ ✓',
  ];

  it.each(samples)('кодирует и декодирует «%s» без потерь', text => {
    expect(decodeUtf8(encodeUtf8(text))).toBe(text);
  });

  it('кодирует кириллицу двумя байтами на символ', () => {
    expect(encodeUtf8('Фото')).toHaveLength(8);
  });

  it('кодирует эмодзи (суррогатную пару) четырьмя байтами', () => {
    expect(encodeUtf8('🦔')).toEqual(new Uint8Array([0xf0, 0x9f, 0xa6, 0x94]));
  });

  it('заменяет битую последовательность на U+FFFD, а не падает', () => {
    expect(decodeUtf8(new Uint8Array([0xff, 0x41]))).toBe('�A');
  });
});

describe('ByteWriter / ByteReader', () => {
  it('пишет и читает big-endian целые', () => {
    const bytes = new ByteWriter().u8(0x12).u16(0x3456).u32(0x789abcde).toBytes();
    expect(Array.from(bytes)).toEqual([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde]);

    const r = new ByteReader(bytes);
    expect(r.u8()).toBe(0x12);
    expect(r.u16()).toBe(0x3456);
    expect(r.u32()).toBe(0x789abcde);
    expect(r.eof).toBe(true);
  });

  it('u32 читает значения выше 2^31 без ухода в минус', () => {
    const bytes = new ByteWriter().u32(0xfffffff0).toBytes();
    expect(new ByteReader(bytes).u32()).toBe(0xfffffff0);
  });

  it('i32 читает отрицательные значения (integer в IPP знаковый)', () => {
    const bytes = new ByteWriter().u32(-5).toBytes();
    expect(new ByteReader(bytes).i32()).toBe(-5);
  });

  it('растит буфер при записи больше начальной ёмкости', () => {
    const w = new ByteWriter(4);
    for (let i = 0; i < 1000; i++) {
      w.u8(i & 0xff);
    }
    expect(w.length).toBe(1000);
    expect(w.toBytes()[999]).toBe(999 & 0xff);
  });

  it('cString дополняет нулями до фиксированной длины', () => {
    const bytes = new ByteWriter().cString('PwgRaster', 16).toBytes();
    expect(bytes).toHaveLength(16);
    expect(decodeUtf8(bytes.subarray(0, 9))).toBe('PwgRaster');
    expect(Array.from(bytes.subarray(9))).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('cString обрезает слишком длинную строку, оставляя место под ноль', () => {
    const bytes = new ByteWriter().cString('abcdefghij', 4).toBytes();
    expect(Array.from(bytes)).toEqual([0x61, 0x62, 0x63, 0x00]);
  });

  it('f32 пишет IEEE-754 big-endian', () => {
    // 1.0f => 0x3F800000
    expect(Array.from(new ByteWriter().f32(1).toBytes())).toEqual([0x3f, 0x80, 0, 0]);
  });

  it('чтение за границей буфера бросает понятную ошибку', () => {
    const r = new ByteReader(new Uint8Array([1, 2]));
    r.u8();
    expect(() => r.u32()).toThrow(RangeError);
  });
});

describe('вспомогательные операции над байтами', () => {
  it('concatBytes склеивает куски по порядку', () => {
    const out = concatBytes([new Uint8Array([1, 2]), new Uint8Array([]), new Uint8Array([3])]);
    expect(Array.from(out)).toEqual([1, 2, 3]);
  });

  it('indexOfBytes находит подпоследовательность', () => {
    const hay = encodeUtf8('HTTP/1.1 200 OK\r\n\r\nbody');
    expect(indexOfBytes(hay, encodeUtf8('\r\n\r\n'))).toBe(15);
  });

  it('indexOfBytes возвращает -1, когда совпадения нет', () => {
    expect(indexOfBytes(new Uint8Array([1, 2, 3]), new Uint8Array([2, 4]))).toBe(-1);
  });

  it('indexOfBytes уважает начальное смещение', () => {
    const hay = new Uint8Array([1, 2, 1, 2]);
    expect(indexOfBytes(hay, new Uint8Array([1, 2]), 1)).toBe(2);
  });
});
