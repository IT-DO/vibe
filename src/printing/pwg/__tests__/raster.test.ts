import {
  ColorSpace,
  PWG_PAGE_HEADER_SIZE,
  PrintQuality,
  buildPageHeader,
  encodePageData,
  encodePwgRaster,
  estimateRasterBytes,
  type RasterImage,
} from '../raster';
import {decodePwgRaster, parseHeader} from './decoder';

/** Изображение из функции-генератора цвета. */
function makeImage(
  width: number,
  height: number,
  channels: 1 | 3,
  color: (x: number, y: number, c: number) => number,
): RasterImage {
  const pixels = new Uint8Array(width * height * channels);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < channels; c++) {
        pixels[(y * width + x) * channels + c] = color(x, y, c) & 0xff;
      }
    }
  }
  return {width, height, channels, pixels};
}

/**
 * Быстрое побайтовое сравнение.
 *
 * `expect(a).toEqual(b)` на массиве в 6,5 млн элементов работает больше минуты:
 * Jest строит структурный диф. Сравниваем сами и передаём в expect только
 * первое расхождение — тест остаётся информативным, но идёт миллисекунды.
 */
function expectPixelsEqual(actual: Uint8Array, expected: Uint8Array): void {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    if (actual[i] !== expected[i]) {
      expect({index: i, value: actual[i]}).toEqual({index: i, value: expected[i]});
      return;
    }
  }
}

describe('buildPageHeader', () => {
  const image = makeImage(1200, 1800, 3, () => 0);
  const header = buildPageHeader(image, {
    dpi: 300,
    mediaName: 'na_index-4x6_4x6in',
    mediaType: 'photographic-glossy',
    copies: 1,
    quality: PrintQuality.High,
  });

  it('имеет длину ровно 1796 байт', () => {
    expect(header).toHaveLength(PWG_PAGE_HEADER_SIZE);
  });

  it('заполняет поля по смещениям спецификации', () => {
    const parsed = parseHeader(header);
    expect(parsed.mediaClass).toBe('PwgRaster');
    expect(parsed.mediaType).toBe('photographic-glossy');
    expect(parsed.hwResolution).toEqual([300, 300]);
    expect(parsed.width).toBe(1200);
    expect(parsed.height).toBe(1800);
    expect(parsed.bitsPerColor).toBe(8);
    expect(parsed.bitsPerPixel).toBe(24);
    expect(parsed.bytesPerLine).toBe(3600);
    expect(parsed.colorOrder).toBe(0); // chunky
    expect(parsed.colorSpace).toBe(ColorSpace.SRgb);
    expect(parsed.numColors).toBe(3);
    expect(parsed.printQuality).toBe(PrintQuality.High);
    expect(parsed.pageSizeName).toBe('na_index-4x6_4x6in');
  });

  it('считает размер листа в пунктах из пикселей и dpi', () => {
    // 1200 px / 300 dpi = 4 дюйма = 288 пунктов; 1800 px = 6 дюймов = 432 пункта.
    expect(parseHeader(header).pageSizePt).toEqual([288, 432]);
  });

  it('ставит трансформации подачи в 1, как требует PWG', () => {
    const parsed = parseHeader(header);
    expect(parsed.crossFeedTransform).toBe(1);
    expect(parsed.feedTransform).toBe(1);
  });

  it('задаёт ImageBox по границам изображения', () => {
    expect(parseHeader(header).imageBox).toEqual([0, 0, 1200, 1800]);
  });

  it('серое изображение описывается как sGray, 8 бит на пиксель', () => {
    const gray = buildPageHeader(makeImage(10, 10, 1, () => 0), {dpi: 300});
    const parsed = parseHeader(gray);
    expect(parsed.colorSpace).toBe(ColorSpace.SGray);
    expect(parsed.bitsPerPixel).toBe(8);
    expect(parsed.numColors).toBe(1);
    expect(parsed.bytesPerLine).toBe(10);
  });

  it('не даёт записать меньше одной копии', () => {
    const h = buildPageHeader(makeImage(4, 4, 3, () => 0), {dpi: 300, copies: 0});
    expect(parseHeader(h).numCopies).toBe(1);
  });
});

