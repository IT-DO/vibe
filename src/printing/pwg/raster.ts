/**
 * Кодировщик PWG Raster (PWG 5102.4).
 *
 * Зачем он нужен. Mopria обязывает принтеры поддерживать `image/pwg-raster`,
 * а `image/jpeg` — опционален. Xiaomi 1S на практике принимает JPEG, но
 * полагаться на это в киоске нельзя: если прошивка обновится или на площадке
 * окажется другой AirPrint-принтер, фотобудка должна продолжить работать.
 * Поэтому у нас есть свой растеризатор — он всегда даёт формат, который
 * обязан принять любой Mopria-совместимый принтер.
 *
 * Структура файла:
 *
 *   "RaS2"                     — сигнатура (big-endian, версия 2)
 *   для каждой страницы:
 *     заголовок 1796 байт      — поля CUPS Raster v2, часть зарезервирована
 *     данные строк             — построчное RLE
 *
 * Кодирование строк:
 *   [повтор строки: 1 Б]  0 = строка встречается один раз, N = N+1 раз
 *   затем пакеты, покрывающие ровно cupsWidth пикселей:
 *     счётчик 0..127   — следующий пиксель повторить (счётчик + 1) раз
 *     счётчик 128..255 — далее идут (257 − счётчик) неповторяющихся пикселей
 */

import {ByteWriter} from '../../utils/bytes';

/** Сигнатура файла: PWG Raster версии 2, big-endian. */
export const PWG_SYNC_WORD = 'RaS2';

/** Размер заголовка страницы в байтах — фиксирован спецификацией. */
export const PWG_PAGE_HEADER_SIZE = 1796;

/** Цветовые пространства CUPS, разрешённые в PWG Raster. */
export const ColorSpace = {
  /** sGray, 8 бит на пиксель. */
  SGray: 18,
  /** sRGB, 24 бита на пиксель. */
  SRgb: 19,
} as const;

/** Качество печати (`print-quality` из IPP). */
export const PrintQuality = {
  Default: 0,
  Draft: 3,
  Normal: 4,
  High: 5,
} as const;

/** Изображение в памяти: чанки RGB или градаций серого, 8 бит на канал. */
export interface RasterImage {
  readonly width: number;
  readonly height: number;
  /** 3 — RGB, 1 — оттенки серого. */
  readonly channels: 1 | 3;
  /** Пиксели построчно, длина = width * height * channels. */
  readonly pixels: Uint8Array;
}

export interface PwgPageOptions {
  /** Разрешение печати, точек на дюйм. */
  readonly dpi: number;
  /** PWG-имя носителя, попадает в поле PageSizeName. */
  readonly mediaName?: string;
  /** Тип носителя, например `photographic-glossy`. */
  readonly mediaType?: string;
  readonly copies?: number;
  readonly quality?: number;
  /** Всего страниц в задании (поле TotalPageCount). */
  readonly totalPages?: number;
}

/** Точек на дюйм в типографских пунктах — для поля PageSize. */
const POINTS_PER_INCH = 72;

/** Максимум пикселей в одном пакете-повторе. */
const MAX_REPEAT = 128;
/** Максимум пикселей в одном литеральном пакете. */
const MAX_LITERAL = 128;
/** Максимум повторов строки в одной группе. */
const MAX_LINE_REPEAT = 256;

/**
 * Кодирует одностраничный документ PWG Raster.
 * Возвращает готовые байты для отправки как `image/pwg-raster`.
 */
export function encodePwgRaster(image: RasterImage, options: PwgPageOptions): Uint8Array {
  validateImage(image);

  const w = new ByteWriter(image.width * image.height + 4096);
  w.utf8(PWG_SYNC_WORD);
  w.bytes(buildPageHeader(image, options));
  w.bytes(encodePageData(image));
  return w.toBytes();
}

function validateImage(image: RasterImage): void {
  const expected = image.width * image.height * image.channels;
  if (image.width <= 0 || image.height <= 0) {
    throw new RangeError('Размеры изображения должны быть положительными');
  }
  if (image.pixels.length !== expected) {
    throw new RangeError(
      `Размер буфера не совпадает: ожидалось ${expected} Б, получено ${image.pixels.length} Б`,
    );
  }
}

