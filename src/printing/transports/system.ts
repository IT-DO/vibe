/**
 * Запасной транспорт: системная печать ОС.
 *
 * Android отдаёт документ в Print Framework (дальше его подхватывает плагин
 * Mopria), iOS — в AirPrint через UIPrintInteractionController.
 *
 * ВАЖНО. Обе системы показывают собственный диалог печати, и обойти его
 * нельзя. Для киоска, где планшет стоит без присмотра, это неприемлемо:
 * гость увидит системное окно и сможет из него уйти в настройки. Поэтому
 * транспорт задуман не как рабочий режим фотобудки, а как:
 *   - способ распечатать что-то вручную при отладке на площадке;
 *   - последняя возможность выдать гостю фото, если прямой IPP не поднялся.
 *
 * Отслеживать задание он не умеет: ОС не сообщает о судьбе отпечатка.
 */

import type {
  PrintDocument,
  PrinterTransport,
  SubmittedJob,
  TransportStatus,
} from '../types';

/** Нативный модуль системной печати (`src/platform/system-print.ts`). */
export interface SystemPrintBridge {
  /** Есть ли в системе служба печати. */
  isAvailable(): Promise<boolean>;
  /** Открывает системный диалог печати для файла. */
  print(options: {
    filePath: string;
    jobName: string;
    copies: number;
  }): Promise<void>;
}

/** Сохраняет байты во временный файл и возвращает путь к нему. */
export type TempFileWriter = (data: Uint8Array, extension: string) => Promise<string>;

export class SystemPrintTransport implements PrinterTransport {
  readonly id = 'system';
  readonly label = 'Системная печать (AirPrint / Mopria)';
  /** ОС не сообщает, чем закончилась печать. */
  readonly canTrackJobs = false;
  // Системная печать принимает обычную картинку.
  readonly documentFormat = 'image/jpeg';

  constructor(
    private readonly bridge: SystemPrintBridge,
    private readonly writeTempFile: TempFileWriter,
  ) {}

  async checkStatus(): Promise<TransportStatus> {
    const available = await this.bridge.isAvailable();
    return available
      ? {health: 'ready', printerName: this.label}
      : {health: 'blocked', blockingReason: 'system-print-unavailable'};
  }

  async submit(document: PrintDocument): Promise<SubmittedJob> {
    const extension = document.format === 'image/jpeg' ? 'jpg' : 'bin';
    const filePath = await this.writeTempFile(document.data, extension);
    await this.bridge.print({
      filePath,
      jobName: document.name,
      copies: document.copies,
    });
    // Задание ушло в систему; идентификатора мы не получаем.
    return {remoteId: null, submittedAt: Date.now()};
  }
}
