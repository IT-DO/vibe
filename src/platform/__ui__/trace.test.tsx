/**
 * Подробная трассировка.
 *
 * Проверяется не текст строк, а свойства, от которых зависит польза:
 * выключенная запись не стоит ничего, включённая не теряет шаги, сбои
 * доходят до журнала даже с выключенной отладкой, а буфер не растёт
 * бесконечно, если журнал вдруг перестал писаться.
 */

const mockRecordError = jest.fn(async (_context: string, _details: unknown) => undefined);
jest.mock('../crashlog', () => ({
  recordError: (context: string, details: unknown) => mockRecordError(context, details),
}));

import {
  flushTrace,
  isTraceEnabled,
  pendingTraceLines,
  resetTrace,
  setTraceEnabled,
  trace,
  traceFailure,
} from '../trace';

beforeEach(() => {
  resetTrace();
  mockRecordError.mockClear();
});

afterEach(() => {
  resetTrace();
});

/** Всё, что ушло в журнал, одной строкой. */
function written(): string {
  return mockRecordError.mock.calls.map(call => String(call[1])).join('\n');
}

describe('выключенная запись', () => {
  it('ничего не копит и не пишет', async () => {
    trace('сборка', 'шаг', {n: 1});
    trace('печать', 'ещё шаг');
    expect(pendingTraceLines()).toBe(0);
    await flushTrace();
    expect(mockRecordError).not.toHaveBeenCalled();
  });

  it('сбой пишет всё равно — ради этого журнал и нужен', async () => {
    traceFailure('печать', 'отправка листа', new Error('принтер молчит'));
    expect(mockRecordError).toHaveBeenCalled();
    expect(written()).toMatch(/СБОЙ: отправка листа — принтер молчит/);
  });
});

describe('включённая запись', () => {
  beforeEach(() => setTraceEnabled(true));

  it('включение само отмечается в журнале', async () => {
    await flushTrace();
    expect(written()).toMatch(/подробная запись включена/);
  });

  it('шаги копятся и уходят пачкой, а не по одному', async () => {
    mockRecordError.mockClear();
    for (let i = 0; i < 5; i++) {
      trace('сборка', `шаг ${i}`);
    }
    expect(pendingTraceLines()).toBeGreaterThan(0);
    expect(mockRecordError).not.toHaveBeenCalled();

    await flushTrace();
    // Одна запись в журнал на все пять шагов: 227 кадров отпечатка иначе
    // дали бы 227 переходов через мост.
    expect(mockRecordError).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 5; i++) {
      expect(written()).toContain(`шаг ${i}`);
    }
  });

  it('подробности попадают в строку как ключ=значение', async () => {
    trace('печать', 'кусок отправлен', {номер: 7, всего: 227});
    await flushTrace();
    expect(written()).toMatch(/кусок отправлен номер=7 всего=227/);
  });

  it('время указано с точностью до миллисекунд — по нему видно задержки', async () => {
    trace('сессия', 'снимок');
    await flushTrace();
    expect(written()).toMatch(/\d{2}:\d{2}:\d{2}\.\d{3} \[сессия] снимок/);
  });

  it('длинные значения обрезаются — журнал должен оставаться читаемым', async () => {
    trace('сборка', 'путь', {path: 'x'.repeat(500)});
    await flushTrace();
    const line = written();
    expect(line).toContain('…');
    expect(line.length).toBeLessThan(400);
  });

  it('ошибка в подробностях показывается сообщением, а не «[object]»', async () => {
    trace('печать', 'неудача', {причина: new Error('нет бумаги')});
    await flushTrace();
    expect(written()).toContain('причина=нет бумаги');
  });

  it('большая пачка выгружается сама, без ожидания', async () => {
    mockRecordError.mockClear();
    for (let i = 0; i < 45; i++) {
      trace('сборка', `шаг ${i}`);
    }
    expect(mockRecordError).toHaveBeenCalled();
  });

  it('буфер не растёт бесконечно, если журнал не пишется', () => {
    for (let i = 0; i < 5_000; i++) {
      trace('шум', `шаг ${i}`);
    }
    expect(pendingTraceLines()).toBeLessThanOrEqual(2_000);
  });

  it('выключение дописывает накопленное', async () => {
    mockRecordError.mockClear();
    trace('сборка', 'последний шаг перед выключением');
    setTraceEnabled(false);
    await Promise.resolve();
    expect(written()).toContain('последний шаг перед выключением');
    expect(isTraceEnabled()).toBe(false);
  });

  it('повторное включение не дублирует отметку', async () => {
    await flushTrace(); // убираем отметку, сделанную при первом включении
    mockRecordError.mockClear();

    setTraceEnabled(true);
    await flushTrace();
    expect(mockRecordError).not.toHaveBeenCalled();
  });
});

describe('сбой при включённой записи', () => {
  it('выгружает и предшествующие шаги — по ним видно, что привело к отказу', async () => {
    setTraceEnabled(true);
    mockRecordError.mockClear();
    trace('печать', 'соединение открыто');
    trace('печать', 'задание принято');
    traceFailure('печать', 'передача файла', new Error('связь оборвана'));

    const log = written();
    expect(log).toContain('соединение открыто');
    expect(log).toContain('задание принято');
    expect(log).toMatch(/СБОЙ: передача файла — связь оборвана/);
  });
});
