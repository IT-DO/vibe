/**
 * Очередь печати.
 *
 * Главная причина её существования — время печати. Один снимок 10×15
 * сублимационный принтер выдаёт около 57 секунд. Если бы приложение ждало
 * завершения печати, у планшета выстроился бы затор: гость сфотографировался
 * и стоит минуту, пока следующий ждёт своей очереди. Поэтому экран
 * освобождается сразу после постановки задания, а очередь разбирает её сама.
 *
 * Что ещё она берёт на себя:
 *  - переживает перезапуск приложения (задания лежат в хранилище, не в памяти);
 *  - повторяет попытки при обрывах Wi-Fi с экспоненциальной задержкой;
 *  - встаёт на паузу, когда в принтере кончилась бумага или открыта крышка,
 *    и продолжает сама, как только оператор всё починил — ни один кадр не
 *    теряется;
 *  - не повторяет заведомо безнадёжные задания, чтобы не жечь ленту.
 */

import {classifyError, describeError, retryDelayMs} from './errors';
import type {PrinterTransport, TransportStatus} from './types';

/** Состояние задания в очереди. */
export type QueuedJobState = 'queued' | 'sending' | 'printing' | 'done' | 'failed';

/** Задание: ссылка на файл, а не сами байты — очередь должна переживать рестарт. */
export interface QueuedJob {
  readonly id: string;
  /** Путь к готовому к печати файлу на устройстве. */
  readonly filePath: string;
  readonly format: string;
  readonly name: string;
  readonly copies: number;
  readonly media?: string;
  /** Путь к превью для админки. */
  readonly thumbnailPath?: string;
  state: QueuedJobState;
  attempts: number;
  createdAt: number;
  /** Раньше этого момента задание не берём (задержка повтора). */
  nextAttemptAt: number;
  remoteId: number | null;
  error?: string;
  finishedAt?: number;
}

/** Постоянное хранилище очереди. */
export interface QueueStorage {
  load(): Promise<QueuedJob[]>;
  save(jobs: readonly QueuedJob[]): Promise<void>;
}

/** Доступ к файлам заданий. */
export interface DocumentLoader {
  read(path: string): Promise<Uint8Array>;
  remove(path: string): Promise<void>;
}

/** Часы и сон — вынесены наружу, чтобы тесты шли без реальных задержек. */
export interface Scheduler {
  now(): number;
  sleep(ms: number): Promise<void>;
}

/** Снимок состояния очереди для интерфейса. */
export interface QueueSnapshot {
  readonly jobs: readonly QueuedJob[];
  /** Сколько заданий ждёт печати (включая то, что печатается сейчас). */
  readonly pending: number;
  readonly current: QueuedJob | null;
  readonly printer: TransportStatus | null;
  readonly paused: boolean;
  readonly pausedReason?: string;
}

/** Чем закончился один шаг обработки. */
export type StepResult =
  | {kind: 'idle'}
  | {kind: 'printed'; job: QueuedJob}
  | {kind: 'retry'; job: QueuedJob; delayMs: number}
  | {kind: 'failed'; job: QueuedJob}
  | {kind: 'blocked'; reason: string};

export interface PrintQueueOptions {
  readonly transport: PrinterTransport;
  readonly storage: QueueStorage;
  readonly documents: DocumentLoader;
  readonly scheduler: Scheduler;
  /** Сколько раз повторять перед тем, как признать задание неудачным. */
  readonly maxAttempts?: number;
  /** Как часто перепроверять принтер, пока очередь на паузе. */
  readonly blockedRecheckMs?: number;
  /** Как долго держать завершённые задания в списке (для админки). */
  readonly historyMs?: number;
  /** Как часто опрашивать состояние задания на принтере. */
  readonly pollIntervalMs?: number;
  /** Предел ожидания завершения печати одного задания. */
  readonly printTimeoutMs?: number;
  /** Источник случайности для «дрожания» задержек. */
  readonly random?: () => number;
}

