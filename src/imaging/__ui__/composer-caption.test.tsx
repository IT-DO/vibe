/**
 * Сборка листа: подпись.
 *
 * Отдельный тест ради одной регрессии. `Skia.Font()` в типах принимает
 * шрифт необязательным, но нативная часть на `undefined` выбрасывает
 * «Value is undefined, expected an Object» — и падает не подпись, а вся
 * сборка листа. Снаружи это выглядело так: «превью на режимах два кадра,
 * полароид, четыре кадра, полоска на двоих не работает». Подпись рисуют
 * именно они — у одиночного кадра места под неё в раскладке нет.
 *
 * Рисование не проверяется: холст здесь поддельный, а как выглядит
 * отпечаток, видно только на бумаге. Проверяется контракт с Skia.
 */

import {Skia} from '@shopify/react-native-skia';

import {composeSheet, DEFAULT_COMPOSE} from '../composer';
import {LAYOUTS, layoutById, type LayoutId} from '../layouts';

/** Поддельный холст: считает вызовы, ничего не рисует. */
function fakeCanvas() {
  return {
    clear: jest.fn(),
    save: jest.fn(),
    restore: jest.fn(),
    translate: jest.fn(),
    scale: jest.fn(),
    drawImageRect: jest.fn(),
    drawImage: jest.fn(),
    drawText: jest.fn(),
    drawLine: jest.fn(),
    drawRect: jest.fn(),
  };
}

let canvas: ReturnType<typeof fakeCanvas>;
let fontCalls: unknown[][];
/** Сколько снимков разом держится в памяти и каким был пик. */
let alive: {now: number; peak: number; loaded: number};
/** Порядок обращений к холсту и кадрам — по нему видно, что чему предшествует. */
let log: string[];
/** Что вернёт `MakeOffscreen`; `null` — холст создать не удалось. */
let surfaceAvailable: boolean;

beforeEach(() => {
  canvas = fakeCanvas();
  fontCalls = [];
  alive = {now: 0, peak: 0, loaded: 0};
  log = [];
  surfaceAvailable = true;

  // Снимок холста видеокарты — изображение-текстура: прочитать его
  // пиксели нельзя, пока не приведёшь к обычному изображению. Ровно так
  // ведёт себя настоящая Skia, и ровно на этом ломался лист на устройстве.
  const plain = {
    encodeToBytes: () => Uint8Array.from([1, 2, 3]),
    readPixels: () => new Uint8Array(4),
    makeNonTextureImage: () => plain,
    dispose: jest.fn(),
  };
  const texture = {
    encodeToBytes: () => null,
    readPixels: () => null,
    makeNonTextureImage: () => plain,
    dispose: jest.fn(),
  };
  const snapshot = plain;

  Object.assign(Skia as object, {
    Surface: {
      Make: (width: number, height: number) => {
        log.push(`холст в памяти ${width}×${height}`);
        return surfaceAvailable
          ? {
              getCanvas: () => canvas,
              flush: () => log.push(`растеризация ${width}×${height}`),
              makeImageSnapshot: () => snapshot,
            }
          : null;
      },
      MakeOffscreen: (width: number, height: number) => {
        log.push(`холст на видеокарте ${width}×${height}`);
        return surfaceAvailable
          ? {
              getCanvas: () => canvas,
              flush: () => log.push(`растеризация ${width}×${height}`),
              makeImageSnapshot: () => texture,
            }
          : null;
      },
    },
    Color: (value: string) => value,
    Paint: () => ({
      setColor: jest.fn(),
      setAntiAlias: jest.fn(),
      setStrokeWidth: jest.fn(),
    }),
    XYWHRect: (x: number, y: number, w: number, h: number) => ({x, y, width: w, height: h}),
    Data: {fromURI: jest.fn(async () => ({size: 10}))},
    Image: {
      MakeImageFromEncoded: () => {
        alive.now += 1;
        alive.loaded += 1;
        alive.peak = Math.max(alive.peak, alive.now);
        const id = alive.loaded;
        log.push(`кадр ${id} прочитан`);
        return {
          width: () => 3024,
          height: () => 4032,
          dispose: () => {
            alive.now -= 1;
            log.push(`кадр ${id} освобождён`);
          },
        };
      },
    },
    Font: (...args: unknown[]) => {
      fontCalls.push(args);
      // Нативная часть Skia ведёт себя именно так: `undefined` вместо
      // шрифта — исключение, а не «шрифт по умолчанию».
      if (args[0] === undefined) {
        throw new Error('Value is undefined, expected an Object');
      }
      return {measureText: () => ({width: 120})};
    },
  });
});

