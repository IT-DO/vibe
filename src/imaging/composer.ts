/**
 * Сборка отпечатка: кадры + раскладка + рамка + подпись -> готовый файл.
 *
 * Рисуем на офскрин-холсте Skia ровно в размер листа (1040×1560 при 520 dpi),
 * а не масштабируем силами принтера. Принтер пересчитывает изображение своим
 * простым алгоритмом, и на лицах это видно; Skia даёт нормальную фильтрацию.
 *
 * На выходе — JPEG: принтер другого не принимает,
 * если принтер не принимает JPEG.
 */

import {
  ImageFormat,
  Skia,
  TileMode,
  type SkCanvas,
  type SkImage,
  type SkSurface,
  type SkTypeface,
} from '@shopify/react-native-skia';

import {trace} from '../platform/trace';
import {withTimeout} from '../utils/timeout';
import {
  bleedOffset,
  coverCrop,
  sheetPixels,
  withBleed,
  type Size,
} from './geometry';
import type {LayoutCell, LayoutGeometry, PhotoLayout} from './layouts';

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
}

/** Значения по умолчанию для сборки отпечатка. */
export const DEFAULT_COMPOSE: Pick<
  ComposeOptions,
  'mirror' | 'bleedPercent' | 'backgroundColor' | 'jpegQuality'
> = {
  // Печатаем то же, что гость видел на экране: зеркальный кадр совпадает с
  // его ожиданием. Надписи на одежде при этом читаются задом наперёд —
  // переключатель есть в админке.
  mirror: true,
  // 2 % припуска закрывают разброс механики подачи бумаги.
  bleedPercent: 2,
  backgroundColor: '#FFFFFF',
  jpegQuality: 92,
};

export interface ComposedSheet {
  /** Готовый JPEG. */
  readonly jpeg: Uint8Array;
  /** Размер холста в пикселях (с учётом припуска). */
  readonly size: Size;
}

/** Собирает отпечаток и кодирует его в JPEG. */
export async function composeSheet(options: ComposeOptions): Promise<ComposedSheet> {
  const sheet = sheetPixels(options.media, options.dpi, options.layout.orientation);
  const canvasSize = withBleed(sheet, options.bleedPercent);
  const offset = bleedOffset(sheet, canvasSize);

  trace('сборка', 'начало', {
    раскладка: options.layout.id,
    кадров: options.shotPaths.length,
    лист: `${sheet.width}×${sheet.height}`,
    холст: `${canvasSize.width}×${canvasSize.height}`,
    dpi: options.dpi,
    шрифт: options.typeface ? 'есть' : 'нет',
    подпись: options.caption?.title ?? '—',
  });

  // Холст в обычной памяти, а не на видеокарте.
  //
  // `MakeOffscreen` создаёт холст на GPU, и снимок с него — изображение-
  // текстура. Закодировать такую в JPEG из потока JavaScript нельзя: сами
  // авторы Skia перед использованием такого снимка вне главного потока
  // зовут `makeNonTextureImage`. Мы же кодировали сразу — отсюда и пустой
  // лист на устройстве при исправном коде и зелёных тестах.
  //
  // `Make` даёт холст, пиксели которого лежат в памяти. Для одного листа
  // 1040×1560, рисуемого один раз, разницы в скорости нет, а целый класс
  // отказов, связанных с контекстом видеокарты, исчезает.
  const surface = makeSurface(canvasSize.width, canvasSize.height);
  if (!surface) {
    // Размер в сообщении не для красоты: если холст не создаётся, первое,
    // что надо знать, — не упёрлись ли мы в ограничение видеопамяти.
    throw new Error(
      `Не удалось создать холст ${canvasSize.width}×${canvasSize.height} для сборки отпечатка`,
    );
  }

  const canvas = surface.getCanvas();
  canvas.clear(Skia.Color(options.backgroundColor));

  // Сдвигаем начало координат так, чтобы лист был по центру холста
  // с припуском: всё, что вылезет за края, уйдёт в обрез.
  canvas.save();
  canvas.translate(offset.dx, offset.dy);

  const geometry = options.layout.geometry(sheet, options.dpi);

  try {
    await stage('кадры', () => drawCells(canvas, surface, geometry, options));

    if (options.framePath) {
      await stage('рамка', () => drawFrame(canvas, options.framePath!, sheet));
    }
    if (options.caption && geometry.caption && options.typeface) {
      // Шрифт обязателен: без него нативная часть Skia падает на самом
      // конструкторе `Font`, унося с собой весь лист. Подпись — украшение,
      // отпечаток — то, ради чего человек подошёл, поэтому при отсутствии
      // шрифта лист выходит без подписи, а не не выходит вовсе.
      await stage('подпись', async () =>
        drawCaption(canvas, geometry, options.caption!, options.typeface!),
      );
    }
  } finally {
    canvas.restore();
  }

  trace('сборка', 'рисование закончено, кодируем');
  surface.flush();
  const snapshot = readable(surface.makeImageSnapshot());
  const encoded = snapshot.encodeToBytes(ImageFormat.JPEG, options.jpegQuality);
  if (!encoded) {
    throw new Error(
      `Не удалось закодировать отпечаток ${canvasSize.width}×${canvasSize.height} в JPEG`,
    );
  }

  trace('сборка', 'лист готов', {байт: encoded.length});
  return {
    jpeg: encoded,
    size: canvasSize,
  };
}

