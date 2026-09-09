/**
 * Bluetooth: поиск принтера и разведка его устройства.
 *
 * Xiaomi Portable Photo Printer 1S (BHR9974GL) работает только по Bluetooth
 * 5.2. Wi-Fi у него нет вовсе, а значит нет ни AirPrint, ни Mopria, ни IPP —
 * всей той стандартной печати, на которую рассчитан слой `printing/ipp`.
 * Штатно он печатает единственным способом: из приложения Xiaomi Home по
 * закрытому протоколу поверх BLE.
 *
 * Протокол не опубликован, и угадать его нельзя. Но разобрать — можно, и
 * первый шаг разбора делает этот модуль: находит принтер, подключается и
 * показывает, из чего он состоит — какие у него сервисы и характеристики,
 * какие из них принимают запись, какие шлют уведомления. Этого достаточно,
 * чтобы понять, куда именно уходят данные снимка, и сузить задачу с «разбери
 * весь протокол» до «разбери, что пишут вот в эту характеристику».
 *
 * Пока протокол не разобран, печатать модуль не умеет — и не притворяется,
 * что умеет.
 */

import {PermissionsAndroid, Platform} from 'react-native';
import {BleManager, type Device, type Subscription} from 'react-native-ble-plx';

/** Найденное рядом устройство. */
export interface FoundDevice {
  readonly id: string;
  /** Имя, которым устройство представляется. Пусто — безымянное. */
  readonly name: string;
  /** Уровень сигнала, дБм. Ближе к нулю — ближе устройство. */
  readonly rssi: number | null;
  /** Похоже ли на наш принтер по имени. */
  readonly looksLikePrinter: boolean;
}

/** Характеристика сервиса — то, через что идёт обмен. */
export interface CharacteristicInfo {
  readonly uuid: string;
  readonly isReadable: boolean;
  readonly isWritable: boolean;
  /** Шлёт ли уведомления — обычно так принтер отвечает о состоянии. */
  readonly isNotifiable: boolean;
}

export interface ServiceInfo {
  readonly uuid: string;
  readonly characteristics: readonly CharacteristicInfo[];
}

/** Из чего состоит подключённое устройство. */
export interface DeviceProfile {
  readonly id: string;
  readonly name: string;
  readonly mtu: number;
  readonly services: readonly ServiceInfo[];
}

/**
 * По этим словам в имени устройство похоже на наш принтер.
 * Xiaomi представляется по-разному в зависимости от прошивки и региона.
 */
const PRINTER_NAME_HINTS = ['printer', 'mi photo', 'xiaomi', 'zink', 'mijia'];

let manager: BleManager | null = null;

/** Менеджер BLE создаётся лениво: он поднимает нативный стек. */
function bleManager(): BleManager {
  manager ??= new BleManager();
  return manager;
}

/**
 * Спрашивает разрешения, без которых Android не отдаёт результаты поиска.
 *
 * До Android 12 система требовала разрешение на местоположение: по видимым
 * рядом устройствам можно определить, где находится человек. Начиная с
 * Android 12 для поиска и подключения есть отдельные разрешения, а
 * местоположение больше не нужно.
 */
export async function requestBluetoothPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }

  const version =
    typeof Platform.Version === 'number' ? Platform.Version : Number(Platform.Version);

  // Имена разрешений задаём строками: в типах React Native те, что
  // появились в Android 12, объявлены необязательными, потому что на
  // старых версиях их нет.
  const needed: string[] =
    version >= 31
      ? [
          'android.permission.BLUETOOTH_SCAN',
          'android.permission.BLUETOOTH_CONNECT',
        ]
      : ['android.permission.ACCESS_FINE_LOCATION'];

  try {
    const granted = await PermissionsAndroid.requestMultiple(
      needed as Parameters<typeof PermissionsAndroid.requestMultiple>[0],
    );
    return needed.every(
      permission =>
        (granted as Record<string, string>)[permission] ===
        PermissionsAndroid.RESULTS.GRANTED,
    );
  } catch {
    // Отказ в разрешении — не сбой приложения: оператор увидит пустой
    // список и подсказку в админке.
    return false;
  }
}

