/**
 * Bluetooth-связь с фотопринтером.
 *
 * Xiaomi Portable Photo Printer 1S (BHR9974GL) работает только по Bluetooth:
 * Wi-Fi у него нет вовсе, а значит нет ни AirPrint, ни Mopria, ни IPP.
 *
 * Важно, какой именно Bluetooth. Журнал настоящей печати показал канал
 * RFCOMM поверх L2CAP и ни одного пакета ATT — это классический Bluetooth,
 * профиль последовательного порта (SPP), а не BLE. Первая версия этого
 * модуля искала принтер сканированием BLE и не нашла бы его никогда: в
 * списке BLE-устройств он попросту не появляется.
 *
 * Отсюда и порядок работы. Классический Bluetooth требует сопряжения
 * средствами системы, поэтому приложение не ищет принтер в эфире, а берёт
 * его из списка уже сопряжённых устройств. Оператор один раз связывает
 * планшет с принтером в настройках Android — дальше приложение подключается
 * само.
 */

import {PermissionsAndroid, Platform} from 'react-native';
import RNBluetoothClassic, {
  type BluetoothDevice,
  type StandardOptions,
} from 'react-native-bluetooth-classic';
import type {HanntoLink} from '../printing/hannto/session';
import {fromBase64, toBase64} from './base64';

/** Сопряжённое устройство, видимое приложению. */
export interface PairedDevice {
  /** MAC-адрес — он же ключ для подключения. */
  readonly address: string;
  readonly name: string;
  /** Похоже ли на наш принтер по имени. */
  readonly looksLikePrinter: boolean;
}

/**
 * По этим словам в имени устройство похоже на фотопринтер.
 * Xiaomi представляется по-разному в зависимости от прошивки и региона.
 */
const PRINTER_NAME_HINTS = [
  'printer',
  'photo',
  'mi portable',
  'xiaomi',
  'mijia',
  'hannto',
  'zink',
  'instant',
];

/**
 * Настройки соединения.
 *
 * `binary` — единственный подходящий тип: соединение по умолчанию режет
 * поток по символу перевода строки и декодирует его как текст, а у нас в
 * кадрах встречаются любые байты, включая 0x0A. Двоичный режим отдаёт
 * данные как есть, строкой base64.
 *
 * `readSize` увеличен: кадр протокола доходит до 1045 байт, а буфер по
 * умолчанию — 1024, и длинный ответ принтера в него не помещается.
 */
const CONNECTION_OPTIONS: StandardOptions = {
  connectorType: 'rfcomm',
  connectionType: 'binary',
  readSize: 8192,
  secureSocket: true,
};

/**
 * Спрашивает разрешение, без которого Android не отдаёт список устройств.
 *
 * До Android 12 спрашивать нечего: обычное разрешение BLUETOOTH выдаётся
 * при установке, и его хватает и на список сопряжённых устройств, и на
 * подключение к ним.
 *
 * С Android 12 нужно одно разрешение — BLUETOOTH_CONNECT. Поиска в эфире
 * приложение не ведёт (подключиться к классическому Bluetooth без
 * сопряжения всё равно нельзя), поэтому ни BLUETOOTH_SCAN, ни тем более
 * местоположение не требуются.
 */
export async function requestBluetoothPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }

  const version =
    typeof Platform.Version === 'number' ? Platform.Version : Number(Platform.Version);
  if (version < 31) {
    return true;
  }

  // Имя разрешения задаём строкой: в типах React Native те, что появились
  // в Android 12, объявлены необязательными, потому что на старых версиях
  // их нет.
  const permission = 'android.permission.BLUETOOTH_CONNECT';

  try {
    const granted = await PermissionsAndroid.request(
      permission as Parameters<typeof PermissionsAndroid.request>[0],
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    // Отказ в разрешении — не сбой приложения: оператор увидит пустой
    // список и подсказку в админке.
    return false;
  }
}

