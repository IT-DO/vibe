/**
 * Помещается ли раскладка на выбранную бумагу.
 *
 * Раскладки заданы в долях листа, поэтому формально подходят к любому
 * формату. Но «полоска на двоих» на карманной бумаге 50 × 76 мм даёт ячейку
 * 17 × 19 мм: лицо в ней выходит меньше сантиметра, и гость получает
 * отпечаток, на котором себя не узнаёт. Запрещать такое приложение не
 * должно — оператор может печатать хоть узор, — но предупредить обязано,
 * пока картридж не потрачен.
 */

import {mmToPx} from './geometry';
import type {PhotoLayout} from './layouts';

/**
 * Ниже этой стороны ячейки лицо перестаёт читаться.
 *
 * Кадр обычно поясной, лицо занимает около трети высоты: при ячейке в
 * 25 мм это примерно 8 мм — предел, на котором ещё видно, кто на снимке.
 */
export const MIN_COMFORTABLE_CELL_MM = 25;

/** Разрешение, в котором считается геометрия отпечатка. */
const DPI = 300;

export interface MediaSizeMm {
  readonly widthMm: number;
  readonly heightMm: number;
}

/** Короткая сторона наименьшей ячейки раскладки, в миллиметрах. */
export function smallestCellMm(layout: PhotoLayout, media: MediaSizeMm): number {
  const sheet = {
    width: mmToPx(media.widthMm, DPI),
    height: mmToPx(media.heightMm, DPI),
  };
  const geometry = layout.geometry(sheet, DPI);

  let smallest = Number.POSITIVE_INFINITY;
  for (const cell of geometry.cells) {
    const side = Math.min(cell.rect.width, cell.rect.height);
    smallest = Math.min(smallest, side);
  }
  if (!Number.isFinite(smallest)) {
    return 0;
  }
  return (smallest / DPI) * 25.4;
}

/** Слишком ли мелкими выйдут кадры этой раскладки на такой бумаге. */
export function isCramped(
  layout: PhotoLayout,
  media: MediaSizeMm,
  minCellMm = MIN_COMFORTABLE_CELL_MM,
): boolean {
  return smallestCellMm(layout, media) < minCellMm;
}

/** Раскладки, которым на этой бумаге тесно. Пусто — все помещаются. */
export function crampedLayouts(
  layouts: readonly PhotoLayout[],
  media: MediaSizeMm,
  minCellMm = MIN_COMFORTABLE_CELL_MM,
): PhotoLayout[] {
  return layouts.filter(layout => isCramped(layout, media, minCellMm));
}
