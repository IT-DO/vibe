/**
 * Общие типы слоя печати: транспорт, документ, состояния задания.
 *
 * Транспорт абстрагирован намеренно. Основной путь — прямой IPP: он даёт
 * печать без системного диалога и отслеживание состояния. Но на площадке
 * может оказаться принтер, до которого мы дотягиваемся только через
 * системную печать ОС, — тогда подменяется реализация, а очередь, экраны и
 * статистика остаются те же.
 */

import type {PrinterHealth} from './ipp/capabilities';

/** Документ, готовый к отправке на принтер. */
export interface PrintDocument {
  /** Байты файла (JPEG или PWG Raster). */
  readonly data: Uint8Array;
  /** MIME-тип, согласованный с принтером. */
  readonly format: string;
  /** Имя задания — видно в журнале принтера. */
  readonly name: string;
  readonly copies: number;
  /** PWG-имя носителя, если транспорт умеет его задавать. */
  readonly media?: string;
}

/** Идентификатор отправленного задания у конкретного транспорта. */
export interface SubmittedJob {
  /** id задания на принтере; null — транспорт не умеет их выдавать. */
  readonly remoteId: number | null;
  readonly submittedAt: number;
}

/** Прогресс задания на стороне принтера. */
export interface JobProgress {
  readonly state: 'pending' | 'printing' | 'done' | 'failed' | 'canceled' | 'unknown';
  readonly reasons: readonly string[];
}

/** Состояние транспорта: готов ли он принимать задания прямо сейчас. */
export interface TransportStatus {
  readonly health: PrinterHealth;
  /** Причина, по которой печатать нельзя (ключ для локализации). */
  readonly blockingReason?: string;
  /** Остаток расходника в процентах, если принтер сообщает. */
  readonly suppliesPercent?: number;
  readonly printerName?: string;
}

/** Канал доставки документа на принтер. */
export interface PrinterTransport {
  /** Стабильный идентификатор для настроек и статистики. */
  readonly id: string;
  /** Название для админки. */
  readonly label: string;
  /** Умеет ли транспорт отслеживать судьбу задания после отправки. */
  readonly canTrackJobs: boolean;

  /** Проверяет готовность принтера. */
  checkStatus(): Promise<TransportStatus>;

  /** Отправляет документ. Бросает исключение при неудаче. */
  submit(document: PrintDocument): Promise<SubmittedJob>;

  /** Состояние ранее отправленного задания. */
  trackJob?(job: SubmittedJob): Promise<JobProgress>;

  /** Снимает задание с печати. */
  cancelJob?(job: SubmittedJob): Promise<void>;
}

/**
 * Как обрабатывать ошибку:
 *  - `retry`   — временная неполадка, повторим позже;
 *  - `fatal`   — задание не будет принято никогда, повторять бессмысленно;
 *  - `blocked` — принтеру нужен человек (бумага, крышка); очередь встаёт на
 *                паузу, но задание сохраняется и напечатается после починки.
 */
export type ErrorDisposition = 'retry' | 'fatal' | 'blocked';