/** Включён ли Bluetooth на устройстве прямо сейчас. */
export async function isBluetoothOn(): Promise<boolean> {
  try {
    return await RNBluetoothClassic.isBluetoothEnabled();
  } catch {
    return false;
  }
}

/** Открывает системные настройки Bluetooth — там оператор сопрягает принтер. */
export function openBluetoothSettings(): void {
  try {
    RNBluetoothClassic.openBluetoothSettings();
  } catch {
    // Экран настроек может быть недоступен на нестандартной прошивке —
    // это не повод падать.
  }
}

/**
 * Сопряжённые устройства, принтеры — первыми.
 *
 * Поиск в эфире здесь не нужен и даже вреден: подключиться к классическому
 * Bluetooth без сопряжения всё равно нельзя, а сканирование эфира заметно
 * замедляет обмен с уже подключённым устройством.
 */
export async function listPairedDevices(): Promise<PairedDevice[]> {
  if (!(await requestBluetoothPermissions())) {
    throw new Error('Нет разрешения на Bluetooth');
  }

  const devices = await RNBluetoothClassic.getBondedDevices();
  return devices
    .map(device => ({
      address: device.address,
      name: device.name ?? '',
      looksLikePrinter: looksLikePrinter(device.name ?? ''),
    }))
    .sort((a, b) => Number(b.looksLikePrinter) - Number(a.looksLikePrinter));
}

/** Похоже ли имя устройства на фотопринтер. */
export function looksLikePrinter(name: string): boolean {
  const lower = name.toLowerCase();
  return PRINTER_NAME_HINTS.some(hint => lower.includes(hint));
}

/**
 * Открытое соединение с принтером.
 *
 * Реализует `HanntoLink`, поэтому протокол печати работает поверх него,
 * ничего не зная ни про React Native, ни про Bluetooth.
 */
export interface PrinterConnection extends HanntoLink {
  readonly address: string;
  readonly name: string;
  close(): Promise<void>;
}

/** Подключается к сопряжённому принтеру по его адресу. */
export async function connectToPrinter(address: string): Promise<PrinterConnection> {
  if (!(await requestBluetoothPermissions())) {
    throw new Error('Нет разрешения на Bluetooth');
  }
  if (!(await isBluetoothOn())) {
    throw new Error('Bluetooth выключен');
  }

  const device = await RNBluetoothClassic.connectToDevice(address, CONNECTION_OPTIONS);
  return wrapDevice(device);
}

/**
 * Оборачивает устройство в канал байтов.
 *
 * Вынесено отдельно, чтобы то же самое можно было проверить в тестах на
 * поддельном устройстве, не поднимая нативный модуль.
 */
export function wrapDevice(device: BluetoothDevice): PrinterConnection {
  let listeners: ((data: Uint8Array) => void)[] = [];

  // Подписка на устройство одна на всё соединение: нативный модуль шлёт
  // прочитанное всем подписчикам сразу, и вторая подписка удвоила бы поток.
  const subscription = device.onDataReceived(event => {
    const bytes = fromBase64(event.data);
    if (bytes.length === 0) {
      return;
    }
    for (const listener of [...listeners]) {
      listener(bytes);
    }
  });

  return {
    address: device.address,
    name: device.name ?? '',

    async write(data: Uint8Array): Promise<void> {
      // Строка base64 с пометкой «base64» доходит до устройства как исходные
      // байты: мост декодирует её обратно. Передавать текстом нельзя —
      // всё выше 0x7F исказится.
      const ok = await device.write(toBase64(data), 'base64');
      if (ok === false) {
        throw new Error('Принтер не принял данные');
      }
    },

    subscribe(listener: (data: Uint8Array) => void): () => void {
      listeners.push(listener);
      return () => {
        listeners = listeners.filter(item => item !== listener);
      };
    },

    async close(): Promise<void> {
      listeners = [];
      subscription.remove();
      try {
        await device.disconnect();
      } catch {
        // Принтер мог отключиться сам — для нас это тот же результат.
      }
    },
  };
}
