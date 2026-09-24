import {MEDIA_3X3, MEDIA_4X6} from '../../printing/ipp/client';
import {
  aspect,
  bleedOffset,
  containFit,
  coverCrop,
  effectiveDpi,
  gridCells,
  inset,
  isSharpEnough,
  mmToPx,
  sheetPixels,
  withBleed,
} from '../geometry';

describe('sheetPixels', () => {
  it('переводит лист 10×15 в 1200×1800 при 300 dpi', () => {
    expect(sheetPixels(MEDIA_4X6, 300)).toEqual({width: 1200, height: 1800});
  });

  it('разворачивает лист в альбомную ориентацию', () => {
    expect(sheetPixels(MEDIA_4X6, 300, 'landscape')).toEqual({width: 1800, height: 1200});
  });

  it('считает квадратный лист 3×3', () => {
    expect(sheetPixels(MEDIA_3X3, 300)).toEqual({width: 900, height: 900});
  });

  it('не зависит от порядка сторон во входных данных', () => {
    expect(sheetPixels({widthMm: 152.4, heightMm: 101.6}, 300)).toEqual({
      width: 1200,
      height: 1800,
    });
  });

  it('масштабируется вместе с разрешением', () => {
    expect(sheetPixels(MEDIA_4X6, 600)).toEqual({width: 2400, height: 3600});
  });
});

describe('mmToPx', () => {
  it('переводит миллиметры в пиксели', () => {
    expect(mmToPx(25.4, 300)).toBe(300);
    expect(mmToPx(4, 300)).toBe(47);
  });
});

describe('coverCrop', () => {
  it('режет по бокам, если исходник шире ячейки', () => {
    // Кадр 4:3 в портретную ячейку 2:3.
    const crop = coverCrop({width: 4000, height: 3000}, {width: 1200, height: 1800});
    expect(crop.height).toBe(3000);
    expect(crop.width).toBe(2000);
    expect(crop.x).toBe(1000); // симметрично по горизонтали
    expect(crop.y).toBe(0);
  });

  it('режет сверху и снизу, если исходник выше ячейки', () => {
    const crop = coverCrop({width: 3000, height: 4000}, {width: 1800, height: 1200});
    expect(crop.width).toBe(3000);
    expect(crop.height).toBe(2000);
    expect(crop.x).toBe(0);
  });

  it('по умолчанию смещает вертикальную обрезку выше центра', () => {
    const crop = coverCrop({width: 3000, height: 4000}, {width: 1800, height: 1200});
    const centered = (4000 - 2000) / 2;
    // Окно должно стоять выше центра — иначе на групповом кадре режет головы.
    expect(crop.y).toBeLessThan(centered);
    expect(crop.y).toBe(900);
  });

  it('слушается явного фокуса', () => {
    const top = coverCrop({width: 3000, height: 4000}, {width: 1800, height: 1200}, 0.5, 0);
    const bottom = coverCrop({width: 3000, height: 4000}, {width: 1800, height: 1200}, 0.5, 1);
    expect(top.y).toBe(0);
    expect(bottom.y).toBe(2000);
  });

  it('не выходит за пределы исходника при фокусе за границей', () => {
    const crop = coverCrop({width: 3000, height: 4000}, {width: 1800, height: 1200}, 0.5, 5);
    expect(crop.y).toBeLessThanOrEqual(4000 - crop.height);
    expect(crop.y).toBeGreaterThanOrEqual(0);
  });

  it('совпадающие пропорции не режет вовсе', () => {
    const crop = coverCrop({width: 2400, height: 3600}, {width: 1200, height: 1800});
    expect(crop).toEqual({x: 0, y: 0, width: 2400, height: 3600});
  });

  it('сохраняет пропорции ячейки', () => {
    const target = {width: 1200, height: 1800};
    const crop = coverCrop({width: 4032, height: 3024}, target);
    expect(aspect({width: crop.width, height: crop.height})).toBeCloseTo(aspect(target), 6);
  });
});

