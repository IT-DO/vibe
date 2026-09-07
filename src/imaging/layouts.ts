/**
 * Раскладки отпечатка.
 *
 * Раскладка определяет две вещи: сколько кадров снять и как разложить их по
 * листу 10×15. Одна и та же съёмка может попасть в несколько ячеек — так
 * сделана «двойная полоса»: гости отрывают половину и делятся друг с другом.
 * Это мелочь, но именно из-за неё к будке возвращаются по второму разу.
 */

import {gridCells, inset, mmToPx, type Orientation, type Rect, type Size} from './geometry';

export type LayoutId = 'single' | 'polaroid' | 'grid4' | 'twinStrip3' | 'duo';

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
  /** Линия отрыва (для двойной полосы) в координатах листа. */
  readonly tearLine: {x: number} | null;
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
      tearLine: null,
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
      tearLine: null,
    };
  },
};

/** Четыре кадра сеткой 2×2 — «раскадровка» события. */
const grid4: PhotoLayout = {
  id: 'grid4',
  titleKey: 'layout.grid4',
  shots: 4,
  orientation: 'portrait',
  interShotDelayMs: 1_200,
  geometry(sheet, dpi) {
    const margin = mmToPx(MARGIN_MM, dpi);
    const gutter = mmToPx(GUTTER_MM, dpi);
    const captionHeight = Math.round(sheet.height * 0.08);
    const area: Rect = {
      x: margin,
      y: margin,
      width: sheet.width - margin * 2,
      height: sheet.height - margin * 2 - captionHeight,
    };
    return {
      cells: gridCells(area, 2, 2, gutter).map((rect, shotIndex) => ({rect, shotIndex})),
      caption: {
        rect: {
          x: margin,
          y: area.y + area.height,
          width: area.width,
          height: captionHeight,
        },
        fontSizePx: Math.round(captionHeight * 0.42),
      },
      tearLine: null,
    };
  },
};

/**
 * Классическая полоса фотобудки, напечатанная дважды.
 *
 * Лист 10×15 делится пополам по вертикали, в каждой половине — три кадра.
 * Половины одинаковые: гости разрывают отпечаток и забирают по полосе.
 */
const twinStrip3: PhotoLayout = {
  id: 'twinStrip3',
  titleKey: 'layout.twinStrip3',
  shots: 3,
  orientation: 'portrait',
  interShotDelayMs: 1_200,
  geometry(sheet, dpi) {
    const margin = mmToPx(MARGIN_MM, dpi);
    const gutter = mmToPx(GUTTER_MM, dpi);
    const halfWidth = sheet.width / 2;
    const captionHeight = Math.round(sheet.height * 0.07);

    const cells: LayoutCell[] = [];
    for (let half = 0; half < 2; half++) {
      const area: Rect = {
        x: half * halfWidth + margin,
        y: margin,
        width: halfWidth - margin * 2,
        height: sheet.height - margin * 2 - captionHeight,
      };
      gridCells(area, 1, 3, gutter).forEach((rect, shotIndex) => {
        cells.push({rect, shotIndex});
      });
    }

    return {
      cells,
      caption: {
        rect: {
          x: margin,
          y: sheet.height - margin - captionHeight,
          width: sheet.width - margin * 2,
          height: captionHeight,
        },
        fontSizePx: Math.round(captionHeight * 0.5),
      },
      tearLine: {x: halfWidth},
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
      tearLine: null,
    };
  },
};

/** Все раскладки в порядке показа на экране выбора. */
export const LAYOUTS: readonly PhotoLayout[] = [single, twinStrip3, grid4, polaroid, duo];

/** Раскладка по идентификатору; при неизвестном — одиночный кадр. */
export function layoutById(id: string): PhotoLayout {
  return LAYOUTS.find(l => l.id === id) ?? single;
}

/** Сколько ячеек ссылается на конкретный кадр (для «двойной полосы» — две). */
export function cellsForShot(geometry: LayoutGeometry, shotIndex: number): LayoutCell[] {
  return geometry.cells.filter(c => c.shotIndex === shotIndex);
}

/** Общая продолжительность съёмки серии — показываем гостю перед стартом. */
export function estimateShootDurationMs(layout: PhotoLayout, countdownMs: number): number {
  return layout.shots * countdownMs + (layout.shots - 1) * layout.interShotDelayMs;
}

export {inset};