/**
 * Собирает заголовок страницы: 1796 байт полей CUPS Raster v2.
 * Поля, зарезервированные в PWG, заполняются нулями.
 */
export function buildPageHeader(image: RasterImage, options: PwgPageOptions): Uint8Array {
  const {width, height, channels} = image;
  const dpi = options.dpi;
  const bitsPerPixel = channels * 8;
  const bytesPerLine = width * channels;
  const colorSpace = channels === 3 ? ColorSpace.SRgb : ColorSpace.SGray;

  // Размер листа в пунктах = пиксели / dpi * 72.
  const pageWidthPt = Math.round((width / dpi) * POINTS_PER_INCH);
  const pageHeightPt = Math.round((height / dpi) * POINTS_PER_INCH);

  const w = new ByteWriter(PWG_PAGE_HEADER_SIZE);

  w.cString('PwgRaster', 64); // 0    MediaClass
  w.cString('', 64); // 64   MediaColor
  w.cString(options.mediaType ?? '', 64); // 128  MediaType
  w.cString('', 64); // 192  PrintContentOptimize

  w.zeros(12); // 256  AdvanceDistance/AdvanceMedia/Collate — зарезервировано
  w.u32(0); // 268  CutMedia
  w.u32(0); // 272  Duplex — фотопринтер односторонний
  w.u32(dpi); // 276  HWResolution[0], поперёк подачи
  w.u32(dpi); // 280  HWResolution[1], вдоль подачи
  w.zeros(16); // 284  ImagingBoundingBox — зарезервировано
  w.u32(0); // 300  InsertSheet
  w.u32(0); // 304  Jog
  w.u32(0); // 308  LeadingEdge
  w.zeros(12); // 312  Margins/ManualFeed — зарезервировано
  w.u32(0); // 324  MediaPosition
  w.u32(0); // 328  MediaWeight
  w.zeros(8); // 332  MirrorPrint/NegativePrint — зарезервировано
  w.u32(Math.max(1, options.copies ?? 1)); // 340  NumCopies
  w.u32(0); // 344  Orientation
  w.zeros(4); // 348  OutputFaceUp — зарезервировано
  w.u32(pageWidthPt); // 352  PageSize[0], пункты
  w.u32(pageHeightPt); // 356  PageSize[1], пункты
  w.zeros(8); // 360  Separations/TraySwitch — зарезервировано
  w.u32(0); // 368  Tumble
  w.u32(width); // 372  cupsWidth, пиксели
  w.u32(height); // 376  cupsHeight, пиксели
  w.zeros(4); // 380  cupsMediaType — зарезервировано
  w.u32(8); // 384  cupsBitsPerColor
  w.u32(bitsPerPixel); // 388  cupsBitsPerPixel
  w.u32(bytesPerLine); // 392  cupsBytesPerLine
  w.u32(0); // 396  cupsColorOrder: 0 = chunky
  w.u32(colorSpace); // 400  cupsColorSpace
  w.zeros(16); // 404  cupsCompression/RowCount/RowFeed/RowStep — зарезервировано
  w.u32(channels); // 420  cupsNumColors
  w.zeros(4); // 424  cupsBorderlessScalingFactor — зарезервировано
  w.zeros(8); // 428  cupsPageSize[2] — зарезервировано
  w.zeros(16); // 436  cupsImagingBBox[4] — зарезервировано

  // 452  cupsInteger[0..15] — здесь PWG задаёт собственную семантику.
  w.u32(options.totalPages ?? 1); // [0]  TotalPageCount
  w.u32(1); // [1]  CrossFeedTransform: 1 = без зеркалирования
  w.u32(1); // [2]  FeedTransform: 1 = без переворота
  w.u32(0); // [3]  ImageBoxLeft
  w.u32(0); // [4]  ImageBoxTop
  w.u32(width); // [5]  ImageBoxRight
  w.u32(height); // [6]  ImageBoxBottom
  w.u32(0xffffff); // [7]  AlternatePrimary: белый
  w.u32(options.quality ?? PrintQuality.Default); // [8]  PrintQuality
  w.zeros(4 * 7); // [9..15] — зарезервировано

  w.zeros(64); // 516  cupsReal[16] — зарезервировано
  w.zeros(64 * 16); // 580  cupsString[16][64] — зарезервировано
  w.cString('', 64); // 1604 cupsMarkerType — зарезервировано
  w.cString('', 64); // 1668 RenderingIntent
  w.cString(options.mediaName ?? '', 64); // 1732 PageSizeName

  const header = w.toBytes();
  /* istanbul ignore next — страховка от опечатки в смещениях выше */
  if (header.length !== PWG_PAGE_HEADER_SIZE) {
    throw new Error(
      `Заголовок PWG получился ${header.length} Б вместо ${PWG_PAGE_HEADER_SIZE} Б`,
    );
  }
  return header;
}