const TYPEFACE = {__brand: 'lobster'} as never;

/** Собирает лист выбранной раскладки. */
function compose(layoutId: LayoutId, extra: Record<string, unknown> = {}) {
  const layout = layoutById(layoutId);
  return composeSheet({
    shotPaths: Array.from({length: layout.shots}, (_, i) => `/кадры/${i}.jpg`),
    layout,
    media: {widthMm: 102, heightMm: 152},
    dpi: 300,
    caption: {title: 'Свадьба Ани и Пети', subtitle: '12 сентября', color: '#2A2A32'},
    ...DEFAULT_COMPOSE,
    mirror: false,
    ...extra,
  });
}

describe('лист собирается для каждой раскладки', () => {
  it.each(LAYOUTS.map(l => l.id))('%s — со шрифтом', async layoutId => {
    const sheet = await compose(layoutId, {typeface: TYPEFACE});
    expect(sheet.jpeg.length).toBeGreaterThan(0);
  });

  it.each(LAYOUTS.map(l => l.id))('%s — без шрифта', async layoutId => {
    // Ровно та ситуация, в которой падало: шрифта нет, подпись задана.
    const sheet = await compose(layoutId);
    expect(sheet.jpeg.length).toBeGreaterThan(0);
  });
});

describe('обращение к Skia.Font', () => {
  it('без шрифта не происходит вовсе', async () => {
    await compose('duo');
    expect(fontCalls).toHaveLength(0);
  });

  it('со шрифтом происходит и шрифт передаётся первым доводом', async () => {
    await compose('duo', {typeface: TYPEFACE});
    expect(fontCalls.length).toBeGreaterThan(0);
    for (const args of fontCalls) {
      expect(args[0]).toBe(TYPEFACE);
      expect(args[0]).not.toBeUndefined();
    }
  });

  it('подзаголовок набирается тем же шрифтом', async () => {
    await compose('duo', {typeface: TYPEFACE});
    expect(fontCalls).toHaveLength(2);
    expect(fontCalls[1]![0]).toBe(TYPEFACE);
  });

  it('без подзаголовка второго шрифта не создаётся', async () => {
    await compose('duo', {
      typeface: TYPEFACE,
      caption: {title: 'Юбилей', color: '#2A2A32'},
    });
    expect(fontCalls).toHaveLength(1);
  });
});

describe('подпись на листе', () => {
  it('без шрифта текст не рисуется, но кадры рисуются', async () => {
    await compose('polaroid');
    expect(canvas.drawText).not.toHaveBeenCalled();
    expect(canvas.drawImageRect).toHaveBeenCalled();
  });

  it('со шрифтом рисуются и кадры, и подпись', async () => {
    await compose('polaroid', {typeface: TYPEFACE});
    expect(canvas.drawText).toHaveBeenCalled();
    expect(canvas.drawImageRect).toHaveBeenCalled();
  });

  it('у одиночного кадра подписи нет — места под неё в раскладке не отведено', async () => {
    await compose('single', {typeface: TYPEFACE});
    expect(canvas.drawText).not.toHaveBeenCalled();
  });
});


describe('расход памяти на сборке листа', () => {
  it('в памяти живёт не больше одного снимка разом', async () => {
    // Кадр 12 Мп в распакованном виде — около 48 МБ. Четыре кадра «сетки»
    // держали бы под 200 МБ, и телефон не переживал сборку: гость видел
    // пустой прямоугольник вместо своей фотографии.
    await compose('polaroid', {typeface: TYPEFACE});
    expect(alive.peak).toBe(1);
  });

  it.each(LAYOUTS.map(l => l.id))('%s — пик в один снимок', async layoutId => {
    await compose(layoutId, {typeface: TYPEFACE});
    expect(alive.peak).toBe(1);
  });

  it('после сборки не остаётся ни одного незакрытого снимка', async () => {
    await compose('duo', {typeface: TYPEFACE});
    expect(alive.now).toBe(0);
  });

  it('каждый снимок читается ровно один раз', async () => {
    await compose('duo', {typeface: TYPEFACE});
    expect(alive.loaded).toBe(layoutById('duo').shots);
  });

  it('кадры рисуются во все свои ячейки', async () => {
    await compose('duo', {typeface: TYPEFACE});
    const cells = layoutById('duo').geometry(
      {width: 600, height: 900},
      300,
    ).cells.length;
    expect(canvas.drawImageRect).toHaveBeenCalledTimes(cells);
  });

  it('непрочитанный кадр не роняет лист и не течёт', async () => {
    (Skia as unknown as {Image: {MakeImageFromEncoded: () => null}}).Image = {
      MakeImageFromEncoded: () => null,
    };
    const sheet = await compose('polaroid', {typeface: TYPEFACE});
    expect(sheet.jpeg.length).toBeGreaterThan(0);
    expect(canvas.drawImageRect).not.toHaveBeenCalled();
  });
});

