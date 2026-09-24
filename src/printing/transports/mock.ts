/**
 * Транспорт-заглушка: «печатает» без принтера.
 *
 * Нужен на двух этапах:
 *  - разработка и репетиция сценария мероприятия, когда железа нет под рукой;
 *  - демо-режим на стенде, где принтер ещё не подключили, но интерфейс уже
 *    надо показать.
 *
 * Умеет имитировать неполадки, чтобы можно было прогнать поведение очереди
 * и экраны ошибок, не портя настоящую бумагу.
 */

import type {
  JobProgress,
  PrintDocument,
  PrinterTransport,
  SubmittedJob,
  TransportStatus,
} from '../types';

export interface MockTransportOptions {
  /** Сколько «печатается» один снимок. По умолчанию как у Xiaomi 1S. */
  readonly printDurationMs?: number;
  /** Доля отправок, которые завершатся ошибкой (0..1) — для проверки повторов. */
  readonly failureRate?: number;
  /** Сколько отпечатков «осталось» на ленте. */
  readonly suppliesPercent?: number;
  readonly now?: () => number;
  readonly random?: () => number;
}

export class MockTransport implements PrinterTransport {
  readonly id = 'mock';
  readonly label = 'Демо-режим (без принтера)';
  readonly canTrackJobs = true;
  readonly documentFormat = 'image/jpeg';

  readonly printed: PrintDocument[] = [];
  /** Ручной перевод в неисправное состояние — для проверки экранов ошибок. */
  forcedBlockingReason: string | null = null;

  private readonly finishAt = new Map<number, number>();
  private nextId = 1;

  constructor(private readonly options: MockTransportOptions = {}) {}

  private get now(): () => number {
    return this.options.now ?? Date.now;
  }

  async checkStatus(): Promise<TransportStatus> {
    if (this.forcedBlockingReason) {
      return {health: 'blocked', blockingReason: this.forcedBlockingReason};
    }
    return {
      health: 'ready',
      suppliesPercent: this.options.suppliesPercent ?? 100,
      printerName: this.label,
    };
  }

  async submit(document: PrintDocument): Promise<SubmittedJob> {
    const random = this.options.random ?? Math.random;
    if (random() < (this.options.failureRate ?? 0)) {
      throw new Error('Демо-режим: имитация сбоя отправки');
    }
    this.printed.push(document);
    const id = this.nextId++;
    this.finishAt.set(id, this.now() + (this.options.printDurationMs ?? 57_000));
    return {remoteId: id, submittedAt: this.now()};
  }

  async trackJob(job: SubmittedJob): Promise<JobProgress> {
    if (job.remoteId === null) {
      return {state: 'unknown', reasons: []};
    }
    const finish = this.finishAt.get(job.remoteId);
    if (finish === undefined) {
      return {state: 'unknown', reasons: []};
    }
    return this.now() >= finish
      ? {state: 'done', reasons: []}
      : {state: 'printing', reasons: ['job-printing']};
  }

  async cancelJob(job: SubmittedJob): Promise<void> {
    if (job.remoteId !== null) {
      this.finishAt.delete(job.remoteId);
    }
  }
}
