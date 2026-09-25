/**
 * Сборка приложения: соединяем протокол печати, файлы и настройки.
 *
 * Всё, что зависит от React Native, встречается с чистой логикой здесь, в
 * одном месте. Такое разделение окупается на отладке: когда на площадке не
 * печатает, понятно, куда смотреть — в транспорт или в очередь.
 */

import RNFS from 'react-native-fs';

import {PrintQueue, type QueueStorage, type QueuedJob, type Scheduler} from '../printing/queue';
import {
  HanntoTransport,
  UnconfiguredTransport,
  type PrinterConnector,
} from '../printing/transports';
import {HanntoSession} from '../printing/hannto/session';
import {connectToPrinter, type PrinterConnection} from '../platform/bluetooth';
import {trace, traceFailure} from '../platform/trace';
import type {PrinterTransport} from '../printing/types';
import {Paths, ensureDirectories, fileDocuments} from '../platform/files';
import type {PrinterSettings} from '../store/settings';

/** Настоящие часы и сон. */
const realScheduler: Scheduler = {
  now: () => Date.now(),
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
};

/** Очередь печати в файле — переживает перезапуск приложения. */
const queueStorage: QueueStorage = {
  async load() {
    try {
      const raw = await RNFS.readFile(Paths.queueFile, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as QueuedJob[]) : [];
    } catch {
      // Файла ещё нет или он повреждён — начинаем с пустой очереди.
      return [];
    }
  },
  async save(jobs) {
    await RNFS.writeFile(Paths.queueFile, JSON.stringify(jobs), 'utf8');
  },
};

/**
 * Соединение с фотопринтером по Bluetooth.
 *
 * Держит одно подключение на все задания: рукопожатие Диффи — Хеллмана
 * занимает заметное время, а на площадке снимки идут один за другим.
 * Транспорт сам закроет и откроет его заново, если принтер отвалился.
 */
class BluetoothPrinterConnector implements PrinterConnector {
  private connection: PrinterConnection | null = null;

  constructor(private readonly address: string, readonly name: string) {}

  async open(): Promise<HanntoSession> {
    await this.close();
    this.connection = await connectToPrinter(this.address);
    const session = new HanntoSession(this.connection, {
      timeoutMs: 15_000,
      log: message => trace('протокол', message),
    });
    try {
      await session.connect();
    } catch (error) {
      traceFailure('протокол', 'рукопожатие', error);
      throw error;
    }
    return session;
  }

  async close(): Promise<void> {
    const connection = this.connection;
    this.connection = null;
    await connection?.close();
  }
}

/** До выбора принтера — явное состояние «не настроен», а не тихая заглушка. */
let currentTransport: PrinterTransport = new UnconfiguredTransport();

/** Прокси: очередь держит одну ссылку, а транспорт под ней подменяется. */
const transportProxy: PrinterTransport = {
  get id() {
    return currentTransport.id;
  },
  get label() {
    return currentTransport.label;
  },
  get canTrackJobs() {
    return currentTransport.canTrackJobs;
  },
  checkStatus: () => currentTransport.checkStatus(),
  submit: document => currentTransport.submit(document),
  trackJob: job =>
    currentTransport.trackJob
      ? currentTransport.trackJob(job)
      : Promise.resolve({state: 'unknown' as const, reasons: []}),
  cancelJob: job =>
    currentTransport.cancelJob ? currentTransport.cancelJob(job) : Promise.resolve(),
};

export const printQueue = new PrintQueue({
  transport: transportProxy,
  storage: queueStorage,
  documents: fileDocuments,
  scheduler: realScheduler,
  log: (what, detail) => trace('очередь', what, detail),
});

/** Текущий транспорт — для админки и диагностики. */
export function activeTransport(): PrinterTransport {
  return currentTransport;
}

/**
 * Пересобирает транспорт под текущие настройки.
 * Вызывается при старте и после любых изменений в разделе «Принтер».
 */
export async function applyPrinterSettings(settings: PrinterSettings): Promise<void> {
  // Прежний транспорт мог держать открытое соединение — отпускаем принтер,
  // иначе он останется занятым и к нему не подключится ни новый транспорт,
  // ни телефон оператора.
  await releaseTransport();

  if (!settings.bluetoothAddress) {
    // Принтер ещё не выбран в админке. Не притворяемся рабочими: очередь
    // встанет на паузу, а заставка скажет, что делать.
    currentTransport = new UnconfiguredTransport();
    return;
  }

  currentTransport = new HanntoTransport({
    connector: new BluetoothPrinterConnector(
      settings.bluetoothAddress,
      settings.displayName || 'Фотопринтер',
    ),
    log: message => trace('транспорт', message),
  });

  // Спрашиваем принтер сразу, а не при первом госте: оператор настраивает
  // будку заранее и должен увидеть результат настройки немедленно.
  await printQueue.refreshPrinter();
}

/** Отпускает принтер, если прежний транспорт держал соединение. */
async function releaseTransport(): Promise<void> {
  const previous = currentTransport as {dispose?: () => Promise<void>};
  if (typeof previous.dispose === 'function') {
    await previous.dispose().catch(() => undefined);
  }
}

/** Подготавливает файловую систему и восстанавливает очередь. */
export async function bootstrap(): Promise<void> {
  await ensureDirectories();
  await printQueue.restore();
  printQueue.start();
  // Не ждём: заставка покажет индикатор, как только принтер ответит.
  void printQueue.refreshPrinter();
}
