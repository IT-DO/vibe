/**
 * Сборка отпечатка: кадры + раскладка + рамка + подпись -> готовый файл.
 *
 * Рисуем на офскрин-холсте Skia ровно в размер листа (1200×1800 при 300 dpi),
 * а не масштабируем силами принтера. Принтер пересчитывает изображение своим
 * простым алгоритмом, и на лицах это видно; Skia даёт нормальную фильтрацию.
 *
 * На выходе — JPEG (основной путь) или сырые пиксели RGB для PWG Raster,
 * если принтер не принимает JPEG.
 */

import {
  AlphaType,
  ColorType,
  ImageFormat,
  Skia,
  TileMode,
  type SkCanvas,
  type SkImage,
  type SkTypeface,
} from '@shopify/react-native-skia';

import type {RasterImage} from '../printing/pwg/raster';
import {
  bleedOffset,
  coverCrop,
  sheetPixels,
  withBleed,
  type Size,
} from './geometry';
import type {LayoutGeometry, PhotoLayout} from './layouts';

/** Подпись на отпечатке — название мероприятия и дата. */
export interface CaptionText {
  readonly title: string;
  readonly subtitle?: string;
  /** Цвет подписи в формате `#rrggbb`. */
  readonly color: string;
}

export interface ComposeOptions {
  /** Пути к файлам снятых кадров, по одному на кадр раскладки. */
  readonly shotPaths: readonly string[];
  readonly layout: PhotoLayout;
  readonly media: {widthMm: number; heightMm: number};
  readonly dpi: number;
  /** PNG-рамка поверх кадров; путь к файлу или URI ассета. */
  readonly framePath?: string;
  readonly caption?: CaptionText;
  /**
   * Шрифт подписи. Без него подпись не рисуется совсем: `Skia.Font` не
   * принимает `undefined` и роняет сборку листа целиком.
   */
  readonly typeface?: SkTypeface;
  /** Отражать ли кадры по горизонтали (съёмка фронтальной камерой). */
  readonly mirror: boolean;
  /** Припуск под обрез, проценты от размера листа. */
  readonly bleedPercent: number;
  /** Цвет фона листа. */
  readonly backgroundColor: string;
  /** Качество JPEG, 0..100. */
  readonly jpegQuality: number;
  /** Рисовать ли пунктир по линии отрыва двойной полосы. */
  readonly showTearLine: boolean;
}

/** Значения по умолчанию для сборки отпечатка. */
export const DEFAULT_COMPOSE: Pick<
  ComposeOptions,
  'mirror' | 'bleedPercent' | 'backgroundColor' | 'jpegQuality' | 'showTearLine'
> = {
  // Печатаем то же, что гость видел на экране: зеркальный кадр совпадает с
  // его ожиданием. Надписи на одежде при этом читаются задом наперёд —
  // переключатель есть в админке.
  mirror: true,
  // 2 % припуска закрывают разброс механики подачи бумаги.
  bleedPercent: 2,
  backgroundColor: '#FFFFFF',
  jpegQuality: 92,
  showTearLine: true,
};

export interface ComposedSheet {
  /** Готовый JPEG. */
  readonly jpeg: Uint8Array;
  /** Размер холста в пикселях (с учётом припуска). */
  readonly size: Size;
  /** Сырые пиксели для PWG Raster; считаются по требованию. */
  toRaster(): RasterImage;
}

