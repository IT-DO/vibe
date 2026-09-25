/**
 * Печать на фотопринтере Xiaomi 1S по Bluetooth.
 *
 * Это основной канал печати приложения. Принтер не умеет ни IPP, ни AirPrint,
 * ни Mopria — у него нет Wi-Fi, — поэтому печать идёт напрямую по
 * разобранному протоколу Hannto (см. `printing/hannto`).
 *
 * Транспорт отвечает за то, чего протокол не знает: когда открывать и когда
 * закрывать соединение, как перевести состояние принтера в понятный очереди
 * ответ и что считать поводом позвать человека.
 *
 * Соединение держится открытым между заданиями: рукопожатие занимает заметное
 * время, а на площадке снимки идут один за другим. Но если принтер отвалился
 * (сел, выключили, ушёл из зоны), следующее задание просто откроет соединение
 * заново — очередь об этом ничего не знает.
 */

import {HanntoSession, type PrinterStatus} from '../hannto/session';
import type {
  JobProgress,
  PrintDocument,
  PrinterTransport,
  SubmittedJob,
  TransportStatus,
} from '../types';

/** Как открыть канал до принтера. Подменяется в тестах. */
export interface PrinterConnector {
  /** Открывает соединение и делает рукопожатие. */
  open(): Promise<HanntoSession>;
  /** Закрывает соединение. */
  close(): Promise<void>;
  /** Имя принтера для админки. */
  readonly name: string;
}

export interface HanntoTransportOptions {
  readonly connector: PrinterConnector;
  /** Ниже этого заряда печатать опасно: принтер встанет посреди листа. */
  readonly minBatteryPercent?: number;
  /** Куда писать ход печати. */
  readonly log?: (message: string) => void;
}

/** Ниже 15% принтер может не дотянуть до конца отпечатка. */
const MIN_BATTERY = 15;

/**
 * Что именно сломалось.
 *
 * Прошивка отдаёт числовой код, и по нему видно, ждать ли человека
 * (бумага, крышка) или повторять попытку (перегрев пройдёт сам).
 */
const ERROR_MESSAGES: Record<number, string> = {
  1: 'В принтере закончилась бумага',
  2: 'Замялась бумага',
  3: 'Открыта крышка принтера',
  4: 'Принтер перегрелся — нужно подождать',
  5: 'Не распознан картридж с бумагой',
};

export class HanntoTransport implements PrinterTransport {
  readonly id = 'hannto';
  readonly label = 'Xiaomi 1S по Bluetooth';
  readonly canTrackJobs = true;
  /** Принтер принимает только JPEG. */
  readonly documentFormat = 'image/jpeg';

  private readonly options: HanntoTransportOptions;
  private session: HanntoSession | null = null;

  constructor(options: HanntoTransportOptions) {
    this.options = options;
  }

  async checkStatus(): Promise<TransportStatus> {
    try {
      const session = await this.connected();
      return describeStatus(
        await session.status(),
        this.options.connector.name,
        this.options.minBatteryPercent ?? MIN_BATTERY,
      );
    } catch (error) {
      await this.drop();
      // Недоступный принтер — это `blocked`, а не ошибка: очередь встанет
      // на паузу, задания сохранятся и напечатаются, как только оператор
      // включит принтер или поднесёт планшет ближе.
      return {
        health: 'blocked',
        blockingReason: message(error),
        printerName: this.options.connector.name,
      };
    }
  }

  async submit(document: PrintDocument): Promise<SubmittedJob> {
    const session = await this.connected();
    try {
      const jobId = await session.createJob(document.data.length, document.copies);
      await session.sendFile(document.data, jobId, (sent, total) => {
        this.options.log?.(`отправлено ${sent} из ${total} байт`);
      });
      return {remoteId: jobId, submittedAt: Date.now()};
    } catch (error) {
      // Оборванная передача оставляет принтер с недописанным заданием.
      // Соединение проще открыть заново, чем вычищать его состояние.
      await this.drop();
      throw error;
    }
  }

  async trackJob(job: SubmittedJob): Promise<JobProgress> {
    if (job.remoteId === null) {
      return {state: 'unknown', reasons: []};
    }
    try {
      const session = await this.connected();
      const info = await session.jobInfo(job.remoteId);
      return {state: mapJobState(info.job_state), reasons: [info.job_state]};
    } catch (error) {
      await this.drop();
      return {state: 'unknown', reasons: [message(error)]};
    }
  }

  /** Закрывает соединение — например, при выходе из режима киоска. */
  async dispose(): Promise<void> {
    await this.drop();
  }

  private async connected(): Promise<HanntoSession> {
    if (this.session?.ready) {
      return this.session;
    }
    await this.drop();
    this.session = await this.options.connector.open();
    return this.session;
  }

  private async drop(): Promise<void> {
    this.session?.close();
    this.session = null;
    try {
      await this.options.connector.close();
    } catch {
      // Принтер мог отключиться сам — результат тот же.
    }
  }
}

/** Состояние принтера в терминах очереди печати. */
export function describeStatus(
  status: PrinterStatus,
  printerName: string,
  minBattery: number,
): TransportStatus {
  const battery = status['battery-level'];

  if (status.error !== 0) {
    return {
      health: 'blocked',
      blockingReason: ERROR_MESSAGES[status.error] ?? `Ошибка принтера ${status.error}`,
      suppliesPercent: battery,
      printerName,
    };
  }

  // Разряженный принтер встанет посреди листа и испортит бумагу — лучше
  // остановить очередь заранее и позвать оператора с кабелем.
  if (typeof battery === 'number' && battery < minBattery) {
    return {
      health: 'blocked',
      blockingReason: `Принтер разряжен (${battery}%) — подключите зарядку`,
      suppliesPercent: battery,
      printerName,
    };
  }

  return {
    health: 'ready',
    suppliesPercent: battery,
    printerName,
  };
}

/**
 * Состояние задания в терминах очереди.
 *
 * Названия взяты из ответов настоящего принтера: `finished` приходит в
 * `job_info` после печати, остальные — из `mixed_status` по ходу дела.
 */
export function mapJobState(state: string): JobProgress['state'] {
  switch (state) {
    case 'finished':
    case 'success':
      return 'done';
    case 'printing':
    case 'downloading':
    case 'decoding':
      return 'printing';
    case 'queued':
    case 'waiting':
      return 'pending';
    case 'cancel':
    case 'canceled':
      return 'canceled';
    case 'error':
    case 'failed':
      return 'failed';
    default:
      return 'unknown';
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Принтер недоступен';
}
