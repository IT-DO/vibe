/**
 * Классификация ошибок печати.
 *
 * Проверяется то, от чего зависит судьба кадра гостя: что очередь повторит,
 * что покажет оператору, а из-за чего встанет на паузу.
 */

import {
  PrinterBlockedError,
  PrinterFatalError,
  classifyError,
  describeError,
  retryDelayMs,
} from '../errors';

describe('classifyError', () => {
  it('«принтеру нужен человек» — пауза, а не отказ', () => {
    // Задание не виновато: оно напечатается, как только вставят бумагу.
    expect(classifyError(new PrinterBlockedError('Закончилась бумага'))).toBe('blocked');
  });

  it('безнадёжное задание не повторяет — иначе будет жечь бумагу', () => {
    expect(classifyError(new PrinterFatalError('Формат не поддерживается'))).toBe('fatal');
  });

  it('обрыв связи считает временным', () => {
    // На площадке Bluetooth рвётся регулярно и восстанавливается сам.
    expect(classifyError(new Error('Связь с принтером прервана'))).toBe('retry');
  });

  it('незнакомую ошибку считает временной, чтобы не потерять кадр', () => {
    expect(classifyError('что-то пошло не так')).toBe('retry');
    expect(classifyError(undefined)).toBe('retry');
  });
});

describe('describeError', () => {
  it('достаёт текст из ошибок', () => {
    expect(describeError(new PrinterBlockedError('нет бумаги'))).toBe('нет бумаги');
    expect(describeError(new Error('ой'))).toBe('ой');
    expect(describeError('просто строка')).toBe('просто строка');
  });
});

describe('retryDelayMs', () => {
  const noJitter = () => 0.5;

  it('растёт экспоненциально', () => {
    expect(retryDelayMs(1, 2_000, 60_000, noJitter)).toBe(2_000);
    expect(retryDelayMs(2, 2_000, 60_000, noJitter)).toBe(4_000);
    expect(retryDelayMs(3, 2_000, 60_000, noJitter)).toBe(8_000);
  });

  it('не превышает потолок', () => {
    expect(retryDelayMs(20, 2_000, 60_000, noJitter)).toBe(60_000);
  });

  it('добавляет дрожание в пределах ±20 %', () => {
    expect(retryDelayMs(3, 2_000, 60_000, () => 0)).toBe(6_400);
    expect(retryDelayMs(3, 2_000, 60_000, () => 1)).toBe(9_600);
  });

  it('не уходит в минус на нулевой попытке', () => {
    expect(retryDelayMs(0, 2_000, 60_000, noJitter)).toBe(2_000);
  });
});
