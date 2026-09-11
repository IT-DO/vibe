import {ByteReader, decodeUtf8} from '../../../utils/bytes';
import {DelimiterTag, Operation, StatusCode, ValueTag} from '../constants';
import {
  attrNumber,
  attrString,
  attrStrings,
  decodeResponse,
  encodeRequest,
  findAttribute,
  type IppCollection,
  type IppResolution,
} from '../message';
import {
  attr,
  bool,
  extraValue,
  int32,
  message,
  resolution,
  responseHeader,
  text,
} from './fixtures';

describe('encodeRequest', () => {
  it('пишет заголовок сообщения по RFC 8010', () => {
    const bytes = encodeRequest({
      operation: Operation.GetPrinterAttributes,
      requestId: 42,
      groups: [],
    });

    const r = new ByteReader(bytes);
    expect(r.u8()).toBe(2); // version major
    expect(r.u8()).toBe(0); // version minor
    expect(r.u16()).toBe(Operation.GetPrinterAttributes);
    expect(r.u32()).toBe(42);
    expect(r.u8()).toBe(DelimiterTag.EndOfAttributes);
    expect(r.eof).toBe(true);
  });

  it('кодирует атрибут как тег + имя + значение с префиксами длины', () => {
    const bytes = encodeRequest({
      operation: Operation.GetPrinterAttributes,
      requestId: 1,
      groups: [
        {
          tag: DelimiterTag.OperationAttributes,
          attributes: [
            {name: 'attributes-charset', values: ['utf-8'], tag: ValueTag.Charset},
          ],
        },
      ],
    });

    const r = new ByteReader(bytes);
    r.skip(8); // заголовок
    expect(r.u8()).toBe(DelimiterTag.OperationAttributes);
    expect(r.u8()).toBe(ValueTag.Charset);
    const nameLen = r.u16();
    expect(nameLen).toBe('attributes-charset'.length);
    expect(r.utf8(nameLen)).toBe('attributes-charset');
    const valueLen = r.u16();
    expect(valueLen).toBe(5);
    expect(r.utf8(valueLen)).toBe('utf-8');
  });

  it('дополнительные значения атрибута идут с нулевой длиной имени', () => {
    const bytes = encodeRequest({
      operation: Operation.GetPrinterAttributes,
      requestId: 1,
      groups: [
        {
          tag: DelimiterTag.OperationAttributes,
          attributes: [
            {
              name: 'requested-attributes',
              values: ['printer-state', 'media-supported'],
              tag: ValueTag.Keyword,
            },
          ],
        },
      ],
    });

    const r = new ByteReader(bytes);
    r.skip(8);
    r.u8(); // разделитель группы
    r.u8(); // тег первого значения
    r.skip(r.u16()); // имя
    r.skip(r.u16()); // значение
    expect(r.u8()).toBe(ValueTag.Keyword);
    expect(r.u16()).toBe(0); // второе значение — без имени
    expect(r.utf8(r.u16())).toBe('media-supported');
  });

  it('прикладывает тело документа после end-of-attributes', () => {
    const doc = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]); // начало JPEG
    const bytes = encodeRequest({
      operation: Operation.PrintJob,
      requestId: 7,
      groups: [],
      data: doc,
    });
    expect(Array.from(bytes.subarray(-4))).toEqual([0xff, 0xd8, 0xff, 0xe0]);
    expect(bytes[bytes.length - 5]).toBe(DelimiterTag.EndOfAttributes);
  });

  it('кодирует resolution как 4+4+1 байт', () => {
    const bytes = encodeRequest({
      operation: Operation.PrintJob,
      requestId: 1,
      groups: [
        {
          tag: DelimiterTag.JobAttributes,
          attributes: [
            {
              name: 'printer-resolution',
              values: [{kind: 'resolution', x: 300, y: 300, units: 3}],
            },
          ],
        },
      ],
    });
    const r = new ByteReader(bytes);
    r.skip(8);
    r.u8();
    expect(r.u8()).toBe(ValueTag.Resolution);
    r.skip(r.u16());
    expect(r.u16()).toBe(9);
    expect(r.u32()).toBe(300);
    expect(r.u32()).toBe(300);
    expect(r.u8()).toBe(3);
  });

  it('boolean занимает один байт', () => {
    const bytes = encodeRequest({
      operation: Operation.PrintJob,
      requestId: 1,
      groups: [
        {
          tag: DelimiterTag.OperationAttributes,
          attributes: [{name: 'ipp-attribute-fidelity', values: [false]}],
        },
      ],
    });
    const r = new ByteReader(bytes);
    r.skip(8);
    r.u8();
    expect(r.u8()).toBe(ValueTag.Boolean);
    r.skip(r.u16());
    expect(r.u16()).toBe(1);
    expect(r.u8()).toBe(0);
  });

  it('пропускает атрибуты без значений', () => {
    const bytes = encodeRequest({
      operation: Operation.GetPrinterAttributes,
      requestId: 1,
      groups: [
        {
          tag: DelimiterTag.OperationAttributes,
          attributes: [{name: 'media', values: []}],
        },
      ],
    });
    // Заголовок (8) + тег группы (1) + end-of-attributes (1).
    expect(bytes).toHaveLength(10);
  });
});

