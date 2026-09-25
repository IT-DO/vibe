/**
 * Подробная трассировка работы приложения.
 *
 * Зачем она есть. Будка стоит на чужом устройстве, и когда она «просто не
 * печатает», единственный способ понять причину — увидеть, до какого шага
 * дело дошло. Догадки по симптомам стоят целой итерации: сборка, установка,
 * попытка, новый симптом. Трассировка сокращает это до одного круга.
 *
 * Почему с буфером. Журнал пишется через нативный модуль, и каждая запись —
 * переход через мост. Отправка снимка — это 227 кадров; по вызову на кадр
 * замедлило бы ровно то, что мы измеряем. Поэтому строки копятся в памяти и
 * уходят пачкой.
 *
 * Выключенная трассировка не стоит почти ничего: проверка булева значения
 * и выход. Именно поэтому вызовы расставлены щедро — включать их обратно по
 * одному, когда что-то сломалось, было бы поздно.
 */

import {recordError} from './crashlog';

/** Сколько строк копить, прежде чем писать в журнал. */
const BATCH = 40;

/** Через сколько выгружать накопленное, даже если строк мало. */
const FLUSH_DELAY_MS = 1_000;

/**
 * Предел строк в памяти.
 *
 * Если журнал вдруг перестал писаться (нет нативного модуля, кончилось
 * место), буфер не должен расти бесконечно и съедать память устройства.
 */
const MAX_BUFFERED = 2_000;

let enabled = false;
let buffer: string[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

/** Включена ли подробная запись. */
export function isTraceEnabled(): boolean {
  return enabled;
}

/**
 * Включает или выключает подробную запись.
 *
 * При выключении накопленное дописывается: последние строки перед тем, как
 * оператор выключил отладку, — обычно самые интересные.
 */
export function setTraceEnabled(on: boolean): void {
  if (enabled === on) {
    return;
  }
  enabled = on;
  if (on) {
    write('отладка', 'подробная запись включена');
  } else {
    void flushTrace();
  }
}

/**
 * Записывает шаг.
 *
 * @param area   откуда шаг: «сборка», «печать», «bluetooth», «сессия»
 * @param what   что произошло — коротко и по-человечески
 * @param detail числа и имена, по которым потом искать причину
 */
export function trace(area: string, what: string, detail?: Record<string, unknown>): void {
  if (!enabled) {
    return;
  }
  write(area, what, detail);
}

/**
 * Записывает неудачу.
 *
 * Пишется всегда, даже с выключенной отладкой: сбой — это то, ради чего
 * журнал и существует. Накопленное выгружается сразу, потому что за сбоем
 * может последовать падение, и буфер до журнала уже не доедет.
 */
export function traceFailure(area: string, what: string, error: unknown): void {
  const reason = error instanceof Error ? error.message : String(error);
  write(area, `СБОЙ: ${what} — ${reason}`);
  void flushTrace();
}

/** Дописывает накопленное в журнал. */
export async function flushTrace(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (buffer.length === 0) {
    return;
  }
  const batch = buffer;
  buffer = [];
  await recordError('Трассировка', batch.join('\n'));
}

/** Сколько строк ждёт записи. Нужно админке и тестам. */
export function pendingTraceLines(): number {
  return buffer.length;
}

/** Сбрасывает состояние. Только для тестов. */
export function resetTrace(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  enabled = false;
  buffer = [];
}

function write(area: string, what: string, detail?: Record<string, unknown>): void {
  const now = new Date();
  const time =
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}` +
    `.${String(now.getMilliseconds()).padStart(3, '0')}`;

  buffer.push(`${time} [${area}] ${what}${detail ? ' ' + describe(detail) : ''}`);

  // Переполнение выбрасывает самое старое: последние шаги перед отказом
  // ценнее первых шагов давно прошедшего сеанса.
  if (buffer.length > MAX_BUFFERED) {
    buffer = buffer.slice(-MAX_BUFFERED);
  }

  if (buffer.length >= BATCH) {
    void flushTrace();
    return;
  }
  if (!timer) {
    timer = setTimeout(() => {
      timer = null;
      void flushTrace();
    }, FLUSH_DELAY_MS);
  }
}

/** Подробности одной строкой: `ключ=значение`. */
function describe(detail: Record<string, unknown>): string {
  return Object.entries(detail)
    .map(([key, value]) => `${key}=${format(value)}`)
    .join(' ');
}

function format(value: unknown): string {
  if (typeof value === 'string') {
    // Длинные строки (пути, JSON принтера) обрезаем: журнал должен
    // оставаться читаемым и помещаться в сообщение.
    return value.length > 120 ? `${value.slice(0, 120)}…` : value;
  }
  if (value instanceof Error) {
    return value.message;
  }
  if (value === null || value === undefined) {
    return String(value);
  }
  if (typeof value === 'object') {
    try {
      const json = JSON.stringify(value);
      return json.length > 120 ? `${json.slice(0, 120)}…` : json;
    } catch {
      return '[объект]';
    }
  }
  return String(value);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
