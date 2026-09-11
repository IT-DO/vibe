/** Подставные зависимости очереди печати для тестов. */

import {IppError} from '../ipp/client';
import {StatusCode} from '../ipp/constants';
import {NetworkError} from '../net';
import type {DocumentLoader, QueueStorage, QueuedJob, Scheduler} from '../queue';
import type {
  JobProgress,
  PrintDocument,
  PrinterTransport,
  SubmittedJob,
  TransportStatus,
} from '../types';

/** Виртуальные часы: sleep не ждёт по-настоящему, а двигает время вперёд. */
export class FakeScheduler implements Scheduler {
  private current = 1_700_000_000_000;
  readonly slept: number[] = [];

  now(): number {
    return this.current;
  }

  async sleep(ms: number): Promise<void> {
    this.slept.push(ms);
    this.current += ms;
  }

  /** Сдвигает время без записи в журнал сна. */
  advance(ms: number): void {
    this.current += ms;
  }
}

export class FakeStorage implements QueueStorage {
  saved: QueuedJob[] = [];
  saveCount = 0;

  constructor(private initial: QueuedJob[] = []) {}

  async load(): Promise<QueuedJob[]> {
    return this.initial.map(j => ({...j}));
  }

  async save(jobs: readonly QueuedJob[]): Promise<void> {
    this.saveCount++;
    this.saved = jobs.map(j => ({...j}));
  }
}

export class FakeDocuments implements DocumentLoader {
  readonly removed: string[] = [];
  private readonly files = new Map<string, Uint8Array>();

  constructor(paths: string[] = []) {
    for (const p of paths) {
      this.files.set(p, new Uint8Array([1, 2, 3]));
    }
  }

  async read(path: string): Promise<Uint8Array> {
    const data = this.files.get(path);
    if (!data) {
      throw new NetworkError(`Файл не найден: ${path}`);
    }
    return data;
  }

  async remove(path: string): Promise<void> {
    this.removed.push(path);
    this.files.delete(path);
  }
}

/** Настраиваемый транспорт: сценарий ответов задаётся в тесте. */
export class FakeTransport implements PrinterTransport {
  readonly id = 'fake';
  readonly label = 'Поддельный принтер';
  canTrackJobs = false;

  readonly submitted: PrintDocument[] = [];
  readonly canceled: SubmittedJob[] = [];

  status: TransportStatus = {health: 'ready'};
  statusError: Error | null = null;
  /** Очередь исходов отправки; когда кончится, отправка успешна. */
  submitOutcomes: (Error | 'ok')[] = [];
  /** Очередь ответов отслеживания. */
  trackOutcomes: JobProgress[] = [];
  private nextJobId = 100;

  async checkStatus(): Promise<TransportStatus> {
    if (this.statusError) {
      throw this.statusError;
    }
    return this.status;
  }

  async submit(document: PrintDocument): Promise<SubmittedJob> {
    this.submitted.push(document);
    const outcome = this.submitOutcomes.shift() ?? 'ok';
    if (outcome !== 'ok') {
      throw outcome;
    }
    return {remoteId: this.nextJobId++, submittedAt: 0};
  }

  async trackJob(): Promise<JobProgress> {
    return this.trackOutcomes.shift() ?? {state: 'done', reasons: []};
  }

  async cancelJob(job: SubmittedJob): Promise<void> {
    this.canceled.push(job);
  }
}

/** Ошибка, которую очередь должна счесть временной. */
export const transientError = (): Error => new NetworkError('Wi-Fi отвалился');

/** Ошибка, после которой повторять бессмысленно. */
export const fatalError = (): Error =>
  new IppError('формат не поддерживается', StatusCode.ClientErrorDocumentFormatNotSupported);

/** Ошибка «принтеру нужен человек». */
export const blockedError = (): Error =>
  new IppError('принтер не принимает задания', StatusCode.ServerErrorNotAcceptingJobs);