describe('decodeResponse', () => {
  it('разбирает ответ, собранный побайтово по спецификации', () => {
    const raw = message(
      responseHeader(StatusCode.SuccessfulOk, 11),
      new Uint8Array([DelimiterTag.OperationAttributes]),
      attr(ValueTag.Charset, 'attributes-charset', text('utf-8')),
      attr(ValueTag.NaturalLanguage, 'attributes-natural-language', text('en')),
      new Uint8Array([DelimiterTag.PrinterAttributes]),
      attr(ValueTag.NameWithoutLanguage, 'printer-name', text('Xiaomi Photo Printer 1S')),
      attr(ValueTag.Enum, 'printer-state', int32(3)),
      attr(ValueTag.Keyword, 'printer-state-reasons', text('none')),
      attr(ValueTag.Keyword, 'media-supported', text('na_index-4x6_4x6in')),
      extraValue(ValueTag.Keyword, text('om_photo-3x3_76.2x76.2mm')),
      attr(ValueTag.MimeMediaType, 'document-format-supported', text('image/jpeg')),
      extraValue(ValueTag.MimeMediaType, text('image/pwg-raster')),
      attr(ValueTag.Resolution, 'printer-resolution-supported', resolution(300, 300)),
      attr(ValueTag.Integer, 'queued-job-count', int32(0)),
      attr(ValueTag.Boolean, 'color-supported', bool(true)),
      new Uint8Array([DelimiterTag.EndOfAttributes]),
    );

    const response = decodeResponse(raw);

    expect(response.versionMajor).toBe(2);
    expect(response.statusCode).toBe(StatusCode.SuccessfulOk);
    expect(response.requestId).toBe(11);
    expect(response.groups).toHaveLength(2);
    expect(attrString(response, 'printer-name')).toBe('Xiaomi Photo Printer 1S');
    expect(attrNumber(response, 'printer-state')).toBe(3);
    expect(attrStrings(response, 'media-supported')).toEqual([
      'na_index-4x6_4x6in',
      'om_photo-3x3_76.2x76.2mm',
    ]);
    expect(attrStrings(response, 'document-format-supported')).toEqual([
      'image/jpeg',
      'image/pwg-raster',
    ]);
    expect(findAttribute(response, 'color-supported')[0]).toBe(true);

    const res = findAttribute(response, 'printer-resolution-supported')[0] as IppResolution;
    expect(res).toEqual({kind: 'resolution', x: 300, y: 300, units: 3});
  });

  it('переносит код ошибки без исключения', () => {
    const raw = message(
      responseHeader(StatusCode.ClientErrorDocumentFormatNotSupported, 3),
      new Uint8Array([DelimiterTag.OperationAttributes]),
      attr(ValueTag.TextWithoutLanguage, 'status-message', text('unsupported format')),
      new Uint8Array([DelimiterTag.EndOfAttributes]),
    );
    const response = decodeResponse(raw);
    expect(response.statusCode).toBe(StatusCode.ClientErrorDocumentFormatNotSupported);
    expect(attrString(response, 'status-message')).toBe('unsupported format');
  });

  it('разбирает textWithLanguage, отбрасывая язык', () => {
    // Значение: длина языка + язык + длина текста + текст.
    const value = message(
      new Uint8Array([0, 5]),
      text('en-us'),
      new Uint8Array([0, 5]),
      text('Ready'),
    );
    const raw = message(
      responseHeader(StatusCode.SuccessfulOk, 1),
      new Uint8Array([DelimiterTag.PrinterAttributes]),
      attr(ValueTag.TextWithLanguage, 'printer-state-message', value),
      new Uint8Array([DelimiterTag.EndOfAttributes]),
    );
    expect(attrString(decodeResponse(raw), 'printer-state-message')).toBe('Ready');
  });

  it('разбирает коллекцию media-col (RFC 3382)', () => {
    // begCollection -> memberAttrName "media-size" -> вложенная коллекция
    // с x-dimension/y-dimension -> endCollection.
    const inner = message(
      new Uint8Array([ValueTag.MemberAttrName, 0, 0, 0, 11]),
      text('x-dimension'),
      new Uint8Array([ValueTag.Integer, 0, 0, 0, 4]),
      int32(10160),
      new Uint8Array([ValueTag.MemberAttrName, 0, 0, 0, 11]),
      text('y-dimension'),
      new Uint8Array([ValueTag.Integer, 0, 0, 0, 4]),
      int32(15240),
      new Uint8Array([ValueTag.EndCollection, 0, 0, 0, 0]),
    );
    const outer = message(
      new Uint8Array([ValueTag.MemberAttrName, 0, 0, 0, 10]),
      text('media-size'),
      new Uint8Array([ValueTag.BegCollection, 0, 0, 0, 0]),
      inner,
      new Uint8Array([ValueTag.EndCollection, 0, 0, 0, 0]),
    );
    const raw = message(
      responseHeader(StatusCode.SuccessfulOk, 1),
      new Uint8Array([DelimiterTag.PrinterAttributes]),
      new Uint8Array([ValueTag.BegCollection, 0, 15]),
      text('media-col-ready'),
      new Uint8Array([0, 0]),
      outer,
      new Uint8Array([DelimiterTag.EndOfAttributes]),
    );

    const response = decodeResponse(raw);
    const col = findAttribute(response, 'media-col-ready')[0] as IppCollection;
    expect(col.kind).toBe('collection');
    const size = col.members['media-size']?.[0] as IppCollection;
    expect(size.members['x-dimension']).toEqual([10160]);
    expect(size.members['y-dimension']).toEqual([15240]);
  });

  it('переживает пустое сообщение без атрибутов', () => {
    const raw = message(
      responseHeader(StatusCode.SuccessfulOk, 5),
      new Uint8Array([DelimiterTag.EndOfAttributes]),
    );
    const response = decodeResponse(raw);
    expect(response.groups).toHaveLength(0);
    expect(response.statusCode).toBe(StatusCode.SuccessfulOk);
  });
});

