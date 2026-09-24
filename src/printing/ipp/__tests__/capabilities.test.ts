import {
  chooseDocumentFormat,
  chooseMedia,
  chooseResolution,
  evaluateHealth,
  normalizeStateReason,
  parsePwgMediaSize,
  type MediaOption,
} from '../capabilities';
import {MEDIA_3X3, MEDIA_4X6} from '../client';
import {PrinterState} from '../constants';

describe('parsePwgMediaSize', () => {
  it('разбирает дюймовые имена', () => {
    expect(parsePwgMediaSize('na_index-4x6_4x6in')).toEqual({
      widthMm: 101.6,
      heightMm: 152.4,
    });
  });

  it('разбирает миллиметровые имена', () => {
    expect(parsePwgMediaSize('om_photo-3x3_76.2x76.2mm')).toEqual({
      widthMm: 76.2,
      heightMm: 76.2,
    });
  });

  it('разбирает дробные дюймы', () => {
    expect(parsePwgMediaSize('na_5x7_5x7in')).toEqual({widthMm: 127, heightMm: 177.8});
    expect(parsePwgMediaSize('iso_a4_210x297mm')).toEqual({widthMm: 210, heightMm: 297});
  });

  it('возвращает null для имён без размера', () => {
    expect(parsePwgMediaSize('custom_xiaomi_photo')).toBeNull();
    expect(parsePwgMediaSize('')).toBeNull();
    expect(parsePwgMediaSize('na_index-4x6')).toBeNull();
  });
});

describe('chooseDocumentFormat', () => {
  it('предпочитает JPEG, когда принтер его принимает', () => {
    expect(
      chooseDocumentFormat(['image/urf', 'image/pwg-raster', 'image/jpeg']),
    ).toBe('image/jpeg');
  });

  it('откатывается на PWG Raster без JPEG', () => {
    expect(chooseDocumentFormat(['image/urf', 'image/pwg-raster'])).toBe(
      'image/pwg-raster',
    );
  });

  it('откатывается на URF, если только он и есть', () => {
    expect(chooseDocumentFormat(['image/urf'])).toBe('image/urf');
  });

  it('не смущается регистром и пробелами', () => {
    expect(chooseDocumentFormat([' Image/JPEG '])).toBe('image/jpeg');
  });

  it('шлёт JPEG вслепую, если принтер не перечислил форматы', () => {
    expect(chooseDocumentFormat([])).toBe('image/jpeg');
  });

  it('возвращает null, если общего формата нет', () => {
    expect(chooseDocumentFormat(['application/pdf', 'text/plain'])).toBeNull();
  });
});

describe('chooseMedia', () => {
  const media: MediaOption[] = [
    {name: 'na_index-4x6_4x6in', widthMm: 101.6, heightMm: 152.4},
    {name: 'om_photo-3x3_76.2x76.2mm', widthMm: 76.2, heightMm: 76.2},
    {name: 'iso_a4_210x297mm', widthMm: 210, heightMm: 297},
  ];

  it('находит точное совпадение 10x15', () => {
    expect(chooseMedia(media, MEDIA_4X6)?.name).toBe('na_index-4x6_4x6in');
  });

  it('находит квадратный формат 3x3', () => {
    expect(chooseMedia(media, MEDIA_3X3)?.name).toBe('om_photo-3x3_76.2x76.2mm');
  });

  it('сопоставляет размер, повёрнутый на 90°', () => {
    expect(chooseMedia(media, {widthMm: 152.4, heightMm: 101.6})?.name).toBe(
      'na_index-4x6_4x6in',
    );
  });

  it('терпит небольшое расхождение в пределах допуска', () => {
    expect(chooseMedia(media, {widthMm: 100, heightMm: 150})?.name).toBe(
      'na_index-4x6_4x6in',
    );
  });

  it('возвращает null, когда подходящей бумаги нет', () => {
    expect(chooseMedia(media, {widthMm: 500, heightMm: 700})).toBeNull();
  });

  it('возвращает null для пустого списка', () => {
    expect(chooseMedia([], MEDIA_4X6)).toBeNull();
  });
});

describe('chooseResolution', () => {
  it('берёт максимальное по площади точек', () => {
    expect(
      chooseResolution([
        {kind: 'resolution', x: 150, y: 150, units: 3},
        {kind: 'resolution', x: 300, y: 300, units: 3},
      ]),
    ).toMatchObject({x: 300});
  });

  it('возвращает null для пустого списка', () => {
    expect(chooseResolution([])).toBeNull();
  });
});

describe('normalizeStateReason', () => {
  it('срезает суффиксы уровня серьёзности', () => {
    expect(normalizeStateReason('media-empty-warning')).toBe('media-empty');
    expect(normalizeStateReason('marker-supply-low-report')).toBe('marker-supply-low');
    expect(normalizeStateReason('cover-open-error')).toBe('cover-open');
  });

  it('оставляет причину без суффикса как есть', () => {
    expect(normalizeStateReason('media-jam')).toBe('media-jam');
  });
});

describe('evaluateHealth', () => {
  it('готов к печати при idle без замечаний', () => {
    expect(evaluateHealth(PrinterState.Idle, ['none'])).toEqual({health: 'ready'});
  });

  it('занят при processing', () => {
    expect(evaluateHealth(PrinterState.Processing, ['none'])).toEqual({health: 'busy'});
  });

  it('блокируется при закончившейся бумаге', () => {
    expect(evaluateHealth(PrinterState.Idle, ['media-empty'])).toEqual({
      health: 'blocked',
      blockingReason: 'media-empty',
    });
  });

  it('блокируется при открытой крышке даже с суффиксом -warning', () => {
    expect(evaluateHealth(PrinterState.Idle, ['cover-open-warning'])).toMatchObject({
      health: 'blocked',
      blockingReason: 'cover-open',
    });
  });

  it('предупреждает, но не блокирует, когда бумага кончается', () => {
    expect(evaluateHealth(PrinterState.Idle, ['media-low-report'])).toEqual({
      health: 'warning',
    });
  });

  it('состояние stopped блокирует само по себе', () => {
    expect(evaluateHealth(PrinterState.Stopped, ['none']).health).toBe('blocked');
  });

  it('блокирующая причина важнее предупреждающей', () => {
    expect(
      evaluateHealth(PrinterState.Idle, ['media-low', 'media-jam']),
    ).toMatchObject({health: 'blocked', blockingReason: 'media-jam'});
  });

  it('неизвестное состояние помечается как unknown', () => {
    expect(evaluateHealth(0, [])).toEqual({health: 'unknown'});
  });
});
