import {
  LAYOUTS,
  estimateShootDurationMs,
  layoutById,
  type LayoutId,
} from '../layouts';

const DPI = 300;

describe('каталог раскладок', () => {
  it('для одиночного кадра равна одному отсчёту', () => {
    expect(estimateShootDurationMs(layoutById('single'), 3_000)).toBe(3_000);
  });

  it('серия из нескольких кадров укладывается в разумное ожидание', () => {
    // Гость не должен стоять перед камерой дольше полуминуты.
    for (const layout of LAYOUTS) {
      expect(estimateShootDurationMs(layout, 3_000)).toBeLessThanOrEqual(30_000);
    }
  });
});

describe('раскладки на квадратном листе 3×3', () => {
  it('пересчитываются без выхода за границы', () => {
    const square = {width: 900, height: 900};
    for (const layout of LAYOUTS) {
      for (const {rect} of layout.geometry(square, DPI).cells) {
        expect(rect.x + rect.width).toBeLessThanOrEqual(square.width + 0.001);
        expect(rect.y + rect.height).toBeLessThanOrEqual(square.height + 0.001);
        expect(rect.width).toBeGreaterThan(0);
        expect(rect.height).toBeGreaterThan(0);
      }
    }
  });
});

describe('типы', () => {
  it('идентификаторы раскладок совпадают с типом LayoutId', () => {
    const ids: LayoutId[] = LAYOUTS.map(l => l.id);
    expect(ids).toContain('single');
    expect(ids).toContain('duo');
  });
});
