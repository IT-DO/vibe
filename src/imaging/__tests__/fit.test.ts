/**
 * Проверка, помещается ли раскладка на бумагу.
 *
 * Смысл не в математике, а в предупреждении оператора: карманная бумага
 * 50 × 76 мм формально принимает любую раскладку, но «полоска на двоих»
 * даёт на ней ячейку 17 × 19 мм — гость не узнает себя на отпечатке, а
 * картридж уже потрачен.
 */

import {MIN_COMFORTABLE_CELL_MM, crampedLayouts, isCramped, smallestCellMm} from '../fit';
import {LAYOUTS, layoutById} from '../layouts';

const SHEET_4X6 = {widthMm: 101.6, heightMm: 152.4};
const SHEET_2X3 = {widthMm: 50.8, heightMm: 76.2};
const SHEET_3X3 = {widthMm: 76.2, heightMm: 76.2};

describe('размер ячейки', () => {
  it('одиночный кадр занимает лист целиком', () => {
    expect(smallestCellMm(layoutById('single'), SHEET_4X6)).toBeCloseTo(101.6, 0);
  });

  it('на карманной бумаге тот же кадр вчетверо меньше по площади', () => {
    expect(smallestCellMm(layoutById('single'), SHEET_2X3)).toBeCloseTo(50.8, 0);
  });

  it('чем больше кадров в раскладке, тем мельче ячейка', () => {
    const single = smallestCellMm(layoutById('single'), SHEET_4X6);
    const duo = smallestCellMm(layoutById('duo'), SHEET_4X6);
    const grid = smallestCellMm(layoutById('grid4'), SHEET_4X6);
    const strip = smallestCellMm(layoutById('twinStrip3'), SHEET_4X6);
    expect(single).toBeGreaterThan(duo);
    expect(duo).toBeGreaterThan(grid);
    expect(grid).toBeGreaterThan(strip);
  });
});

describe('на листе 10 × 15 помещается всё', () => {
  it.each(LAYOUTS.map(l => l.id))('%s не тесно', id => {
    expect(isCramped(layoutById(id), SHEET_4X6)).toBe(false);
  });
});

describe('на карманной бумаге 50 × 76', () => {
  it('одиночный кадр и полароид остаются крупными', () => {
    expect(isCramped(layoutById('single'), SHEET_2X3)).toBe(false);
    expect(isCramped(layoutById('polaroid'), SHEET_2X3)).toBe(false);
  });

  it('два кадра ещё приемлемы', () => {
    expect(isCramped(layoutById('duo'), SHEET_2X3)).toBe(false);
  });

  it('четыре кадра и полоска на двоих дают лица с ноготь', () => {
    expect(isCramped(layoutById('grid4'), SHEET_2X3)).toBe(true);
    expect(isCramped(layoutById('twinStrip3'), SHEET_2X3)).toBe(true);
  });

  it('тесные раскладки перечисляются для подсказки оператору', () => {
    const cramped = crampedLayouts([...LAYOUTS], SHEET_2X3).map(l => l.id);
    expect(cramped).toEqual(['twinStrip3', 'grid4']);
  });
});

describe('квадратная бумага 7,6 × 7,6', () => {
  it('тоже не всё вмещает', () => {
    const cramped = crampedLayouts([...LAYOUTS], SHEET_3X3);
    expect(cramped.length).toBeGreaterThan(0);
  });
});

describe('порог тесноты', () => {
  it('около сантиметра лица — предел узнаваемости', () => {
    // Кадр поясной, лицо занимает примерно треть высоты ячейки.
    expect(MIN_COMFORTABLE_CELL_MM).toBeGreaterThanOrEqual(20);
    expect(MIN_COMFORTABLE_CELL_MM).toBeLessThanOrEqual(35);
  });

  it('порог можно задать снаружи', () => {
    expect(isCramped(layoutById('grid4'), SHEET_2X3, 10)).toBe(false);
    expect(isCramped(layoutById('single'), SHEET_4X6, 200)).toBe(true);
  });

  it('пустой список раскладок не ломает подсказку', () => {
    expect(crampedLayouts([], SHEET_2X3)).toEqual([]);
  });
});
