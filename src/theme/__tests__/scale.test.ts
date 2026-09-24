import {
  MAX_FONT_SCALE,
  MAX_SCALE,
  MIN_FONT_SCALE,
  MIN_SCALE,
  REFERENCE_HEIGHT,
  REFERENCE_WIDTH,
  fontScaleAdjustment,
  isPhoneSized,
  scaleAll,
  scaleFactorFor,
  scaleValue,
} from '../scale';

/**
 * Настоящие размеры окна в единицах RN у устройств, на которых будку
 * реально запускают. Взяты парами: масштаб теперь считается по обеим
 * сторонам, и одна короткая сторона о вытянутом экране ничего не говорит.
 */
const SCREENS = {
  'телефон 6,1" (20:9)': {width: 390, height: 844},
  'телефон 6,7" (20:9)': {width: 430, height: 932},
  'планшет 8" (16:10)': {width: 600, height: 960},
  'iPad 10,9" (4:3)': {width: 820, height: 1180},
  'планшет 12,9" (4:3)': {width: 1024, height: 1366},
} as const;

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


describe('масштаб по обеим сторонам экрана', () => {
  it('на эталонном планшете ничего не меняет', () => {
    expect(scaleFactorFor({width: REFERENCE_WIDTH, height: REFERENCE_HEIGHT})).toBe(1);
  });

  it('растёт вместе с экраном на реальных устройствах', () => {
    const factors = Object.values(SCREENS).map(s => scaleFactorFor(s));
    for (let i = 1; i < factors.length; i++) {
      expect(factors[i]!).toBeGreaterThanOrEqual(factors[i - 1]!);
    }
  });

  it('вытянутый экран ограничен высотой, а не шириной', () => {
    // Широкий, но низкий экран — телефон в разделённом режиме или планшет
    // с открытой клавиатурой. По ширине места хватает, а низ заставки с
    // кнопкой «Выбрать готовое фото» уже не помещается.
    const wideLow = {width: 800, height: 500};
    const square = {width: 800, height: 1067};
    expect(scaleFactorFor(wideLow)).toBeLessThan(scaleFactorFor(square));
  });

  it('ориентация не влияет: считаются короткая и длинная стороны', () => {
    expect(scaleFactorFor({width: 390, height: 844})).toBe(
      scaleFactorFor({width: 844, height: 390}),
    );
  });

  it('число вместо размеров понимается как короткая сторона', () => {
    // Старый способ вызова: экран задавался одной стороной.
    expect(scaleFactorFor(REFERENCE_WIDTH)).toBe(1);
    expect(scaleFactorFor(360)).toBeCloseTo(scaleFactorFor({width: 360, height: 480}), 2);
  });

  it('на бессмысленных размерах отдаёт 1, а не ломает вёрстку', () => {
    expect(scaleFactorFor({width: 0, height: 0})).toBe(1);
    expect(scaleFactorFor({width: -100, height: 800})).toBe(1);
    expect(scaleFactorFor({width: Number.NaN, height: 800})).toBe(1);
  });

  it('держится в границах на любом устройстве', () => {
    for (const screen of Object.values(SCREENS)) {
      const factor = scaleFactorFor(screen);
      expect(factor).toBeGreaterThanOrEqual(MIN_SCALE);
      expect(factor).toBeLessThanOrEqual(MAX_SCALE);
    }
  });
});

describe('поправка на системный размер шрифта', () => {
  it('при обычной настройке ничего не меняет', () => {
    expect(fontScaleAdjustment(1)).toBe(1);
  });

  it('крупный системный шрифт учитывается, но приглушённо', () => {
    // Подчиниться целиком нельзя: при 1.3 призыв на заставке перестанет
    // помещаться в строку у всех гостей ради настройки владельца.
    const adjustment = fontScaleAdjustment(1.3);
    expect(adjustment).toBeGreaterThan(1);
    expect(adjustment).toBeLessThan(1.15);
  });

  it('мелкий системный шрифт тоже учитывается приглушённо', () => {
    const adjustment = fontScaleAdjustment(0.85);
    expect(adjustment).toBeLessThan(1);
    expect(adjustment).toBeGreaterThan(0.9);
  });

  it('не выходит за границы даже при предельных настройках', () => {
    expect(fontScaleAdjustment(3)).toBeLessThanOrEqual(MAX_FONT_SCALE);
    expect(fontScaleAdjustment(0.1)).toBeGreaterThanOrEqual(MIN_FONT_SCALE);
  });

  it('на бессмысленном значении отдаёт 1', () => {
    expect(fontScaleAdjustment(0)).toBe(1);
    expect(fontScaleAdjustment(Number.NaN)).toBe(1);
    expect(fontScaleAdjustment(-1)).toBe(1);
  });
});

describe('размеры текста на реальных устройствах', () => {
  const BASE = {countdown: 280, display: 72, title: 44, body: 24, caption: 18};

  it('подпись остаётся читаемой даже на самом мелком экране', () => {
    // Ниже 12 pt текст на вытянутой руке уже не разобрать.
    const factor = scaleFactorFor(SCREENS['телефон 6,1" (20:9)']);
    const sizes = scaleAll(BASE, factor);
    expect(sizes.caption).toBeGreaterThanOrEqual(12);
  });

  it('отсчёт помещается в высоту экрана на всех устройствах', () => {
    for (const [name, screen] of Object.entries(SCREENS)) {
      const sizes = scaleAll(BASE, scaleFactorFor(screen));
      // Цифра отсчёта занимает примерно кегль по высоте; вместе с призывом
      // и кнопкой отмены она должна оставлять место остальному экрану.
      expect(`${name}: ${sizes.countdown < screen.height * 0.6}`).toBe(`${name}: true`);
    }
  });

  it('иерархия кеглей сохраняется на любом экране', () => {
    for (const screen of Object.values(SCREENS)) {
      const s = scaleAll(BASE, scaleFactorFor(screen));
      expect(s.countdown).toBeGreaterThan(s.display);
      expect(s.display).toBeGreaterThan(s.title);
      expect(s.title).toBeGreaterThan(s.body);
      expect(s.body).toBeGreaterThan(s.caption);
    }
  });
});
