/**
 * Проверка, помещается ли раскладка на бумагу.
 *
 * Смысл не в математике, а в предупреждении оператора: карманная бумага
 * 50 × 76 мм формально принимает любую раскладку, но «полоска на двоих»
 * даёт на ней ячейку 17 × 19 мм — гость не узнает себя на отпечатке, а
 * картридж уже потрачен.
 */

import {MIN_COMFORTABLE_CELL_MM, crampedLayouts, isCramped, smallestCellMm} from '../fit';
import {LAYOUTS, layoutById, type PhotoLayout} from '../layouts';

const SHEET_4X6 = {widthMm: 101.6, heightMm: 152.4};
const SHEET_2X3 = {widthMm: 50.8, heightMm: 76.2};

describe('размер ячейки', () => {
  it('одиночный кадр занимает лист целиком', () => {
    expect(smallestCellMm(layoutById('single'), SHEET_4X6)).toBeCloseTo(101.6, 0);
  });

  it('на карманной бумаге тот же кадр вчетверо меньше по площади', () => {
    expect(smallestCellMm(layoutById('single'), SHEET_2X3)).toBeCloseTo(50.8, 0);
  });

  it('чем больше кадров в раскладке, тем мельче ячейка', () => {
    const single = smallestCellMm(layoutById('single'), SHEET_4X6);
    const polaroid = smallestCellMm(layoutById('polaroid'), SHEET_4X6);
    const duo = smallestCellMm(layoutById('duo'), SHEET_4X6);
    expect(single).toBeGreaterThan(polaroid);
    expect(polaroid).toBeGreaterThan(duo);
  });
});

describe('все раскладки приложения помещаются на бумагу принтера', () => {
  it.each(LAYOUTS.map(l => l.id))('%s не тесно на 50 × 76', id => {
    // Инвариант, а не подсказка: раскладка, которой на этой бумаге тесно,
    // не должна попасть в приложение. Кадр 20 × 30 мм даёт лицо меньше
    // сантиметра — гость не узнаёт себя, а лист уже потрачен.
    expect(isCramped(layoutById(id), SHEET_2X3)).toBe(false);
  });

  it('ни одна раскладка не помечена тесной', () => {
    expect(crampedLayouts([...LAYOUTS], SHEET_2X3)).toEqual([]);
  });

  it('на большом листе, разумеется, тоже помещаются', () => {
    expect(crampedLayouts([...LAYOUTS], SHEET_4X6)).toEqual([]);
  });
});

describe('проверка ловит тесную раскладку', () => {
  it('сетка четыре на бумаге 50 × 76 признаётся тесной', () => {
    // Такой раскладки в приложении больше нет — воспроизводим её
    // геометрию, чтобы убедиться, что проверка не «всегда зелёная».
    const grid: PhotoLayout = {
      ...layoutById('single'),
      id: 'single',
      shots: 4,
      geometry: sheet => {
        // Сетка 2 × 2 с полями и местом под подпись — так была устроена
        // раскладка «четыре кадра», пока её не убрали.
        const margin = sheet.width * 0.06;
        const cellW = (sheet.width - margin * 3) / 2;
        const cellH = (sheet.height * 0.82 - margin * 3) / 2;
        return {
          cells: [0, 1, 2, 3].map(i => ({
            rect: {
              x: margin + (i % 2) * (cellW + margin),
              y: margin + Math.floor(i / 2) * (cellH + margin),
              width: cellW,
              height: cellH,
            },
            shotIndex: i,
          })),
          caption: null,
        };
      },
    };
    expect(isCramped(grid, SHEET_2X3)).toBe(true);
    expect(isCramped(grid, SHEET_4X6)).toBe(false);
  });
});

describe('порог тесноты', () => {
  it('около сантиметра лица — предел узнаваемости', () => {
    // Кадр поясной, лицо занимает примерно треть высоты ячейки.
    expect(MIN_COMFORTABLE_CELL_MM).toBeGreaterThanOrEqual(20);
    expect(MIN_COMFORTABLE_CELL_MM).toBeLessThanOrEqual(35);
  });

  it('порог можно задать снаружи', () => {
    expect(isCramped(layoutById('single'), SHEET_4X6, 200)).toBe(true);
  });

  it('пустой список раскладок не ломает проверку', () => {
    expect(crampedLayouts([], SHEET_2X3)).toEqual([]);
  });
});