const DEFAULTS = {
  maxAttempts: 5,
  blockedRecheckMs: 5_000,
  historyMs: 10 * 60_000,
  pollIntervalMs: 3_000,
  printTimeoutMs: 180_000,
};

export class PrintQueue {
  private jobs: QueuedJob[] = [];
  private listeners = new Set<(snapshot: QueueSnapshot) => void>();
  private printerStatus: TransportStatus | null = null;
  private paused = false;
  private pausedReason: string | undefined;
  private running = false;
  private loopHandle: Promise<void> | null = null;
  private wake: (() => void) | null = null;
  private sequence = 0;

  private readonly opts: Required<Omit<PrintQueueOptions, 'transport' | 'storage' | 'documents' | 'scheduler'>> &
    Pick<PrintQueueOptions, 'transport' | 'storage' | 'documents' | 'scheduler'>;

  constructor(options: PrintQueueOptions) {
    this.opts = {
      transport: options.transport,
      storage: options.storage,
      documents: options.documents,
      scheduler: options.scheduler,
      maxAttempts: options.maxAttempts ?? DEFAULTS.maxAttempts,
      blockedRecheckMs: options.blockedRecheckMs ?? DEFAULTS.blockedRecheckMs,
      historyMs: options.historyMs ?? DEFAULTS.historyMs,
      pollIntervalMs: options.pollIntervalMs ?? DEFAULTS.pollIntervalMs,
      printTimeoutMs: options.printTimeoutMs ?? DEFAULTS.printTimeoutMs,
      random: options.random ?? Math.random,
    };
  }

  /** Восстанавливает очередь после перезапуска приложения. */
  async restore(): Promise<void> {
    const stored = await this.opts.storage.load();
    // Задание, застрявшее в «отправляется», после падения приложения могло и
    // не дойти. Возвращаем его в очередь: повторная печать лучше, чем гость
    // без фотографии.
    this.jobs = stored.map(job =>
      job.state === 'sending' || job.state === 'printing'
        ? {...job, state: 'queued' as const, remoteId: null}
        : job,
    );
    this.emit();
  }

  /** Ставит снимок в очередь. Возвращает созданное задание. */
  async enqueue(
    input: Omit<QueuedJob, 'id' | 'state' | 'attempts' | 'createdAt' | 'nextAttemptAt' | 'remoteId'>,
  ): Promise<QueuedJob> {
    const now = this.opts.scheduler.now();
    const job: QueuedJob = {
      ...input,
      id: `job-${now}-${++this.sequence}`,
      state: 'queued',
      attempts: 0,
      createdAt: now,
      nextAttemptAt: now,
      remoteId: null,
    };
    this.jobs.push(job);
    await this.persist();
    this.emit();
    this.wake?.();
    return job;
  }

  /** Снимает задание: из очереди — сразу, с принтера — через транспорт. */
  async cancel(jobId: string): Promise<boolean> {
    const job = this.jobs.find(j => j.id === jobId);
    if (!job || job.state === 'done' || job.state === 'failed') {
      return false;
    }
    if (job.remoteId !== null && this.opts.transport.cancelJob) {
      try {
        await this.opts.transport.cancelJob({
          remoteId: job.remoteId,
          submittedAt: job.createdAt,
        });
      } catch {
        // Принтер мог уже допечатать — для очереди это всё равно конец.
      }
    }
    job.state = 'failed';
    job.error = 'Отменено оператором';
    job.finishedAt = this.opts.scheduler.now();
    await this.releaseFile(job);
    await this.persist();
    this.emit();
    return true;
  }

  /** Возвращает неудачное задание в очередь (кнопка «повторить»). */
  async retry(jobId: string): Promise<boolean> {
    const job = this.jobs.find(j => j.id === jobId);
    if (!job || job.state !== 'failed') {
      return false;
    }
    job.state = 'queued';
    job.attempts = 0;
    job.nextAttemptAt = this.opts.scheduler.now();
    delete job.error;
    delete job.finishedAt;
    await this.persist();
    this.emit();
    this.wake?.();
    return true;
  }

