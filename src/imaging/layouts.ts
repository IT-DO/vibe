/**
 * Раскладки отпечатка.
 *
 * Раскладка определяет две вещи: сколько кадров снять и как разложить их по
 * листу 10×15. Одна и та же съёмка может попасть в несколько ячеек — так
 * сделана «двойная полоса»: гости отрывают половину и делятся друг с другом.
 * Это мелочь, но именно из-за неё к будке возвращаются по второму разу.
 */

import {gridCells, inset, mmToPx, type Orientation, type Rect, type Size} from './geometry';

export type LayoutId = 'single' | 'polaroid' | 'duo';

/** Ячейка листа: куда поместить кадр и какой именно. */
export interface LayoutCell {
  readonly rect: Rect;
  /** Индекс кадра серии; несколько ячеек могут ссылаться на один кадр. */
  readonly shotIndex: number;
}

/** Место под подпись — название мероприятия и дата. */
export interface CaptionArea {
  readonly rect: Rect;
  /** Ориентир для размера шрифта. */
  readonly fontSizePx: number;
}

export interface LayoutGeometry {
  readonly cells: readonly LayoutCell[];
  readonly caption: CaptionArea | null;
}

export interface PhotoLayout {
  readonly id: LayoutId;
  /** Ключ локализации названия. */
  readonly titleKey: string;
  /** Сколько кадров снимает камера. */
  readonly shots: number;
  readonly orientation: Orientation;
  /** Пауза между кадрами серии, мс. */
  readonly interShotDelayMs: number;
  /** Считает геометрию под конкретный размер листа. */
  geometry(sheet: Size, dpi: number): LayoutGeometry;
}

/** Поля листа по умолчанию, мм. */
const MARGIN_MM = 4;
/** Промежуток между кадрами, мм. */
const GUTTER_MM = 3;

/** Один кадр во весь лист — самый быстрый сценарий, очередь не копится. */
const single: PhotoLayout = {
  id: 'single',
  titleKey: 'layout.single',
  shots: 1,
  orientation: 'portrait',
  interShotDelayMs: 0,
  geometry(sheet) {
    // Без полей: фотография занимает лист целиком.
    return {
      cells: [{rect: {x: 0, y: 0, ...sheet}, shotIndex: 0}],
      caption: null,
    };
  },
};

/** «Полароид»: кадр вверху, широкое белое поле снизу под подпись. */
const polaroid: PhotoLayout = {
  id: 'polaroid',
  titleKey: 'layout.polaroid',
  shots: 1,
  orientation: 'portrait',
  interShotDelayMs: 0,
  geometry(sheet, dpi) {
    const margin = mmToPx(MARGIN_MM, dpi);
    // Нижнее поле шире остальных — узнаваемая пропорция полароида.
    const captionHeight = Math.round(sheet.height * 0.18);
    const photo: Rect = {
      x: margin,
      y: margin,
      width: sheet.width - margin * 2,
      height: sheet.height - margin - captionHeight,
    };
    return {
      cells: [{rect: photo, shotIndex: 0}],
      caption: {
        rect: {
          x: margin,
          y: photo.y + photo.height,
          width: photo.width,
          height: captionHeight - margin,
        },
        fontSizePx: Math.round(captionHeight * 0.3),
      },
    };
  },
};



/** Два кадра друг под другом — «до» и «после». */
const duo: PhotoLayout = {
  id: 'duo',
  titleKey: 'layout.duo',
  shots: 2,
  orientation: 'portrait',
  interShotDelayMs: 1_500,
  geometry(sheet, dpi) {
    const margin = mmToPx(MARGIN_MM, dpi);
    const gutter = mmToPx(GUTTER_MM, dpi);
    const captionHeight = Math.round(sheet.height * 0.07);
    const area: Rect = {
      x: margin,
      y: margin,
      width: sheet.width - margin * 2,
      height: sheet.height - margin * 2 - captionHeight,
    };
    return {
      cells: gridCells(area, 1, 2, gutter).map((rect, shotIndex) => ({rect, shotIndex})),
      caption: {
        rect: {
          x: margin,
          y: area.y + area.height,
          width: area.width,
          height: captionHeight,
        },
        fontSizePx: Math.round(captionHeight * 0.5),
      },
    };
  },
};

/** Все раскладки в порядке показа на экране выбора. */
/**
 * Все раскладки в порядке показа на экране выбора.
 *
 * Их три, а не пять. Принтер печатает на карманной бумаге 50 × 76 мм, и
 * раскладки на четыре кадра и двойную полосу давали на ней ячейку 20 × 30
 * и 17 × 19 мм: лицо выходило меньше сантиметра, гость не узнавал себя на
 * отпечатке, а лист был потрачен.
 */
export const LAYOUTS: readonly PhotoLayout[] = [single, polaroid, duo];

/** Раскладка по идентификатору; при неизвестном — одиночный кадр. */
export function layoutById(id: string): PhotoLayout {
  return LAYOUTS.find(l => l.id === id) ?? single;
}

/** Общая продолжительность съёмки серии — показываем гостю перед стартом. */
export function estimateShootDurationMs(layout: PhotoLayout, countdownMs: number): number {
  return layout.shots * countdownMs + (layout.shots - 1) * layout.interShotDelayMs;
}

export {inset};