describe('encode -> decode', () => {
  it('сохраняет строки, числа и булевы значения', () => {
    const encoded = encodeRequest({
      operation: Operation.PrintJob,
      requestId: 99,
      groups: [
        {
          tag: DelimiterTag.OperationAttributes,
          attributes: [
            {name: 'job-name', values: ['Фото на память #12'], tag: ValueTag.NameWithoutLanguage},
            {name: 'ipp-attribute-fidelity', values: [false]},
          ],
        },
        {
          tag: DelimiterTag.JobAttributes,
          attributes: [
            {name: 'copies', values: [2], tag: ValueTag.Integer},
            {name: 'media', values: ['na_index-4x6_4x6in'], tag: ValueTag.Keyword},
          ],
        },
      ],
    });

    // Формат запроса и ответа одинаковый, отличается только поле статуса.
    const decoded = decodeResponse(encoded);
    expect(decoded.requestId).toBe(99);
    expect(attrString(decoded, 'job-name')).toBe('Фото на память #12');
    expect(attrNumber(decoded, 'copies')).toBe(2);
    expect(attrString(decoded, 'media')).toBe('na_index-4x6_4x6in');
    expect(findAttribute(decoded, 'ipp-attribute-fidelity')[0]).toBe(false);
  });

  it('сохраняет кириллицу в имени задания', () => {
    const name = 'Свадьба Ани и Пети — гость №7';
    const encoded = encodeRequest({
      operation: Operation.PrintJob,
      requestId: 1,
      groups: [
        {
          tag: DelimiterTag.OperationAttributes,
          attributes: [{name: 'job-name', values: [name], tag: ValueTag.NameWithoutLanguage}],
        },
      ],
    });
    expect(attrString(decodeResponse(encoded), 'job-name')).toBe(name);
  });

  it('сохраняет коллекцию через полный цикл', () => {
    const encoded = encodeRequest({
      operation: Operation.PrintJob,
      requestId: 1,
      groups: [
        {
          tag: DelimiterTag.JobAttributes,
          attributes: [
            {
              name: 'media-col',
              values: [
                {
                  kind: 'collection',
                  members: {
                    'media-size': [
                      {
                        kind: 'collection',
                        members: {'x-dimension': [10160], 'y-dimension': [15240]},
                      },
                    ],
                    'media-type': ['photographic-glossy'],
                  },
                },
              ],
            },
          ],
        },
      ],
    });

    const col = findAttribute(decodeResponse(encoded), 'media-col')[0] as IppCollection;
    const size = col.members['media-size']?.[0] as IppCollection;
    expect(size.members['x-dimension']).toEqual([10160]);
    expect(col.members['media-type']).toEqual(['photographic-glossy']);
  });

  it('не портит бинарные данные документа', () => {
    const doc = new Uint8Array(512);
    for (let i = 0; i < doc.length; i++) {
      doc[i] = (i * 7) & 0xff;
    }
    const encoded = encodeRequest({
      operation: Operation.PrintJob,
      requestId: 1,
      groups: [],
      data: doc,
    });
    expect(Array.from(decodeResponse(encoded).data)).toEqual(Array.from(doc));
  });
});

describe('вспомогательные геттеры', () => {
  const raw = message(
    responseHeader(StatusCode.SuccessfulOk, 1),
    new Uint8Array([DelimiterTag.PrinterAttributes]),
    attr(ValueTag.Keyword, 'media-supported', text('na_index-4x6_4x6in')),
    new Uint8Array([DelimiterTag.EndOfAttributes]),
  );
  const response = decodeResponse(raw);

  it('возвращают undefined для отсутствующего атрибута', () => {
    expect(attrString(response, 'нет-такого')).toBeUndefined();
    expect(attrNumber(response, 'нет-такого')).toBeUndefined();
    expect(attrStrings(response, 'нет-такого')).toEqual([]);
    expect(findAttribute(response, 'нет-такого')).toEqual([]);
  });

  it('attrNumber не возвращает строку, пришедшую вместо числа', () => {
    expect(attrNumber(response, 'media-supported')).toBeUndefined();
  });

  it('decodeUtf8 применяется к именам атрибутов', () => {
    expect(decodeUtf8(text('media-supported'))).toBe('media-supported');
  });
});
