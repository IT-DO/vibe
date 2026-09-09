/**
 * Сборка приложения: соединяем протокол печати, файлы и настройки.
 *
 * Всё, что зависит от React Native, встречается с чистой логикой здесь, в
 * одном месте. Такое разделение окупается на отладке: когда на площадке не
 * печатает, понятно, куда смотреть — в транспорт или в очередь.
 */

import RNFS from 'react-native-fs';

import {discoverPrinters, type DiscoveredPrinter} from '../printing/discovery';
import {parseCapabilities} from '../printing/ipp/capabilities';
import {IppClient, MEDIA_3X3, MEDIA_4X6} from '../printing/ipp/client';
import {PrintQueue, type QueueStorage, type QueuedJob, type Scheduler} from '../printing/queue';
import {
  IppTransport,
  MockTransport,
  SystemPrintTransport,
  UnconfiguredTransport,
} from '../printing/transports';
import type {PrinterTransport} from '../printing/types';
import {ZeroconfBrowser} from '../platform/mdns';
import {networkInfo} from '../platform/network-info';
import {systemPrintBridge, writeTempPrintFile} from '../platform/system-print';
import {RnTcpConnector} from '../platform/tcp';
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

export const connector = new RnTcpConnector();
export const mdns = new ZeroconfBrowser();

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
  const targetMedia = settings.media === '3x3' ? MEDIA_3X3 : MEDIA_4X6;

  if (settings.transport === 'mock') {
    currentTransport = new MockTransport();
    return;
  }

  if (settings.transport === 'system') {
    currentTransport = new SystemPrintTransport(systemPrintBridge, writeTempPrintFile);
    return;
  }

  if (!settings.endpoint) {
    // Выбран прямой IPP, но принтер ещё не найден. Не притворяемся рабочими:
    // очередь встанет на паузу, а заставка скажет, что делать.
    currentTransport = new UnconfiguredTransport();
    return;
  }

  const client = new IppClient({endpoint: settings.endpoint, connector});
  const capabilities = await client.getCapabilities();
  currentTransport = new IppTransport({
    endpoint: settings.endpoint,
    connector,
    capabilities,
    targetMedia,
  });
}

/** Ищет принтеры в сети — кнопка «Найти принтер» в админке. */
export function findPrinters(): Promise<DiscoveredPrinter[]> {
  return discoverPrinters({connector, mdns, network: networkInfo});
}

/** Подготавливает файловую систему и восстанавливает очередь. */
export async function bootstrap(): Promise<void> {
  await ensureDirectories();
  await printQueue.restore();
  printQueue.start();
}

export {parseCapabilities};