describe('containFit', () => {
  it('вписывает кадр целиком и центрирует его', () => {
    const fit = containFit({width: 4000, height: 3000}, {width: 1200, height: 1800});
    expect(fit.width).toBe(1200);
    expect(fit.height).toBe(900);
    expect(fit.x).toBe(0);
    expect(fit.y).toBe(450);
  });

  it('не увеличивает изображение сверх целевой области', () => {
    const fit = containFit({width: 100, height: 100}, {width: 1000, height: 500});
    expect(fit.height).toBe(500);
    expect(fit.width).toBe(500);
  });
});

describe('припуск под обрез', () => {
  it('увеличивает холст на заданный процент', () => {
    expect(withBleed({width: 1200, height: 1800}, 2)).toEqual({width: 1224, height: 1836});
  });

  it('нулевой припуск оставляет размер как есть', () => {
    expect(withBleed({width: 1200, height: 1800}, 0)).toEqual({width: 1200, height: 1800});
  });

  it('отрицательный припуск не уменьшает лист', () => {
    expect(withBleed({width: 1200, height: 1800}, -5)).toEqual({width: 1200, height: 1800});
  });

  it('смещение центрирует лист в холсте с припуском', () => {
    const sheet = {width: 1200, height: 1800};
    const bleed = withBleed(sheet, 2);
    expect(bleedOffset(sheet, bleed)).toEqual({dx: 12, dy: 18});
  });
});

describe('gridCells', () => {
  const area = {x: 0, y: 0, width: 1000, height: 1000};

  it('делит область на сетку с промежутками', () => {
    const cells = gridCells(area, 2, 2, 100);
    expect(cells).toHaveLength(4);
    expect(cells[0]).toEqual({x: 0, y: 0, width: 450, height: 450});
    expect(cells[3]).toEqual({x: 550, y: 550, width: 450, height: 450});
  });

  it('идёт слева направо, сверху вниз', () => {
    const cells = gridCells(area, 2, 2, 0);
    expect(cells.map(c => [c.x, c.y])).toEqual([
      [0, 0],
      [500, 0],
      [0, 500],
      [500, 500],
    ]);
  });

  it('ячейки не выходят за границы области', () => {
    for (const cell of gridCells({x: 10, y: 20, width: 500, height: 900}, 1, 3, 20)) {
      expect(cell.x).toBeGreaterThanOrEqual(10);
      expect(cell.y).toBeGreaterThanOrEqual(20);
      expect(cell.x + cell.width).toBeLessThanOrEqual(510.001);
      expect(cell.y + cell.height).toBeLessThanOrEqual(920.001);
    }
  });

  it('отвергает пустую сетку', () => {
    expect(() => gridCells(area, 0, 2, 0)).toThrow(RangeError);
  });
});

describe('inset', () => {
  it('сжимает прямоугольник со всех сторон', () => {
    expect(inset({x: 10, y: 10, width: 100, height: 100}, 5)).toEqual({
      x: 15,
      y: 15,
      width: 90,
      height: 90,
    });
  });

  it('не даёт уйти в отрицательный размер', () => {
    expect(inset({x: 0, y: 0, width: 10, height: 10}, 20).width).toBe(0);
  });
});

describe('оценка резкости', () => {
  it('камера 12 Мп с запасом закрывает лист 10×15', () => {
    // Кадр 4032×3024, обрезанный под 2:3, даёт 2016×3024.
    const crop = coverCrop({width: 4032, height: 3024}, {width: 1200, height: 1800});
    expect(
      isSharpEnough({width: crop.width, height: crop.height}, {width: 1200, height: 1800}, 300),
    ).toBe(true);
  });

  it('кадр с фронтальной камеры 640×480 для печати не годится', () => {
    const crop = coverCrop({width: 640, height: 480}, {width: 1200, height: 1800});
    expect(
      isSharpEnough({width: crop.width, height: crop.height}, {width: 1200, height: 1800}, 300),
    ).toBe(false);
  });

  it('считает фактическое разрешение отпечатка', () => {
    // Исходник вдвое меньше ячейки — значит, вдвое меньше и dpi.
    expect(effectiveDpi({width: 600, height: 900}, {width: 1200, height: 1800}, 300)).toBe(150);
  });

  it('исходник больше ячейки печатается с полным разрешением', () => {
    expect(
      effectiveDpi({width: 2400, height: 3600}, {width: 1200, height: 1800}, 300),
    ).toBe(600);
  });
});
