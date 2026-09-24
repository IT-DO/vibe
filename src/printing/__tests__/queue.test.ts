import {PrintQueue, type QueueSnapshot, type QueuedJob} from '../queue';
import {
  FakeDocuments,
  FakeScheduler,
  FakeStorage,
  FakeTransport,
  blockedError,
  fatalError,
  transientError,
} from './fakes';

interface Harness {
  queue: PrintQueue;
  transport: FakeTransport;
  storage: FakeStorage;
  documents: FakeDocuments;
  scheduler: FakeScheduler;
}

function makeQueue(
  options: {files?: string[]; stored?: QueuedJob[]; maxAttempts?: number} = {},
): Harness {
  const transport = new FakeTransport();
  const storage = new FakeStorage(options.stored ?? []);
  const documents = new FakeDocuments(options.files ?? ['/photos/1.jpg', '/photos/2.jpg']);
  const scheduler = new FakeScheduler();
  const queue = new PrintQueue({
    transport,
    storage,
    documents,
    scheduler,
    maxAttempts: options.maxAttempts ?? 3,
    // Дрожание отключаем: тесты должны быть детерминированными.
    random: () => 0.5,
  });
  return {queue, transport, storage, documents, scheduler};
}

const jobInput = (filePath: string, name = 'Фото') => ({
  filePath,
  format: 'image/jpeg',
  name,
  copies: 1,
  media: 'na_index-4x6_4x6in',
});

describe('постановка в очередь', () => {
  it('печатает задание и помечает его выполненным', async () => {
    const h = makeQueue();
    await h.queue.enqueue(jobInput('/photos/1.jpg'));

    const result = await h.queue.step();

    expect(result.kind).toBe('printed');
    expect(h.transport.submitted).toHaveLength(1);
    expect(h.transport.submitted[0]).toMatchObject({
      format: 'image/jpeg',
      name: 'Фото',
      copies: 1,
      media: 'na_index-4x6_4x6in',
    });
    expect(h.queue.snapshot().jobs[0]?.state).toBe('done');
    expect(h.queue.snapshot().pending).toBe(0);
  });

  it('удаляет файл снимка после успешной печати', async () => {
    const h = makeQueue();
    await h.queue.enqueue(jobInput('/photos/1.jpg'));
    await h.queue.step();
    expect(h.documents.removed).toEqual(['/photos/1.jpg']);
  });

  it('обрабатывает задания по порядку постановки', async () => {
    const h = makeQueue();
    await h.queue.enqueue(jobInput('/photos/1.jpg', 'первый'));
    await h.queue.enqueue(jobInput('/photos/2.jpg', 'второй'));

    await h.queue.step();
    await h.queue.step();

    expect(h.transport.submitted.map(d => d.name)).toEqual(['первый', 'второй']);
  });

  it('за один шаг берёт не больше одного задания', async () => {
    const h = makeQueue();
    await h.queue.enqueue(jobInput('/photos/1.jpg'));
    await h.queue.enqueue(jobInput('/photos/2.jpg'));

    await h.queue.step();

    expect(h.transport.submitted).toHaveLength(1);
    expect(h.queue.snapshot().pending).toBe(1);
  });

  it('на пустой очереди ничего не делает', async () => {
    const h = makeQueue();
    expect(await h.queue.step()).toEqual({kind: 'idle'});
    expect(h.transport.submitted).toHaveLength(0);
  });

  it('выдаёт заданиям разные идентификаторы', async () => {
    const h = makeQueue();
    const a = await h.queue.enqueue(jobInput('/photos/1.jpg'));
    const b = await h.queue.enqueue(jobInput('/photos/2.jpg'));
    expect(a.id).not.toBe(b.id);
  });
});