/** Кодирует все строки изображения построчным RLE. */
export function encodePageData(image: RasterImage): Uint8Array {
  const {width, height, channels, pixels} = image;
  const bytesPerLine = width * channels;
  const out = new ByteWriter(bytesPerLine * height);

  let row = 0;
  while (row < height) {
    // Сколько последующих строк совпадают с текущей.
    let repeat = 1;
    while (
      repeat < MAX_LINE_REPEAT &&
      row + repeat < height &&
      linesEqual(pixels, row * bytesPerLine, (row + repeat) * bytesPerLine, bytesPerLine)
    ) {
      repeat++;
    }

    out.u8(repeat - 1);
    encodeLine(out, pixels, row * bytesPerLine, width, channels);
    row += repeat;
  }

  return out.toBytes();
}

function linesEqual(
  pixels: Uint8Array,
  offsetA: number,
  offsetB: number,
  length: number,
): boolean {
  for (let i = 0; i < length; i++) {
    if (pixels[offsetA + i] !== pixels[offsetB + i]) {
      return false;
    }
  }
  return true;
}

/** Кодирует одну строку: чередование пакетов-повторов и литеральных пакетов. */
function encodeLine(
  out: ByteWriter,
  pixels: Uint8Array,
  offset: number,
  width: number,
  channels: number,
): void {
  let x = 0;
  while (x < width) {
    const runLength = countRun(pixels, offset, x, width, channels);

    if (runLength >= 2) {
      // Повтор: пишем счётчик и один экземпляр пикселя.
      let left = runLength;
      while (left > 0) {
        const take = Math.min(left, MAX_REPEAT);
        out.u8(take - 1);
        writePixel(out, pixels, offset, x, channels);
        left -= take;
      }
      x += runLength;
      continue;
    }

    // Литеральная серия: копим пиксели, пока не начнётся повтор.
    const start = x;
    while (
      x < width &&
      x - start < MAX_LITERAL &&
      countRun(pixels, offset, x, width, channels) < 2
    ) {
      x++;
    }
    const literalCount = x - start;
    out.u8(257 - literalCount);
    out.bytes(
      pixels.subarray(offset + start * channels, offset + (start + literalCount) * channels),
    );
  }
}

/** Длина серии одинаковых пикселей, начиная с позиции x. */
function countRun(
  pixels: Uint8Array,
  offset: number,
  x: number,
  width: number,
  channels: number,
): number {
  let run = 1;
  const base = offset + x * channels;
  while (x + run < width) {
    const next = offset + (x + run) * channels;
    let same = true;
    for (let c = 0; c < channels; c++) {
      if (pixels[base + c] !== pixels[next + c]) {
        same = false;
        break;
      }
    }
    if (!same) {
      break;
    }
    run++;
  }
  return run;
}

function writePixel(
  out: ByteWriter,
  pixels: Uint8Array,
  offset: number,
  x: number,
  channels: number,
): void {
  const at = offset + x * channels;
  out.bytes(pixels.subarray(at, at + channels));
}

/**
 * Оценивает размер результата, не кодируя его целиком.
 * Нужна для предупреждения оператора: растр по Wi-Fi 2,4 ГГц заливается долго.
 */
export function estimateRasterBytes(image: RasterImage): number {
  return PWG_PAGE_HEADER_SIZE + 4 + image.width * image.height * image.channels;
}
