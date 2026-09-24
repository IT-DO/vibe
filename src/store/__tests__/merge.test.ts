import {withDefaults} from '../merge';

const DEFAULTS = {
  locale: 'ru',
  printer: {transport: 'ipp', endpoint: null, copies: 1},
  flow: {layouts: ['single', 'grid4'], allowRetake: true},
  adminPin: '2468',
};

describe('withDefaults', () => {
  it('сохранённые значения побеждают', () => {
    const merged = withDefaults(DEFAULTS, {adminPin: '1111'});
    expect(merged.adminPin).toBe('1111');
  });

  it('поле, добавленное в новой версии, получает значение по умолчанию', () => {
    // Ровно этот случай ломался: сохранённый объект целиком заменял новый,
    // и новых полей в нём просто не было.
    const stored = {locale: 'en', printer: {transport: 'mock'}};
    const merged = withDefaults(DEFAULTS, stored);
    expect(merged.locale).toBe('en');
    expect(merged.printer.transport).toBe('mock');
    expect(merged.printer.copies).toBe(1);
    expect(merged.flow.allowRetake).toBe(true);
  });

  it('вложенные объекты сливаются вглубь, а не заменяются', () => {
    const merged = withDefaults(DEFAULTS, {printer: {copies: 3}});
    expect(merged.printer).toEqual({transport: 'ipp', endpoint: null, copies: 3});
  });

  it('значение неверного типа отбрасывается', () => {
    const merged = withDefaults(DEFAULTS, {adminPin: 1234, printer: 'сломано'});
    expect(merged.adminPin).toBe('2468');
    expect(merged.printer).toEqual(DEFAULTS.printer);
  });

  it('массив берётся целиком, а не дополняется', () => {
    const merged = withDefaults(DEFAULTS, {flow: {layouts: ['polaroid']}});
    expect(merged.flow.layouts).toEqual(['polaroid']);
  });

  it('null как значение по умолчанию сохраняется', () => {
    const merged = withDefaults(DEFAULTS, {});
    expect(merged.printer.endpoint).toBeNull();
  });

  it('сохранённое значение поверх null принимается', () => {
    const endpoint = {host: '192.168.1.5', port: 631, path: '/ipp/print'};
    const merged = withDefaults(DEFAULTS, {printer: {endpoint}});
    expect(merged.printer.endpoint).toEqual(endpoint);
  });

  it('пустое и мусорное хранилище дают значения по умолчанию', () => {
    for (const stored of [undefined, null, 'строка', 42, []]) {
      expect(withDefaults(DEFAULTS, stored)).toEqual(DEFAULTS);
    }
  });

  it('лишние поля из старых версий не протекают наружу', () => {
    const merged = withDefaults(DEFAULTS, {удалённоеПоле: 'мусор', locale: 'en'});
    expect(Object.keys(merged).sort()).toEqual(Object.keys(DEFAULTS).sort());
  });

  it('не изменяет ни эталон, ни сохранённое', () => {
    const stored = {printer: {copies: 5}};
    const snapshot = JSON.stringify(DEFAULTS);
    withDefaults(DEFAULTS, stored);
    expect(JSON.stringify(DEFAULTS)).toBe(snapshot);
    expect(stored).toEqual({printer: {copies: 5}});
  });
});