describe('повторные попытки', () => {
  it('повторяет задание после временного сбоя', async () => {
    const h = makeQueue();
    h.transport.submitOutcomes = [transientError()];
    await h.queue.enqueue(jobInput('/photos/1.jpg'));

    const first = await h.queue.step();
    expect(first.kind).toBe('retry');
    expect(h.queue.snapshot().jobs[0]).toMatchObject({state: 'queued', attempts: 1});

    // Пока не наступило время повтора, задание не берётся.
    expect(await h.queue.step()).toEqual({kind: 'idle'});

    h.scheduler.advance(5_000);
    expect((await h.queue.step()).kind).toBe('printed');
    expect(h.transport.submitted).toHaveLength(2);
  });

  it('увеличивает паузу между попытками', async () => {
    const h = makeQueue({maxAttempts: 5});
    h.transport.submitOutcomes = [transientError(), transientError(), transientError()];
    await h.queue.enqueue(jobInput('/photos/1.jpg'));

    const delays: number[] = [];
    for (let i = 0; i < 3; i++) {
      const result = await h.queue.step();
      if (result.kind === 'retry') {
        delays.push(result.delayMs);
      }
      h.scheduler.advance(120_000);
    }

    expect(delays).toEqual([2_000, 4_000, 8_000]);
  });

  it('сдаётся после исчерпания попыток', async () => {
    const h = makeQueue({maxAttempts: 2});
    h.transport.submitOutcomes = [transientError(), transientError()];
    await h.queue.enqueue(jobInput('/photos/1.jpg'));

    expect((await h.queue.step()).kind).toBe('retry');
    h.scheduler.advance(120_000);
    const last = await h.queue.step();

    expect(last.kind).toBe('failed');
    expect(h.queue.snapshot().jobs[0]).toMatchObject({
      state: 'failed',
      attempts: 2,
      error: 'Wi-Fi отвалился',
    });
  });

  it('не повторяет фатальную ошибку', async () => {
    const h = makeQueue({maxAttempts: 5});
    h.transport.submitOutcomes = [fatalError()];
    await h.queue.enqueue(jobInput('/photos/1.jpg'));

    const result = await h.queue.step();

    expect(result.kind).toBe('failed');
    expect(h.queue.snapshot().jobs[0]?.attempts).toBe(1);
    expect(h.transport.submitted).toHaveLength(1);
  });

  it('пропавший файл снимка не роняет очередь', async () => {
    const h = makeQueue({files: []});
    await h.queue.enqueue(jobInput('/photos/нет.jpg'));
    const result = await h.queue.step();
    expect(result.kind).toBe('retry');
  });
});

describe('принтер требует вмешательства', () => {
  it('встаёт на паузу, когда кончилась бумага', async () => {
    const h = makeQueue();
    h.transport.status = {health: 'blocked', blockingReason: 'media-empty'};
    await h.queue.enqueue(jobInput('/photos/1.jpg'));

    const result = await h.queue.step();

    expect(result).toEqual({kind: 'blocked', reason: 'media-empty'});
    expect(h.transport.submitted).toHaveLength(0);
    expect(h.queue.snapshot()).toMatchObject({paused: true, pausedReason: 'media-empty'});
  });

  it('не тратит попытки, пока принтер заблокирован', async () => {
    const h = makeQueue();
    h.transport.status = {health: 'blocked', blockingReason: 'cover-open'};
    await h.queue.enqueue(jobInput('/photos/1.jpg'));

    await h.queue.step();
    await h.queue.step();
    await h.queue.step();

    expect(h.queue.snapshot().jobs[0]?.attempts).toBe(0);
  });

  it('сам продолжает печать, когда бумагу вставили', async () => {
    const h = makeQueue();
    h.transport.status = {health: 'blocked', blockingReason: 'media-empty'};
    await h.queue.enqueue(jobInput('/photos/1.jpg'));
    expect((await h.queue.step()).kind).toBe('blocked');

    h.transport.status = {health: 'ready'};
    const result = await h.queue.step();

    expect(result.kind).toBe('printed');
    expect(h.queue.snapshot().paused).toBe(false);
  });

  it('отказ принтера принимать задания тоже ставит очередь на паузу', async () => {
    const h = makeQueue();
    h.transport.submitOutcomes = [blockedError()];
    await h.queue.enqueue(jobInput('/photos/1.jpg'));

    const result = await h.queue.step();

    expect(result.kind).toBe('blocked');
    // Попытка возвращена: виноват принтер, а не снимок.
    expect(h.queue.snapshot().jobs[0]).toMatchObject({state: 'queued', attempts: 0});
  });

  it('недоступный принтер не блокирует очередь, а уводит задание в повтор', async () => {
    const h = makeQueue();
    h.transport.statusError = transientError();
    h.transport.submitOutcomes = [transientError()];
    await h.queue.enqueue(jobInput('/photos/1.jpg'));

    const result = await h.queue.step();

    expect(result.kind).toBe('retry');
    expect(h.queue.snapshot().printer?.health).toBe('unknown');
  });
});

