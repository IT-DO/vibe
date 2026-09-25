/**
 * Классификация ошибок печати.
 *
 * От неё зависит поведение очереди на мероприятии: временную ошибку надо
 * молча повторить, фатальную — показать оператору и не жечь бумагу, а
 * «принтеру нужен человек» — поставить очередь на паузу, ничего не потеряв.
 *
 * Основной путь распознавания неисправностей — не исключения, а опрос
 * состояния: перед каждым заданием очередь спрашивает принтер, и тот сам
 * сообщает про бумагу, крышку и заряд (`HanntoTransport.checkStatus`).
 * Сюда попадает то, что сломалось уже в процессе, — и по умолчанию это
 * считается временным, потому что потерять кадр гостя хуже, чем
 * попробовать ещё раз.
 */

import type {ErrorDisposition} from './types';

/**
 * Принтеру нужен человек: кончилась бумага, открыта крышка, сел аккумулятор.
 *
 * Очередь встаёт на паузу, задания сохраняются и печатаются после починки.
 */
export class PrinterBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrinterBlockedError';
  }
}

/**
 * Задание не будет принято никогда: повторять его бессмысленно.
 *
 * Например, файл не того формата или больше, чем принтер готов принять.
 */
export class PrinterFatalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrinterFatalError';
  }
}

/** Определяет, что делать с ошибкой. */
export function classifyError(error: unknown): ErrorDisposition {
  if (error instanceof PrinterBlockedError) {
    return 'blocked';
  }
  if (error instanceof PrinterFatalError) {
    return 'fatal';
  }
  // Незнакомая ошибка — считаем временной. Bluetooth на площадке рвётся
  // регулярно: планшет унесли, принтер задели, кто-то подключился с
  // телефона. Всё это проходит само, и повтор здесь дешевле отказа.
  return 'retry';
}

/** Текст ошибки для оператора (админка и журнал). */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Задержка перед повтором: экспоненциальный рост со «дрожанием».
 * Дрожание нужно, чтобы после восстановления связи несколько отложенных
 * заданий не ломились в принтер одновременно.
 */
export function retryDelayMs(
  attempt: number,
  baseMs = 2_000,
  maxMs = 60_000,
  jitter: () => number = Math.random,
): number {
  const exponential = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1));
  // ±20 % от полученной задержки.
  const spread = exponential * 0.2;
  return Math.round(exponential - spread + jitter() * spread * 2);
}
