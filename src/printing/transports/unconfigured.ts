/**
 * Транспорт «принтер не выбран».
 *
 * Раньше при ненастроенном принтере подставлялась заглушка MockTransport,
 * которая честно рапортовала «готов». Приложение выглядело работающим,
 * гость проходил весь сценарий, а отпечаток уходил в никуда. Это худший из
 * возможных исходов: человек ждёт фотографию, которой не будет.
 *
 * Теперь ненастроенный принтер — явное состояние. Очередь встаёт на паузу
 * (задания не теряются и напечатаются, как только принтер найдут), а на
 * заставке видно, что нужно сделать.
 *
 * От демо-режима это состояние отличается намеренно: демо выбирает оператор
 * осознанно, когда хочет показать интерфейс без железа.
 */

import type {
  PrintDocument,
  PrinterTransport,
  SubmittedJob,
  TransportStatus,
} from '../types';

/** Причина блокировки; локализуется через `describePrinterState`. */
export const PRINTER_NOT_CONFIGURED = 'printer-not-configured';

export class UnconfiguredTransport implements PrinterTransport {
  readonly id = 'unconfigured';
  readonly label = 'Принтер не выбран';
  readonly canTrackJobs = false;

  async checkStatus(): Promise<TransportStatus> {
    return {health: 'blocked', blockingReason: PRINTER_NOT_CONFIGURED};
  }

  async submit(_document: PrintDocument): Promise<SubmittedJob> {
    throw new Error('Принтер не подключён — откройте настройки и найдите его в сети');
  }
}