describe('отслеживание задания на принтере', () => {
  it('ждёт подтверждения печати, если транспорт это умеет', async () => {
    const h = makeQueue();
    h.transport.canTrackJobs = true;
    h.transport.trackOutcomes = [
      {state: 'pending', reasons: []},
      {state: 'printing', reasons: []},
      {state: 'done', reasons: []},
    ];
    await h.queue.enqueue(jobInput('/photos/1.jpg'));

    expect((await h.queue.step()).kind).toBe('printed');
    expect(h.scheduler.slept.length).toBeGreaterThanOrEqual(2);
  });

  it('считает прерванное принтером задание неудачей', async () => {
    const h = makeQueue({maxAttempts: 1});
    h.transport.canTrackJobs = true;
    h.transport.trackOutcomes = [{state: 'failed', reasons: ['media-jam']}];
    await h.queue.enqueue(jobInput('/photos/1.jpg'));

    const result = await h.queue.step();

    expect(result.kind).toBe('failed');
    expect(h.queue.snapshot().jobs[0]?.error).toContain('media-jam');
  });

  it('не зависает навсегда, если принтер молчит о завершении', async () => {
    const h = makeQueue();
    h.transport.canTrackJobs = true;
    // Всегда «печатается» — подтверждения не будет никогда.
    h.transport.trackJob = async () => ({state: 'printing' as const, reasons: []});
    await h.queue.enqueue(jobInput('/photos/1.jpg'));

    const result = await h.queue.step();

    expect(result.kind).toBe('printed');
    expect(h.queue.snapshot().jobs[0]?.error).toMatch(/не подтвердил/);
  });
});

describe('управление заданиями', () => {
  it('отменяет задание из очереди', async () => {
    const h = makeQueue();
    const job = await h.queue.enqueue(jobInput('/photos/1.jpg'));

    expect(await h.queue.cancel(job.id)).toBe(true);
    expect(h.queue.snapshot().jobs[0]).toMatchObject({
      state: 'failed',
      error: 'Отменено оператором',
    });
    expect(await h.queue.step()).toEqual({kind: 'idle'});
  });

  it('отменяет уже отправленное задание через транспорт', async () => {
    const h = makeQueue();
    h.transport.canTrackJobs = true;
    h.transport.trackJob = async () => ({state: 'printing' as const, reasons: []});
    const job = await h.queue.enqueue(jobInput('/photos/1.jpg'));
    await h.queue.step(); // задание ушло на принтер и получило remoteId

    await h.queue.cancel(job.id);

    // Задание уже завершилось по таймауту подтверждения, отменять нечего.
    expect(h.queue.snapshot().jobs[0]?.state).toBe('done');
  });

  it('не отменяет уже напечатанное', async () => {
    const h = makeQueue();
    const job = await h.queue.enqueue(jobInput('/photos/1.jpg'));
    await h.queue.step();
    expect(await h.queue.cancel(job.id)).toBe(false);
  });

  it('возвращает неудачное задание в очередь', async () => {
    const h = makeQueue({maxAttempts: 1});
    h.transport.submitOutcomes = [fatalError()];
    const job = await h.queue.enqueue(jobInput('/photos/1.jpg'));
    await h.queue.step();
    expect(h.queue.snapshot().jobs[0]?.state).toBe('failed');

    expect(await h.queue.retry(job.id)).toBe(true);
    expect(h.queue.snapshot().jobs[0]).toMatchObject({state: 'queued', attempts: 0});
    expect((await h.queue.step()).kind).toBe('printed');
  });

  it('не перезапускает то, что не падало', async () => {
    const h = makeQueue();
    const job = await h.queue.enqueue(jobInput('/photos/1.jpg'));
    expect(await h.queue.retry(job.id)).toBe(false);
  });

  it('игнорирует неизвестные идентификаторы', async () => {
    const h = makeQueue();
    expect(await h.queue.cancel('нет-такого')).toBe(false);
    expect(await h.queue.retry('нет-такого')).toBe(false);
  });
});

