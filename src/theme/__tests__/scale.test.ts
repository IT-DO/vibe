import {
  MAX_SCALE,
  MIN_SCALE,
  REFERENCE_WIDTH,
  isPhoneSized,
  scaleAll,
  scaleFactorFor,
  scaleValue,
} from '../scale';

/** Короткая сторона экрана в единицах RN у типичных устройств. */
const DEVICES = {
  'телефон 5,5"': 360,
  'телефон 6,7"': 430,
  'планшет 8"': 600,
  'iPad 10,9"': 820,
  'планшет 12,9"': 1024,
} as const;

describe('scaleFactorFor', () => {
  it('на эталонном планшете ничего не меняет', () => {
    expect(scaleFactorFor(REFERENCE_WIDTH)).toBe(1);
  });

  it('уменьшает интерфейс на телефоне, но не вдвое', () => {
    const factor = scaleFactorFor(DEVICES['телефон 5,5"']);
    expect(factor).toBeGreaterThanOrEqual(MIN_SCALE);
    expect(factor).toBeLessThan(1);
    // Экран вдвое уже эталонного — размеры падают примерно на четверть.
    expect(factor).toBeCloseTo(0.725, 3);
  });

  it('растёт вместе с экраном', () => {
    const sizes = Object.values(DEVICES);
    const factors = sizes.map(s => scaleFactorFor(s));
    for (let i = 1; i < factors.length; i++) {
      expect(factors[i]!).toBeGreaterThanOrEqual(factors[i - 1]!);
    }
  });

  it('не опускается ниже нижней границы', () => {
    expect(scaleFactorFor(100)).toBe(MIN_SCALE);
    expect(scaleFactorFor(1)).toBe(MIN_SCALE);
  });

  it('не поднимается выше верхней границы', () => {
    expect(scaleFactorFor(4000)).toBe(MAX_SCALE);
  });

  it('на бессмысленных значениях возвращает 1, а не ломает вёрстку', () => {
    expect(scaleFactorFor(0)).toBe(1);
    expect(scaleFactorFor(-500)).toBe(1);
    expect(scaleFactorFor(Number.NaN)).toBe(1);
    expect(scaleFactorFor(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe('scaleValue', () => {
  it('масштабирует и округляет', () => {
    expect(scaleValue(120, 0.725)).toBe(87);
    expect(scaleValue(320, 0.725)).toBe(232);
  });

  it('единичный масштаб оставляет значение как есть', () => {
    expect(scaleValue(44, 1)).toBe(44);
  });
});

describe('scaleAll', () => {
  it('масштабирует все значения набора', () => {
    expect(scaleAll({a: 100, b: 50}, 0.5)).toEqual({a: 50, b: 25});
  });

  it('не трогает служебно большие значения вроде радиуса пилюли', () => {
    expect(scaleAll({pill: 999, md: 20}, 0.5)).toEqual({pill: 999, md: 10});
  });

  it('сохраняет набор ключей', () => {
    const source = {countdown: 280, display: 72, body: 24};
    expect(Object.keys(scaleAll(source, 0.8))).toEqual(Object.keys(source));
  });
});

describe('пригодность результата для киоска', () => {
  it('на телефоне две кнопки просмотра помещаются в ряд или переносятся', () => {
    // Экран 360 dp: две кнопки по 232 dp в ряд не встанут — вёрстка их
    // переносит (flexWrap). Проверяем, что одна кнопка точно помещается.
    const factor = scaleFactorFor(360);
    const buttonWidth = scaleValue(320, factor);
    expect(buttonWidth).toBeLessThan(360 - 32);
  });

  it('цель нажатия остаётся крупнее системного минимума в 44 pt', () => {
    for (const shortestSide of Object.values(DEVICES)) {
      const factor = scaleFactorFor(shortestSide);
      expect(scaleValue(96, factor)).toBeGreaterThan(44);
      expect(scaleValue(120, factor)).toBeGreaterThan(44);
    }
  });

  it('текст для гостя нигде не опускается ниже 16 pt', () => {
    for (const shortestSide of Object.values(DEVICES)) {
      const factor = scaleFactorFor(shortestSide);
      expect(scaleValue(24, factor)).toBeGreaterThanOrEqual(16);
    }
  });

  it('обратный отсчёт остаётся крупным на любом экране', () => {
    for (const shortestSide of Object.values(DEVICES)) {
      expect(scaleValue(280, scaleFactorFor(shortestSide))).toBeGreaterThan(150);
    }
  });

  it('заголовок мероприятия помещается на телефоне в три строки', () => {
    // Грубая оценка: кириллическая литера занимает ~0,55 кегля по ширине.
    const factor = scaleFactorFor(360);
    const fontSize = scaleValue(72, factor);
    const usableWidth = 360 - 48; // минус горизонтальные поля экрана
    const charsPerLine = Math.floor(usableWidth / (fontSize * 0.55));
    expect(charsPerLine * 3).toBeGreaterThanOrEqual('Свадьба Ани и Пети'.length);
  });
});

describe('isPhoneSized', () => {
  it('телефоны считает телефонами', () => {
    expect(isPhoneSized(360)).toBe(true);
    expect(isPhoneSized(430)).toBe(true);
  });

  it('планшеты — планшетами', () => {
    expect(isPhoneSized(600)).toBe(false);
    expect(isPhoneSized(820)).toBe(false);
  });
});