/**
 * Рисует кадры по ячейкам раскладки — по одному кадру за раз.
 *
 * Кадры загружаются и освобождаются поочерёдно, а не все сразу. Разница не
 * косметическая: снимок с камеры 12 Мп в распакованном виде занимает около
 * 48 МБ, и четыре кадра «сетки» держали бы в памяти под 200 МБ. Телефон
 * этого не переживал — сборка листа падала, и гость видел пустой
 * прямоугольник вместо своей фотографии ровно на тех раскладках, где
 * кадров больше одного.
 *
 * Один и тот же снимок может попадать в несколько ячеек (так устроена
 * двойная полоса), поэтому ячейки сгруппированы по кадру: файл читается
 * один раз, рисуется во все свои места и сразу освобождается.
 */
async function drawCells(
  canvas: SkCanvas,
  surface: SkSurface,
  geometry: LayoutGeometry,
  options: ComposeOptions,
): Promise<void> {
  const paint = Skia.Paint();
  paint.setAntiAlias(true);

  for (const [shotIndex, cells] of cellsByShot(geometry)) {
    const path = options.shotPaths[shotIndex];
    if (!path) {
      continue;
    }

    const image = await loadImage(path);
    if (!image) {
      // Кадр не прочитался — ячейка останется фоном, но лист выйдет.
      trace('сборка', 'кадр не прочитался', {кадр: shotIndex, путь: path});
      continue;
    }
    trace('сборка', 'кадр прочитан', {
      кадр: shotIndex,
      размер: `${image.width()}×${image.height()}`,
      ячеек: cells.length,
    });

    try {
      const source: Size = {width: image.width(), height: image.height()};
      for (const cell of cells) {
        const crop = coverCrop(source, {
          width: cell.rect.width,
          height: cell.rect.height,
        });

        canvas.save();
        if (options.mirror) {
          // Отражаем относительно вертикальной оси ячейки, а не всего
          // листа, иначе кадры в раскладке поменяются местами.
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
      // Растеризуем до того, как отпустить кадр. Холст на видеокарте
      // выполняет рисование отложенно, и освобождённая текстура к моменту
      // выполнения уже ничья — лист вышел бы без этого кадра.
      surface.flush();
    } finally {
      image.dispose?.();
    }
  }
}

/** Ячейки, сгруппированные по кадру, в порядке появления кадров. */
function cellsByShot(geometry: LayoutGeometry): Map<number, LayoutCell[]> {
  const grouped = new Map<number, LayoutCell[]>();
  for (const cell of geometry.cells) {
    const cells = grouped.get(cell.shotIndex);
    if (cells) {
      cells.push(cell);
    } else {
      grouped.set(cell.shotIndex, [cell]);
    }
  }
  return grouped;
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

/**
 * Сколько ждать файл кадра.
 *
 * Снимок с камеры крупнее шрифта, поэтому срок больше. Он всё равно нужен:
 * `Data.fromURI` при неудаче не отклоняет обещание, а молчит, и лист без
 * срока не собрался бы никогда — ни с ошибкой, ни без.
 */
const IMAGE_TIMEOUT_MS = 10_000;

/** Читает файл кадра в изображение Skia. */
async function loadImage(path: string): Promise<SkImage | null> {
  const uri = path.startsWith('file://') || path.includes('://') ? path : `file://${path}`;
  const data = await withTimeout(Skia.Data.fromURI(uri), IMAGE_TIMEOUT_MS, reason =>
    trace('сборка', reason === 'timeout' ? 'кадр не дождались' : 'кадр не прочитался', {
      адрес: uri,
    }),
  );
  if (!data) {
    return null;
  }
  return Skia.Image.MakeImageFromEncoded(data);
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

  const surface = makeSurface(width, height);
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
  const preview = readable(surface.makeImageSnapshot()).encodeToBytes(ImageFormat.JPEG, 80);
  source.dispose?.();
  return preview ?? null;
}

export {TileMode};

/**
 * Помечает ошибку стадией сборки.
 *
 * В журнал попадает только сообщение, и «Value is undefined» без места
 * происшествия не говорит ничего. С пометкой понятно сразу: упали кадры,
 * рамка или подпись.
 */
async function stage<T>(name: string, run: () => Promise<T>): Promise<T> {
  try {
    const result = await run();
    trace('сборка', `стадия «${name}» пройдена`);
    return result;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Сборка листа, стадия «${name}»: ${reason}`);
  }
}

/**
 * Холст для сборки: в памяти, а не на видеокарте.
 *
 * `Make` — холст с пикселями в обычной памяти, `MakeOffscreen` — на GPU.
 * Нам нужен первый: лист рисуется один раз и сразу кодируется в JPEG, а
 * читать пиксели холста видеокарты из потока JavaScript нельзя.
 *
 * Запасной путь оставлен на случай сборки Skia без `Make`: лучше холст на
 * видеокарте, чем никакого, — снимок с него приводится к обычному в
 * `readable`.
 */
function makeSurface(width: number, height: number): SkSurface | null {
  const factory = Skia.Surface as {
    Make?: (w: number, h: number) => SkSurface | null;
    MakeOffscreen: (w: number, h: number) => SkSurface | null;
  };
  return factory.Make
    ? factory.Make(width, height)
    : factory.MakeOffscreen(width, height);
}

/**
 * Приводит снимок к изображению, пиксели которого можно прочитать.
 *
 * Со снимком холста в памяти это ничего не меняет и ничего не стоит. Со
 * снимком холста видеокарты — обязательный шаг: иначе `encodeToBytes`
 * возвращает пустоту или мусор.
 */
function readable(snapshot: SkImage): SkImage {
  return snapshot.makeNonTextureImage?.() ?? snapshot;
}