describe('encodePwgRaster — полный цикл кодирования и разбора', () => {
  const cases: {name: string; image: RasterImage}[] = [
    {
      name: 'сплошная заливка (максимум повторов)',
      image: makeImage(64, 32, 3, () => 200),
    },
    {
      name: 'вертикальные полосы (повторы внутри строки отсутствуют)',
      image: makeImage(64, 8, 3, x => (x % 2 === 0 ? 0 : 255)),
    },
    {
      name: 'горизонтальные полосы (повторяются целые строки)',
      image: makeImage(32, 64, 3, (_x, y) => (y % 2 === 0 ? 10 : 240)),
    },
    {
      name: 'градиент (длинные литеральные серии)',
      image: makeImage(200, 20, 3, (x, y, c) => x + y * 3 + c * 7),
    },
    {
      name: 'шум (худший случай для RLE)',
      image: makeImage(97, 13, 3, (x, y, c) => (x * 31 + y * 17 + c * 13) * 7),
    },
    {
      name: 'оттенки серого',
      image: makeImage(50, 50, 1, (x, y) => x ^ y),
    },
    {
      name: 'один пиксель',
      image: makeImage(1, 1, 3, () => 128),
    },
    {
      name: 'строка длиннее максимального пакета повтора (>128 px)',
      image: makeImage(400, 3, 3, () => 77),
    },
    {
      name: 'литеральная серия длиннее максимального пакета (>128 px)',
      image: makeImage(300, 2, 3, (x, _y, c) => x * 3 + c),
    },
    {
      name: 'больше 256 одинаковых строк подряд',
      image: makeImage(8, 300, 3, () => 42),
    },
    {
      name: 'фото 10x15 в реальном разрешении',
      image: makeImage(1200, 1800, 3, (x, y, c) => (x * 7 + y * 13 + c * 29) >> 2),
    },
  ];

  it.each(cases)('$name восстанавливается побайтово', ({image}) => {
    const encoded = encodePwgRaster(image, {dpi: 300, mediaName: 'na_index-4x6_4x6in'});
    const decoded = decodePwgRaster(encoded);

    expect(decoded.header.width).toBe(image.width);
    expect(decoded.header.height).toBe(image.height);
    expectPixelsEqual(decoded.pixels, image.pixels);
  });

  it('начинается с сигнатуры RaS2', () => {
    const encoded = encodePwgRaster(makeImage(4, 4, 3, () => 1), {dpi: 300});
    expect(Array.from(encoded.subarray(0, 4))).toEqual([0x52, 0x61, 0x53, 0x32]);
  });

  it('сжимает однотонное изображение в десятки раз', () => {
    const image = makeImage(1200, 1800, 3, () => 255);
    const encoded = encodePwgRaster(image, {dpi: 300});
    // 6,48 МБ сырых данных должны ужаться до считанных килобайт.
    expect(encoded.length).toBeLessThan(50_000);
    expect(encoded.length).toBeLessThan(image.pixels.length / 100);
  });

  it('на шуме не раздувает данные больше, чем на служебные байты', () => {
    const image = makeImage(600, 400, 3, (x, y, c) => (x * 131 + y * 71 + c * 37) & 0xff);
    const encoded = encodePwgRaster(image, {dpi: 300});
    // Литеральный пакет добавляет 1 байт на каждые 128 пикселей.
    const overhead = image.height * (1 + Math.ceil(image.width / 128));
    expect(encoded.length).toBeLessThanOrEqual(
      image.pixels.length + overhead + PWG_PAGE_HEADER_SIZE + 4,
    );
  });
});

describe('encodePageData', () => {
  it('строка из одинаковых пикселей кодируется одним пакетом', () => {
    // 4 пикселя одного цвета: [повтор строки=0][счётчик=3][R G B]
    const data = encodePageData(makeImage(4, 1, 3, () => 9));
    expect(Array.from(data)).toEqual([0, 3, 9, 9, 9]);
  });

  it('одиночный пиксель кодируется как повтор длиной 1, а не как литерал', () => {
    const data = encodePageData(makeImage(1, 1, 1, () => 5));
    expect(Array.from(data)).toEqual([0, 0, 5]);
  });

  it('чередующиеся пиксели кодируются литеральным пакетом', () => {
    // 3 разных пикселя: [повтор строки=0][счётчик=257-3=254][a b c]
    const data = encodePageData(makeImage(3, 1, 1, x => x + 1));
    expect(Array.from(data)).toEqual([0, 254, 1, 2, 3]);
  });

  it('одинаковые строки схлопываются в одну группу', () => {
    const data = encodePageData(makeImage(2, 5, 1, () => 7));
    // Одна группа: повтор = 5-1 = 4, затем описание строки.
    expect(Array.from(data)).toEqual([4, 1, 7]);
  });

  it('разбивает серию длиннее 128 пикселей на несколько пакетов', () => {
    const data = encodePageData(makeImage(200, 1, 1, () => 3));
    // [повтор строки=0][127 -> 128 px][3][71 -> 72 px][3]
    expect(Array.from(data)).toEqual([0, 127, 3, 71, 3]);
  });
});

describe('проверки и оценки', () => {
  it('отвергает буфер неверного размера', () => {
    expect(() =>
      encodePwgRaster({width: 4, height: 4, channels: 3, pixels: new Uint8Array(10)}, {dpi: 300}),
    ).toThrow(/Размер буфера/);
  });

  it('отвергает нулевые размеры', () => {
    expect(() =>
      encodePwgRaster({width: 0, height: 4, channels: 3, pixels: new Uint8Array(0)}, {dpi: 300}),
    ).toThrow(/положительными/);
  });

  it('оценка размера соответствует несжатому растру', () => {
    // 1200x1800 RGB = 6 480 000 Б плюс заголовок и сигнатура.
    expect(estimateRasterBytes(makeImage(1200, 1800, 3, () => 0))).toBe(
      1200 * 1800 * 3 + PWG_PAGE_HEADER_SIZE + 4,
    );
  });
});
