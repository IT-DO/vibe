import {MEDIA_4X6} from '../../printing/ipp/client';
import {sheetPixels} from '../geometry';
import {
  LAYOUTS,
  cellsForShot,
  estimateShootDurationMs,
  layoutById,
  type LayoutId,
} from '../layouts';

const SHEET = sheetPixels(MEDIA_4X6, 300); // 1200×1800
const DPI = 300;

describe('каталог раскладок', () => {
  it('каждая раскладка находится по своему идентификатору', () => {
    for (const layout of LAYOUTS) {
      expect(layoutById(layout.id).id).toBe(layout.id);
    }
  });

  it('неизвестный идентификатор откатывается на одиночный кадр', () => {
    expect(layoutById('нет-такой').id).toBe('single');
  });

  it('идентификаторы не повторяются', () => {
    const ids = LAYOUTS.map(l => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe.each(LAYOUTS.map(l => [l.id, l] as const))('раскладка «%s»', (_id, layout) => {
  const geometry = layout.geometry(SHEET, DPI);

  it('покрывает каждый снятый кадр хотя бы одной ячейкой', () => {
    const covered = new Set(geometry.cells.map(c => c.shotIndex));
    for (let i = 0; i < layout.shots; i++) {
      expect(covered.has(i)).toBe(true);
    }
  });

  it('не ссылается на несуществующие кадры', () => {
    for (const cell of geometry.cells) {
      expect(cell.shotIndex).toBeGreaterThanOrEqual(0);
      expect(cell.shotIndex).toBeLessThan(layout.shots);
    }
  });

  it('все ячейки помещаются на листе', () => {
    for (const {rect} of geometry.cells) {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(SHEET.width + 0.001);
      expect(rect.y + rect.height).toBeLessThanOrEqual(SHEET.height + 0.001);
    }
  });

  it('ячейки не вырождаются', () => {
    for (const {rect} of geometry.cells) {
      expect(rect.width).toBeGreaterThan(0);
      expect(rect.height).toBeGreaterThan(0);
    }
  });

  it('подпись, если она есть, тоже помещается на листе', () => {
    if (geometry.caption) {
      const {rect, fontSizePx} = geometry.caption;
      expect(rect.y + rect.height).toBeLessThanOrEqual(SHEET.height + 0.001);
      expect(fontSizePx).toBeGreaterThan(0);
      expect(fontSizePx).toBeLessThanOrEqual(rect.height);
    }
  });

  it('ячейки не перекрываются', () => {
    const rects = geometry.cells.map(c => c.rect);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]!;
        const b = rects[j]!;
        const overlaps =
          a.x < b.x + b.width - 0.001 &&
          b.x < a.x + a.width - 0.001 &&
          a.y < b.y + b.height - 0.001 &&
          b.y < a.y + a.height - 0.001;
        expect(overlaps).toBe(false);
      }
    }
  });
});

describe('одиночный кадр', () => {
  it('занимает весь лист без полей', () => {
    const geometry = layoutById('single').geometry(SHEET, DPI);
    expect(geometry.cells).toHaveLength(1);
    expect(geometry.cells[0]?.rect).toEqual({x: 0, y: 0, width: 1200, height: 1800});
  });
});

describe('двойная полоса', () => {
  const layout = layoutById('twinStrip3');
  const geometry = layout.geometry(SHEET, DPI);

  it('снимает три кадра, а печатает шесть ячеек', () => {
    expect(layout.shots).toBe(3);
    expect(geometry.cells).toHaveLength(6);
  });

  it('каждый кадр печатается дважды — по одному на половину', () => {
    for (let shot = 0; shot < 3; shot++) {
      const cells = cellsForShot(geometry, shot);
      expect(cells).toHaveLength(2);
      // Одна ячейка слева от линии отрыва, другая справа.
      const left = cells.filter(c => c.rect.x < SHEET.width / 2);
      expect(left).toHaveLength(1);
    }
  });

  it('половины одинакового размера', () => {
    const [first, second] = cellsForShot(geometry, 0);
    expect(first!.rect.width).toBeCloseTo(second!.rect.width, 6);
    expect(first!.rect.height).toBeCloseTo(second!.rect.height, 6);
  });

  it('линия отрыва проходит посередине листа', () => {
    expect(geometry.tearLine).toEqual({x: 600});
  });
});

describe('полароид', () => {
  it('оставляет широкое поле снизу под подпись', () => {
    const geometry = layoutById('polaroid').geometry(SHEET, DPI);
    const photo = geometry.cells[0]!.rect;
    const caption = geometry.caption!;
    // Нижнее поле заметно шире верхнего — узнаваемая пропорция.
    const topMargin = photo.y;
    const bottomMargin = SHEET.height - (photo.y + photo.height);
    expect(bottomMargin).toBeGreaterThan(topMargin * 5);
    expect(caption.rect.y).toBeGreaterThanOrEqual(photo.y + photo.height);
  });
});

describe('сетка 2×2', () => {
  it('раскладывает четыре кадра по одному в ячейку', () => {
    const geometry = layoutById('grid4').geometry(SHEET, DPI);
    expect(geometry.cells).toHaveLength(4);
    expect(geometry.cells.map(c => c.shotIndex)).toEqual([0, 1, 2, 3]);
  });
});

describe('estimateShootDurationMs', () => {
  it('складывает обратный отсчёт и паузы между кадрами', () => {
    const layout = layoutById('twinStrip3'); // 3 кадра, пауза 1200 мс
    expect(estimateShootDurationMs(layout, 3_000)).toBe(3 * 3_000 + 2 * 1_200);
  });

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
    expect(ids).toContain('twinStrip3');
  });
});
