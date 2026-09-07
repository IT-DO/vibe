/**
 * Геометрия печати.
 *
 * Здесь считается всё, от чего зависит, не окажется ли у гостя обрезанной
 * макушка: перевод миллиметров листа в пиксели, кадрирование под ячейку,
 * припуск под печать в край.
 *
 * Модуль намеренно чистый — ни React Native, ни Skia. Ошибку в этих формулах
 * видно только на бумаге, поэтому её ловят тесты, а не глаз оператора на
 * мероприятии.
 */

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type Orientation = 'portrait' | 'landscape';

/** Миллиметры в дюймах. */
const MM_PER_INCH = 25.4;

/**
 * Размер листа в пикселях при заданном разрешении.
 *
 * Для Xiaomi 1S: 101,6 × 152,4 мм при 300 dpi = 1200 × 1800 пикселей.
 * Готовим кадр ровно под это — тогда принтеру не придётся пересчитывать
 * изображение своим (заведомо более грубым) алгоритмом.
 */
export function sheetPixels(
  media: {widthMm: number; heightMm: number},
  dpi: number,
  orientation: Orientation = 'portrait',
): Size {
  const short = Math.round((Math.min(media.widthMm, media.heightMm) / MM_PER_INCH) * dpi);
  const long = Math.round((Math.max(media.widthMm, media.heightMm) / MM_PER_INCH) * dpi);
  return orientation === 'portrait'
    ? {width: short, height: long}
    : {width: long, height: short};
}

/** Миллиметры в пиксели при заданном разрешении. */
export function mmToPx(mm: number, dpi: number): number {
  return Math.round((mm / MM_PER_INCH) * dpi);
}

/** Соотношение сторон. */
export function aspect(size: Size): number {
  return size.width / size.height;
}

/**
 * Область исходного кадра, которую надо взять, чтобы заполнить целевую
 * ячейку без искажения пропорций («обрезать по краям»).
 *
 * `focusY` смещает окно кадрирования по вертикали: 0 — верх, 0,5 — центр,
 * 1 — низ. Для портретов по умолчанию берём чуть выше центра (0,45): люди
 * на групповом снимке стоят в верхней половине, и симметричная обрезка
 * регулярно срезает головы.
 */
export function coverCrop(
  source: Size,
  target: Size,
  focusX = 0.5,
  focusY = 0.45,
): Rect {
  const sourceAspect = aspect(source);
  const targetAspect = aspect(target);

  if (sourceAspect > targetAspect) {
    // Исходник шире ячейки — режем по бокам.
    const width = source.height * targetAspect;
    return {
      x: clamp((source.width - width) * focusX, 0, source.width - width),
      y: 0,
      width,
      height: source.height,
    };
  }

  // Исходник выше ячейки — режем сверху и снизу.
  const height = source.width / targetAspect;
  return {
    x: 0,
    y: clamp((source.height - height) * focusY, 0, source.height - height),
    width: source.width,
    height,
  };
}

/**
 * Прямоугольник внутри `target`, в который целиком помещается `source`
 * с сохранением пропорций (поля по краям).
 */
export function containFit(source: Size, target: Size): Rect {
  const scale = Math.min(target.width / source.width, target.height / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  return {
    x: (target.width - width) / 2,
    y: (target.height - height) / 2,
    width,
    height,
  };
}

/**
 * Увеличивает лист на припуск под обрез.
 *
 * Механика подачи бумаги даёт разброс в доли миллиметра, и при точном
 * совпадении размеров по краю может проступить белая полоска. Рисуем чуть
 * больше листа и печатаем «в край» — лишнее уходит в обрез.
 */
export function withBleed(sheet: Size, bleedPercent: number): Size {
  const factor = 1 + Math.max(0, bleedPercent) / 100;
  return {
    width: Math.round(sheet.width * factor),
    height: Math.round(sheet.height * factor),
  };
}

/** Смещение, на которое надо сдвинуть холст с припуском, чтобы центрировать лист. */
export function bleedOffset(sheet: Size, bleed: Size): {dx: number; dy: number} {
  return {
    dx: Math.round((bleed.width - sheet.width) / 2),
    dy: Math.round((bleed.height - sheet.height) / 2),
  };
}

/** Уменьшает прямоугольник на одинаковые поля со всех сторон. */
export function inset(rect: Rect, amount: number): Rect {
  return {
    x: rect.x + amount,
    y: rect.y + amount,
    width: Math.max(0, rect.width - amount * 2),
    height: Math.max(0, rect.height - amount * 2),
  };
}

/**
 * Делит прямоугольник на сетку с промежутками.
 * Порядок ячеек — слева направо, сверху вниз.
 */
export function gridCells(
  area: Rect,
  columns: number,
  rows: number,
  gutter: number,
): Rect[] {
  if (columns < 1 || rows < 1) {
    throw new RangeError('Сетка должна содержать хотя бы одну ячейку');
  }
  const cellWidth = (area.width - gutter * (columns - 1)) / columns;
  const cellHeight = (area.height - gutter * (rows - 1)) / rows;

  const cells: Rect[] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      cells.push({
        x: area.x + column * (cellWidth + gutter),
        y: area.y + row * (cellHeight + gutter),
        width: cellWidth,
        height: cellHeight,
      });
    }
  }
  return cells;
}

/**
 * Разрешение, при котором исходный кадр закроет ячейку.
 * Если оно ниже 200 dpi, отпечаток будет заметно мыльным — админка на это
 * ругается при выборе разрешения камеры.
 */
export function effectiveDpi(sourceCrop: Size, cell: Size, dpi: number): number {
  const scale = Math.min(sourceCrop.width / cell.width, sourceCrop.height / cell.height);
  return Math.round(dpi * scale);
}

/** Хватает ли исходника, чтобы напечатать ячейку без видимой мыльности. */
export function isSharpEnough(
  sourceCrop: Size,
  cell: Size,
  dpi: number,
  minimumDpi = 200,
): boolean {
  return effectiveDpi(sourceCrop, cell, dpi) >= minimumDpi;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