/** Собирает отпечаток и кодирует его в JPEG. */
export async function composeSheet(options: ComposeOptions): Promise<ComposedSheet> {
  const sheet = sheetPixels(options.media, options.dpi, options.layout.orientation);
  const canvasSize = withBleed(sheet, options.bleedPercent);
  const offset = bleedOffset(sheet, canvasSize);

  const surface = Skia.Surface.MakeOffscreen(canvasSize.width, canvasSize.height);
  if (!surface) {
    throw new Error('Не удалось создать холст для сборки отпечатка');
  }

  const canvas = surface.getCanvas();
  canvas.clear(Skia.Color(options.backgroundColor));

  // Сдвигаем начало координат так, чтобы лист был по центру холста
  // с припуском: всё, что вылезет за края, уйдёт в обрез.
  canvas.save();
  canvas.translate(offset.dx, offset.dy);

  const geometry = options.layout.geometry(sheet, options.dpi);
  const images = await loadImages(options.shotPaths);

  try {
    drawCells(canvas, geometry, images, options);

    if (options.framePath) {
      await drawFrame(canvas, options.framePath, sheet);
    }
    if (options.caption && geometry.caption && options.typeface) {
      // Шрифт обязателен: без него нативная часть Skia падает на самом
      // конструкторе `Font`, унося с собой весь лист. Подпись — украшение,
      // отпечаток — то, ради чего человек подошёл, поэтому при отсутствии
      // шрифта лист выходит без подписи, а не не выходит вовсе.
      drawCaption(canvas, geometry, options.caption, options.typeface);
    }
    if (options.showTearLine && geometry.tearLine) {
      drawTearLine(canvas, geometry.tearLine.x, sheet.height);
    }
  } finally {
    canvas.restore();
    for (const image of images) {
      image?.dispose?.();
    }
  }

  surface.flush();
  const snapshot = surface.makeImageSnapshot();
  const encoded = snapshot.encodeToBytes(ImageFormat.JPEG, options.jpegQuality);
  if (!encoded) {
    throw new Error('Не удалось закодировать отпечаток в JPEG');
  }

  return {
    jpeg: encoded,
    size: canvasSize,
    toRaster: () => snapshotToRaster(snapshot, canvasSize),
  };
}

/** Рисует кадры по ячейкам раскладки. */
function drawCells(
  canvas: SkCanvas,
  geometry: LayoutGeometry,
  images: readonly (SkImage | null)[],
  options: ComposeOptions,
): void {
  const paint = Skia.Paint();
  paint.setAntiAlias(true);

  for (const cell of geometry.cells) {
    const image = images[cell.shotIndex];
    if (!image) {
      continue;
    }

    const source: Size = {width: image.width(), height: image.height()};
    const crop = coverCrop(source, {width: cell.rect.width, height: cell.rect.height});

    canvas.save();
    if (options.mirror) {
      // Отражаем относительно вертикальной оси ячейки, а не всего листа,
      // иначе кадры в раскладке поменяются местами.
      canvas.translate(cell.rect.x * 2 + cell.rect.width, 0);
      canvas.scale(-1, 1);
    }
    canvas.drawImageRect(
      image,
      Skia.XYWHRect(crop.x, crop.y, crop.width, crop.height),
      Skia.XYWHRect(cell.rect.x, cell.rect.y, cell.rect.width, cell.rect.height),
      paint,
    );
    canvas.restore();
  }
}

/** Накладывает PNG-рамку поверх всего листа. */
async function drawFrame(canvas: SkCanvas, framePath: string, sheet: Size): Promise<void> {
  const frame = await loadImage(framePath);
  if (!frame) {
    return; // рамка не обязательна — без неё просто печатаем кадры
  }
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  canvas.drawImageRect(
    frame,
    Skia.XYWHRect(0, 0, frame.width(), frame.height()),
    Skia.XYWHRect(0, 0, sheet.width, sheet.height),
    paint,
  );
  frame.dispose?.();
}

/** Подписывает отпечаток названием мероприятия и датой. */
function drawCaption(
  canvas: SkCanvas,
  geometry: LayoutGeometry,
  caption: CaptionText,
  typeface: SkTypeface,
): void {
  const area = geometry.caption;
  if (!area) {
    return;
  }

  const paint = Skia.Paint();
  paint.setColor(Skia.Color(caption.color));
  paint.setAntiAlias(true);

  const titleFont = Skia.Font(typeface, area.fontSizePx);
  const titleWidth = titleFont.measureText(caption.title).width;
  const centerX = area.rect.x + area.rect.width / 2;
  const baseline = area.rect.y + area.fontSizePx;

  canvas.drawText(caption.title, centerX - titleWidth / 2, baseline, paint, titleFont);

  if (caption.subtitle) {
    const subtitleSize = area.fontSizePx * 0.6;
    const subtitleFont = Skia.Font(typeface, subtitleSize);
    const subtitleWidth = subtitleFont.measureText(caption.subtitle).width;
    canvas.drawText(
      caption.subtitle,
      centerX - subtitleWidth / 2,
      baseline + subtitleSize * 1.4,
      paint,
      subtitleFont,
    );
  }
}