  /** Текущее состояние для интерфейса. */
  snapshot(): QueueSnapshot {
    const current = this.jobs.find(j => j.state === 'sending' || j.state === 'printing') ?? null;
    return {
      jobs: [...this.jobs],
      pending: this.jobs.filter(j => j.state !== 'done' && j.state !== 'failed').length,
      current,
      printer: this.printerStatus,
      paused: this.paused,
      ...(this.pausedReason ? {pausedReason: this.pausedReason} : {}),
    };
  }

  /** Подписка на изменения; возвращает функцию отписки. */
  subscribe(listener: (snapshot: QueueSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  /** Запускает фоновую обработку. */
  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.loopHandle = this.loop();
  }

  /** Останавливает обработку и дожидается завершения текущего шага. */
  async stop(): Promise<void> {
    this.running = false;
    this.wake?.();
    await this.loopHandle;
    this.loopHandle = null;
  }

  private async loop(): Promise<void> {
    while (this.running) {
      const result = await this.step();
      if (!this.running) {
        break;
      }
      // Спим ровно столько, сколько нужно до следующего осмысленного действия.
      const idleMs =
        result.kind === 'blocked'
          ? this.opts.blockedRecheckMs
          : result.kind === 'retry'
            ? Math.min(result.delayMs, this.opts.blockedRecheckMs)
            : result.kind === 'idle'
              ? this.opts.blockedRecheckMs
              : 0;
      if (idleMs > 0) {
        await this.sleepInterruptible(idleMs);
      }
    }
  }

  /** Сон, который прерывается при появлении нового задания. */
  private sleepInterruptible(ms: number): Promise<void> {
    return new Promise<void>(resolve => {
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          this.wake = null;
          resolve();
        }
      };
      this.wake = finish;
      void this.opts.scheduler.sleep(ms).then(finish);
    });
  }

  /**
   * Обрабатывает не более одного задания. Вынесено в публичный метод,
   * чтобы тесты гоняли очередь по шагам, без фонового цикла.
   */
  async step(): Promise<StepResult> {
    this.pruneHistory();

    const job = this.nextReadyJob();
    if (!job) {
      return {kind: 'idle'};
    }

    // Перед отправкой спрашиваем принтер: не кончилась ли бумага. Дешевле
    // подождать, чем получить отказ и потратить попытку.
    const status = await this.checkPrinter();
    if (status.health === 'blocked') {
      this.paused = true;
      this.pausedReason = status.blockingReason ?? 'printer-stopped';
      this.emit();
      return {kind: 'blocked', reason: this.pausedReason};
    }

    if (this.paused) {
      this.paused = false;
      delete this.pausedReason;
    }

    job.state = 'sending';
    job.attempts += 1;
    // Поле ошибки описывает исход текущей попытки — чистим на входе, а не
    // после успеха: иначе затрём диагностику, записанную во время печати.
    delete job.error;
    this.emit();

    try {
      const data = await this.opts.documents.read(job.filePath);
      const submitted = await this.opts.transport.submit({
        data,
        format: job.format,
        name: job.name,
        copies: job.copies,
        ...(job.media ? {media: job.media} : {}),
      });

      job.remoteId = submitted.remoteId;
      job.state = 'printing';
      this.emit();

      if (this.opts.transport.canTrackJobs && this.opts.transport.trackJob) {
        await this.awaitCompletion(job, submitted.submittedAt);
      }

      job.state = 'done';
      job.finishedAt = this.opts.scheduler.now();
      await this.releaseFile(job);
      await this.persist();
      this.emit();
      return {kind: 'printed', job};
    } catch (error) {
      return this.handleFailure(job, error);
    }
  }

  /** Ждёт, пока принтер сообщит о завершении задания. */
  private async awaitCompletion(job: QueuedJob, submittedAt: number): Promise<void> {
    // Вызываем именно как метод транспорта: оторванная ссылка потеряла бы
    // `this`, а реализациям он нужен (у IPP-транспорта там клиент).
    const transport = this.opts.transport;
    const deadline = this.opts.scheduler.now() + this.opts.printTimeoutMs;

    for (;;) {
      const progress = await transport.trackJob!({remoteId: job.remoteId, submittedAt});
      if (progress.state === 'done') {
        return;
      }
      if (progress.state === 'failed' || progress.state === 'canceled') {
        throw new Error(
          progress.reasons.length > 0
            ? `Принтер прервал задание: ${progress.reasons.join(', ')}`
            : 'Принтер прервал задание',
        );
      }
      if (this.opts.scheduler.now() >= deadline) {
        // Дальше не ждём: лист, скорее всего, уже вышел, а очередь стоит.
        // Считаем задание выполненным, но помечаем для журнала.
        job.error = 'Принтер не подтвердил завершение вовремя';
        return;
      }
      await this.opts.scheduler.sleep(this.opts.pollIntervalMs);
    }
  }

  private async handleFailure(job: QueuedJob, error: unknown): Promise<StepResult> {
    const disposition = classifyError(error);
    job.error = describeError(error);

    if (disposition === 'blocked') {
      // Не тратим попытку: виноват не снимок, а принтер.
      job.attempts = Math.max(0, job.attempts - 1);
      job.state = 'queued';
      this.paused = true;
      this.pausedReason = job.error;
      job.nextAttemptAt = this.opts.scheduler.now() + this.opts.blockedRecheckMs;
      await this.persist();
      this.emit();
      return {kind: 'blocked', reason: job.error};
    }

    if (disposition === 'fatal' || job.attempts >= this.opts.maxAttempts) {
      job.state = 'failed';
      job.finishedAt = this.opts.scheduler.now();
      await this.persist();
      this.emit();
      return {kind: 'failed', job};
    }

    const delayMs = retryDelayMs(job.attempts, 2_000, 60_000, this.opts.random);
    job.state = 'queued';
    job.remoteId = null;
    job.nextAttemptAt = this.opts.scheduler.now() + delayMs;
    await this.persist();
    this.emit();
    return {kind: 'retry', job, delayMs};
  }

  /** Первое задание, готовое к отправке прямо сейчас. */
  private nextReadyJob(): QueuedJob | undefined {
    const now = this.opts.scheduler.now();
    return this.jobs.find(j => j.state === 'queued' && j.nextAttemptAt <= now);
  }

  private async checkPrinter(): Promise<TransportStatus> {
    try {
      this.printerStatus = await this.opts.transport.checkStatus();
    } catch (error) {
      // Принтер не отвечает — не блокируем очередь, пусть попытка отправки
      // сама решит судьбу задания и запустит механизм повторов.
      this.printerStatus = {health: 'unknown', blockingReason: describeError(error)};
    }
    return this.printerStatus;
  }

  /** Удаляет файл напечатанного снимка, если он больше не нужен. */
  private async releaseFile(job: QueuedJob): Promise<void> {
    try {
      await this.opts.documents.remove(job.filePath);
    } catch {
      // Файл мог быть удалён раньше — для очереди это не ошибка.
    }
  }

  /** Убирает из списка давно завершённые задания. */
  private pruneHistory(): void {
    const cutoff = this.opts.scheduler.now() - this.opts.historyMs;
    const before = this.jobs.length;
    this.jobs = this.jobs.filter(
      j =>
        (j.state !== 'done' && j.state !== 'failed') ||
        (j.finishedAt ?? j.createdAt) > cutoff,
    );
    if (this.jobs.length !== before) {
      this.emit();
    }
  }

  private async persist(): Promise<void> {
    try {
      await this.opts.storage.save(this.jobs);
    } catch {
      // Не смогли сохранить — очередь продолжает жить в памяти.
    }
  }

  private emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
