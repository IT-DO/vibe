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

beforeEach(() => {
  canvas = fakeCanvas();
  fontCalls = [];
  alive = {now: 0, peak: 0, loaded: 0};

  const snapshot = {
    encodeToBytes: () => Uint8Array.from([1, 2, 3]),
    readPixels: () => new Uint8Array(4),
    dispose: jest.fn(),
  };

  Object.assign(Skia as object, {
    Surface: {
      MakeOffscreen: () => ({
        getCanvas: () => canvas,
        flush: jest.fn(),
        makeImageSnapshot: () => snapshot,
      }),
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
        return {
          width: () => 3024,
          height: () => 4032,
          dispose: () => {
            alive.now -= 1;
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