/** Пунктир по линии отрыва двойной полосы. */
function drawTearLine(canvas: SkCanvas, x: number, height: number): void {
  const paint = Skia.Paint();
  paint.setColor(Skia.Color('#C8C8C8'));
  paint.setStrokeWidth(2);
  paint.setAntiAlias(false);
  // Пунктир рисуем отрезками: так не нужен PathEffect и результат
  // предсказуем при любом разрешении.
  const dash = 18;
  for (let y = 0; y < height; y += dash * 2) {
    canvas.drawLine(x, y, x, Math.min(y + dash, height), paint);
  }
}

async function loadImages(paths: readonly string[]): Promise<(SkImage | null)[]> {
  return Promise.all(paths.map(loadImage));
}

/** Читает файл кадра в изображение Skia. */
async function loadImage(path: string): Promise<SkImage | null> {
  const uri = path.startsWith('file://') || path.includes('://') ? path : `file://${path}`;
  const data = await Skia.Data.fromURI(uri);
  if (!data) {
    return null;
  }
  return Skia.Image.MakeImageFromEncoded(data);
}

/**
 * Переводит готовый холст в сырые пиксели RGB для PWG Raster.
 * Skia отдаёт RGBA — альфу отбрасываем, накладывая на белый фон.
 */
function snapshotToRaster(snapshot: SkImage, size: Size): RasterImage {
  const rgba = snapshot.readPixels(0, 0, {
    width: size.width,
    height: size.height,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  });
  if (!rgba) {
    throw new Error('Не удалось прочитать пиксели холста');
  }

  const pixelCount = size.width * size.height;
  const rgb = new Uint8Array(pixelCount * 3);
  for (let i = 0; i < pixelCount; i++) {
    const src = i * 4;
    const dst = i * 3;
    const alpha = rgba[src + 3]! / 255;
    // Смешиваем с белым: бумага всё равно белая.
    rgb[dst] = Math.round(rgba[src]! * alpha + 255 * (1 - alpha));
    rgb[dst + 1] = Math.round(rgba[src + 1]! * alpha + 255 * (1 - alpha));
    rgb[dst + 2] = Math.round(rgba[src + 2]! * alpha + 255 * (1 - alpha));
  }

  return {width: size.width, height: size.height, channels: 3, pixels: rgb};
}

/** Уменьшенная копия для экрана просмотра — полный лист туда не нужен. */
export async function makePreview(
  jpeg: Uint8Array,
  maxDimension: number,
): Promise<Uint8Array | null> {
  const data = Skia.Data.fromBytes(jpeg);
  const source = Skia.Image.MakeImageFromEncoded(data);
  if (!source) {
    return null;
  }

  const scale = Math.min(
    1,
    maxDimension / Math.max(source.width(), source.height()),
  );
  const width = Math.round(source.width() * scale);
  const height = Math.round(source.height() * scale);

  const surface = Skia.Surface.MakeOffscreen(width, height);
  if (!surface) {
    return null;
  }
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  surface
    .getCanvas()
    .drawImageRect(
      source,
      Skia.XYWHRect(0, 0, source.width(), source.height()),
      Skia.XYWHRect(0, 0, width, height),
      paint,
    );
  surface.flush();
  const preview = surface.makeImageSnapshot().encodeToBytes(ImageFormat.JPEG, 80);
  source.dispose?.();
  return preview ?? null;
}

export {TileMode};