/** Включён ли Bluetooth на устройстве прямо сейчас. */
export async function isBluetoothOn(): Promise<boolean> {
  try {
    return (await bleManager().state()) === 'PoweredOn';
  } catch {
    return false;
  }
}

/**
 * Ищет устройства рядом в течение указанного времени.
 *
 * Возвращает найденное, отсортированное по силе сигнала: принтер стоит
 * рядом с планшетом, поэтому обычно оказывается вверху списка.
 */
export async function scanForDevices(durationMs = 8_000): Promise<FoundDevice[]> {
  if (!(await requestBluetoothPermissions())) {
    throw new Error('Нет разрешения на Bluetooth');
  }

  const found = new Map<string, FoundDevice>();
  const ble = bleManager();

  return new Promise<FoundDevice[]>((resolve, reject) => {
    const stop = (error?: Error) => {
      clearTimeout(timer);
      ble.stopDeviceScan();
      if (error) {
        reject(error);
      } else {
        resolve(
          [...found.values()].sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999)),
        );
      }
    };

    const timer = setTimeout(() => stop(), durationMs);

    ble.startDeviceScan(null, {allowDuplicates: false}, (error, device) => {
      if (error) {
        stop(new Error(error.message));
        return;
      }
      if (!device) {
        return;
      }
      const name = device.name ?? device.localName ?? '';
      found.set(device.id, {
        id: device.id,
        name,
        rssi: device.rssi,
        looksLikePrinter: looksLikePrinter(name),
      });
    });
  });
}

/** Похоже ли имя устройства на фотопринтер. */
export function looksLikePrinter(name: string): boolean {
  const lower = name.toLowerCase();
  return PRINTER_NAME_HINTS.some(hint => lower.includes(hint));
}

/**
 * Подключается к устройству и перечисляет его сервисы и характеристики.
 *
 * Это и есть разведка: по списку видно, куда устройство принимает запись
 * (туда уходит снимок) и что шлёт уведомления (оттуда приходит состояние).
 */
export async function describeDevice(deviceId: string): Promise<DeviceProfile> {
  const ble = bleManager();
  let device: Device | null = null;

  try {
    device = await ble.connectToDevice(deviceId, {timeout: 10_000});
    // Размер пакета важен: снимок уходит кусками, и от MTU зависит,
    // сколькими именно.
    const mtu = await negotiateMtu(device);
    await device.discoverAllServicesAndCharacteristics();

    const services = await device.services();
    const described: ServiceInfo[] = [];
    for (const service of services) {
      const characteristics = await service.characteristics();
      described.push({
        uuid: service.uuid,
        characteristics: characteristics.map(c => ({
          uuid: c.uuid,
          isReadable: c.isReadable,
          isWritable: c.isWritableWithResponse || c.isWritableWithoutResponse,
          isNotifiable: c.isNotifiable || c.isIndicatable,
        })),
      });
    }

    return {
      id: device.id,
      name: device.name ?? device.localName ?? '',
      mtu,
      services: described,
    };
  } finally {
    if (device) {
      // Держать соединение незачем: разведка разовая, а занятый принтер
      // не даст подключиться приложению Xiaomi Home.
      await device.cancelConnection().catch(() => undefined);
    }
  }
}

/** Просит увеличить размер пакета; отказ не помеха — берём, что дали. */
async function negotiateMtu(device: Device): Promise<number> {
  try {
    const updated = await device.requestMTU(512);
    return updated.mtu;
  } catch {
    // Стандартный BLE MTU без согласования.
    return 23;
  }
}

/** Освобождает нативный стек — вызывать при выходе из режима диагностики. */
export function releaseBluetooth(): void {
  manager?.destroy();
  manager = null;
}

export type {Subscription};
