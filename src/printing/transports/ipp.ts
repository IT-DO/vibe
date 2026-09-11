/**
 * Основной транспорт: прямая печать по IPP.
 *
 * Именно он делает киоск киоском — документ уходит на принтер без системного
 * диалога печати, а состояние задания видно приложению. Возможности принтера
 * (формат документа, размер бумаги, разрешение) выясняются один раз при
 * подключении и кешируются.
 */

import {
  chooseDocumentFormat,
  chooseMedia,
  chooseResolution,
  type MediaSize,
  type PrinterCapabilities,
} from '../ipp/capabilities';
import {IppClient, type IppEndpoint} from '../ipp/client';
import {JobState} from '../ipp/constants';
import type {IppResolution} from '../ipp/message';
import type {TcpConnector} from '../net';
import type {
  JobProgress,
  PrintDocument,
  PrinterTransport,
  SubmittedJob,
  TransportStatus,
} from '../types';

export interface IppTransportOptions {
  readonly endpoint: IppEndpoint;
  readonly connector: TcpConnector;
  /** Возможности, полученные при подключении, — чтобы не спрашивать заново. */
  readonly capabilities: PrinterCapabilities;
  /** Требуемый размер отпечатка. */
  readonly targetMedia?: MediaSize;
}

export class IppTransport implements PrinterTransport {
  readonly id = 'ipp';
  readonly canTrackJobs = true;

  private readonly client: IppClient;
  private capabilities: PrinterCapabilities;
  private readonly targetMedia: MediaSize | undefined;

  constructor(options: IppTransportOptions) {
    this.client = new IppClient({
      endpoint: options.endpoint,
      connector: options.connector,
    });
    this.capabilities = options.capabilities;
    this.targetMedia = options.targetMedia;
  }

  get label(): string {
    return this.capabilities.makeAndModel ?? this.capabilities.name ?? 'Принтер по IPP';
  }

  /** Формат документа, согласованный с принтером. */
  get documentFormat(): string {
    return chooseDocumentFormat(this.capabilities.documentFormats) ?? 'image/jpeg';
  }

  /** PWG-имя носителя под нужный размер отпечатка. */
  get mediaName(): string | undefined {
    if (!this.targetMedia) {
      return this.capabilities.mediaDefault;
    }
    return (
      chooseMedia(this.capabilities.media, this.targetMedia)?.name ??
      this.capabilities.mediaDefault
    );
  }

  /** Разрешение печати; для сублимации это, как правило, 300 dpi. */
  get resolution(): IppResolution | null {
    return chooseResolution(this.capabilities.resolutions);
  }

  async checkStatus(): Promise<TransportStatus> {
    this.capabilities = await this.client.getCapabilities();
    const ribbon = this.capabilities.markers.find(m => m.level >= 0);
    return {
      health: this.capabilities.health,
      ...(this.capabilities.blockingReason
        ? {blockingReason: this.capabilities.blockingReason}
        : {}),
      ...(ribbon ? {suppliesPercent: ribbon.level} : {}),
      ...(this.label ? {printerName: this.label} : {}),
    };
  }

  async submit(document: PrintDocument): Promise<SubmittedJob> {
    const resolution = this.resolution;
    const media = document.media ?? this.mediaName;
    const jobId = await this.client.printJob({
      data: document.data,
      documentFormat: document.format,
      jobName: document.name,
      copies: document.copies,
      ...(media ? {media} : {}),
      ...(resolution ? {resolution} : {}),
      ...(this.capabilities.colorModes.includes('color') ? {colorMode: 'color'} : {}),
      // Печать в край: у фотобудки кадр уже подготовлен точно под лист,
      // белые поля здесь были бы браком.
      scaling: 'fill',
    });
    return {remoteId: jobId, submittedAt: Date.now()};
  }

  async trackJob(job: SubmittedJob): Promise<JobProgress> {
    if (job.remoteId === null) {
      return {state: 'unknown', reasons: []};
    }
    const status = await this.client.getJobStatus(job.remoteId);
    return {
      state: mapJobState(status.state),
      reasons: status.stateReasons,
    };
  }

  async cancelJob(job: SubmittedJob): Promise<void> {
    if (job.remoteId !== null) {
      await this.client.cancelJob(job.remoteId);
    }
  }

  /** Пробная печать из админки: проверка без расхода бумаги. */
  async validate(format: string, media?: string): Promise<void> {
    await this.client.validateJob({
      data: new Uint8Array(0),
      documentFormat: format,
      jobName: 'Проверка настроек',
      ...(media ? {media} : {}),
    });
  }
}

/** Переводит `job-state` из IPP в модель приложения. */
export function mapJobState(state: number): JobProgress['state'] {
  switch (state) {
    case JobState.Pending:
    case JobState.PendingHeld:
      return 'pending';
    case JobState.Processing:
    case JobState.ProcessingStopped:
      return 'printing';
    case JobState.Completed:
      return 'done';
    case JobState.Canceled:
      return 'canceled';
    case JobState.Aborted:
      return 'failed';
    default:
      return 'unknown';
  }
}