describe('сохранение состояния', () => {
  it('сохраняет очередь при каждом изменении', async () => {
    const h = makeQueue();
    await h.queue.enqueue(jobInput('/photos/1.jpg'));
    expect(h.storage.saveCount).toBeGreaterThan(0);
    expect(h.storage.saved[0]).toMatchObject({filePath: '/photos/1.jpg', state: 'queued'});
  });

  it('после перезапуска возвращает недоотправленные задания в очередь', async () => {
    const stored: QueuedJob[] = [
      {
        id: 'job-1',
        filePath: '/photos/1.jpg',
        format: 'image/jpeg',
        name: 'Фото',
        copies: 1,
        state: 'sending',
        attempts: 1,
        createdAt: 0,
        nextAttemptAt: 0,
        remoteId: 55,
      },
    ];
    const h = makeQueue({stored});

    await h.queue.restore();

    expect(h.queue.snapshot().jobs[0]).toMatchObject({state: 'queued', remoteId: null});
    expect((await h.queue.step()).kind).toBe('printed');
  });

  it('не трогает завершённые задания при восстановлении', async () => {
    const stored: QueuedJob[] = [
      {
        id: 'job-1',
        filePath: '/photos/1.jpg',
        format: 'image/jpeg',
        name: 'Фото',
        copies: 1,
        state: 'done',
        attempts: 1,
        createdAt: 0,
        nextAttemptAt: 0,
        remoteId: 55,
        finishedAt: 1_699_999_999_999,
      },
    ];
    const h = makeQueue({stored});
    await h.queue.restore();
    expect(h.queue.snapshot().jobs[0]?.state).toBe('done');
  });

  it('сбой хранилища не мешает печатать', async () => {
    const h = makeQueue();
    h.storage.save = async () => {
      throw new Error('нет места на диске');
    };
    await h.queue.enqueue(jobInput('/photos/1.jpg'));
    expect((await h.queue.step()).kind).toBe('printed');
  });
});

describe('подписка на изменения', () => {
  it('присылает снимок сразу и при каждом изменении', async () => {
    const h = makeQueue();
    const seen: QueueSnapshot[] = [];
    const unsubscribe = h.queue.subscribe(s => seen.push(s));

    expect(seen).toHaveLength(1);
    expect(seen[0]?.pending).toBe(0);

    await h.queue.enqueue(jobInput('/photos/1.jpg'));
    expect(seen.length).toBeGreaterThan(1);
    expect(seen[seen.length - 1]?.pending).toBe(1);

    unsubscribe();
    const before = seen.length;
    await h.queue.enqueue(jobInput('/photos/2.jpg'));
    expect(seen).toHaveLength(before);
  });

  it('показывает, какое задание печатается прямо сейчас', async () => {
    const h = makeQueue();
    h.transport.canTrackJobs = true;
    const states: (string | null)[] = [];
    h.queue.subscribe(s => states.push(s.current?.state ?? null));

    await h.queue.enqueue(jobInput('/photos/1.jpg'));
    await h.queue.step();

    expect(states).toContain('sending');
    expect(states).toContain('printing');
    expect(states[states.length - 1]).toBeNull();
  });

  it('убирает старые завершённые задания из списка', async () => {
    const h = makeQueue();
    await h.queue.enqueue(jobInput('/photos/1.jpg'));
    await h.queue.step();
    expect(h.queue.snapshot().jobs).toHaveLength(1);

    h.scheduler.advance(11 * 60_000);
    await h.queue.step();

    expect(h.queue.snapshot().jobs).toHaveLength(0);
  });
});

describe('фоновый цикл', () => {
  it('разбирает очередь без ручных шагов', async () => {
    const h = makeQueue();
    await h.queue.enqueue(jobInput('/photos/1.jpg'));
    await h.queue.enqueue(jobInput('/photos/2.jpg'));

    h.queue.start();
    // Даём циклу прокрутиться: планировщик поддельный, реального ожидания нет.
    for (let i = 0; i < 20 && h.queue.snapshot().pending > 0; i++) {
      await Promise.resolve();
    }
    await h.queue.stop();

    expect(h.transport.submitted).toHaveLength(2);
    expect(h.queue.snapshot().pending).toBe(0);
  });

  it('повторный start не запускает второй цикл', async () => {
    const h = makeQueue();
    h.queue.start();
    h.queue.start();
    await h.queue.enqueue(jobInput('/photos/1.jpg'));
    for (let i = 0; i < 20 && h.queue.snapshot().pending > 0; i++) {
      await Promise.resolve();
    }
    await h.queue.stop();
    expect(h.transport.submitted).toHaveLength(1);
  });
});