describe('кадр освобождается только после растеризации', () => {
  it('между чтением кадра и его освобождением холст растеризуется', async () => {
    // Холст на видеокарте рисует отложенно: если отпустить текстуру
    // раньше, к моменту выполнения она уже ничья — кадр не попадёт на
    // лист. Снаружи это выглядит как пустой отпечаток.
    await compose('duo', {typeface: TYPEFACE});

    const ids = log
      .filter(entry => entry.endsWith('прочитан'))
      .map(entry => entry.split(' ')[1]!);
    expect(ids).toHaveLength(2);

    for (const id of ids) {
      const read = log.indexOf(`кадр ${id} прочитан`);
      const freed = log.indexOf(`кадр ${id} освобождён`);
      expect(freed).toBeGreaterThan(read);

      const rasterized = log.findIndex(
        (entry, at) => at > read && at < freed && entry.startsWith('растеризация'),
      );
      expect(rasterized).toBeGreaterThan(read);
    }
  });

  it('в памяти всё равно держится не больше одного кадра', async () => {
    // Растеризация не должна отменить главное: снимок 12 Мп занимает
    // около 48 МБ, и держать их все телефон не переживал.
    await compose('duo', {typeface: TYPEFACE});
    expect(alive.peak).toBe(1);
  });
});

describe('ошибка сборки называет место', () => {
  it('невозможный холст сообщает свой размер', async () => {
    // По размеру сразу видно, упёрлись ли мы в ограничение видеопамяти.
    surfaceAvailable = false;
    await expect(compose('single')).rejects.toThrow(/Не удалось создать холст \d+×\d+/);
  });

  it('нечитаемый кадр не роняет лист — ячейка остаётся фоном', async () => {
    // Отпечаток без одного кадра лучше, чем отсутствие отпечатка: гость
    // хотя бы что-то заберёт, а оператор увидит причину в журнале.
    Object.assign(Skia as object, {
      Data: {
        fromURI: async () => {
          throw new Error('файл не читается');
        },
      },
    });
    const sheet = await compose('single');
    expect(sheet.jpeg.length).toBeGreaterThan(0);
  });

  it('молчащее чтение кадра не останавливает лист навсегда', async () => {
    // Нативная часть Skia при неудаче не отклоняет обещание, а молчит.
    // Без срока ожидания сборка встала бы здесь и не вернулась никогда.
    Object.assign(Skia as object, {
      Data: {fromURI: () => new Promise(() => {})},
    });

    jest.useFakeTimers();
    try {
      const building = compose('single');
      await jest.advanceTimersByTimeAsync(10_000);
      const sheet = await building;
      // Лист вышел: ячейка осталась фоном, но отпечаток есть.
      expect(sheet.jpeg.length).toBeGreaterThan(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('падение на подписи помечено стадией, а не теряется', async () => {
    // Раньше отсюда приходило голое «Value is undefined, expected an
    // Object» — по такому сообщению место происшествия не найти.
    Object.assign(Skia as object, {
      Font: () => {
        throw new Error('Value is undefined, expected an Object');
      },
    });
    await expect(compose('duo', {typeface: TYPEFACE})).rejects.toThrow(
      /стадия «подпись»/,
    );
  });
});

describe('холст для сборки листа', () => {
  it('берётся в памяти, а не на видеокарте', async () => {
    // Пиксели холста видеокарты из потока JavaScript не прочитать, и лист
    // выходил пустым при исправном коде и зелёных тестах.
    await compose('single');
    expect(log.some(entry => entry.startsWith('холст в памяти'))).toBe(true);
    expect(log.some(entry => entry.startsWith('холст на видеокарте'))).toBe(false);
  });

  it('снимок приводится к читаемому — иначе JPEG не закодировать', async () => {
    // Сборка Skia без `Make`: остаётся холст видеокарты, и снимок с него
    // обязан пройти через `makeNonTextureImage`.
    const surface = (Skia as unknown as {Surface: Record<string, unknown>}).Surface;
    const withoutMake = {MakeOffscreen: surface.MakeOffscreen};
    Object.assign(Skia as object, {Surface: withoutMake});

    const sheet = await compose('single');
    expect(log.some(entry => entry.startsWith('холст на видеокарте'))).toBe(true);
    // Текстура вернула бы `null` и уронила сборку; приведённый снимок — байты.
    expect(sheet.jpeg.length).toBeGreaterThan(0);
  });
});
