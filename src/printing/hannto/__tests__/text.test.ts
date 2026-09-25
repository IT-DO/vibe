import {decodeUtf8, encodeUtf8} from '../text';

describe('UTF-8 для канала принтера', () => {
  it('латиница — байт в байт', () => {
    expect(Array.from(encodeUtf8('ok'))).toEqual([0x6f, 0x6b]);
    expect(decodeUtf8(Uint8Array.from([0x6f, 0x6b]))).toBe('ok');
  });

  it('кириллица не теряется — иначе ошибку принтера не прочитать', () => {
    const text = 'нет бумаги';
    expect(decodeUtf8(encodeUtf8(text))).toBe(text);
    // По два байта на букву: наивный «charCodeAt & 0xff» дал бы по одному.
    expect(encodeUtf8('нет').length).toBe(6);
  });

  it('настоящая команда протокола кодируется однобайтово', () => {
    const json = '{"method":"mixed_status","id":4,"params":{}}';
    expect(encodeUtf8(json)).toHaveLength(json.length);
    expect(decodeUtf8(encodeUtf8(json))).toBe(json);
  });

  it('туда и обратно для смеси алфавитов и знаков', () => {
    for (const text of [
      '',
      'Фото на память',
      'Ошибка 0x21: крышка открыта',
      '中文 テスト',
      'эмодзи 📷 и 🖨',
      '{"job_state":"finished","задание":15}',
    ]) {
      expect(decodeUtf8(encodeUtf8(text))).toBe(text);
    }
  });

  it('хвостовые нули — дополнение шифра, а не данные', () => {
    const padded = new Uint8Array(16);
    padded.set(encodeUtf8('ok'));
    expect(decodeUtf8(padded)).toBe('ok');
  });

  it('нули внутри текста не обрезают его раньше времени', () => {
    const bytes = Uint8Array.from([0x61, 0x00, 0x62]);
    expect(decodeUtf8(bytes)).toBe('a\u0000b');
  });

  it('сбойный байт не роняет разбор', () => {
    expect(decodeUtf8(Uint8Array.from([0x61, 0xff, 0x62]))).toBe('a�b');
    expect(decodeUtf8(Uint8Array.from([0xd0]))).toBe('�');
  });

  it('длина в байтах, а не в символах — от неё зависит размер кадра', () => {
    expect(encodeUtf8('фото').length).toBe(8);
    expect(encodeUtf8('📷').length).toBe(4);
  });
});
