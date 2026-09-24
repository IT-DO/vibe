/**
 * Разведка принтера по Bluetooth.
 *
 * Xiaomi 1S печатает по закрытому протоколу поверх BLE — угадать его нельзя,
 * а разобрать можно, и разбор начинается с состава устройства. Здесь
 * проверяется не сам протокол (его ещё нет), а то, что разведка переживает
 * реальную площадку: выключенный Bluetooth, отказ в разрешении, занятый
 * другим телефоном принтер.
 */

import {PermissionsAndroid, Platform} from 'react-native';

import {
  describeDevice,
  isBluetoothOn,
  looksLikePrinter,
  releaseBluetooth,
  requestBluetoothPermissions,
  scanForDevices,
} from '../bluetooth';

const GRANTED = {
  'android.permission.BLUETOOTH_SCAN': 'granted',
  'android.permission.BLUETOOTH_CONNECT': 'granted',
  'android.permission.ACCESS_FINE_LOCATION': 'granted',
};

beforeEach(() => {
  releaseBluetooth();
  jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue(GRANTED as never);
});

afterEach(() => {
  jest.restoreAllMocks();
  releaseBluetooth();
});

describe('разрешения', () => {
  /** Подменяет версию Android на время одной проверки. */
  function onAndroid(version: number) {
    Object.defineProperty(Platform, 'Version', {value: version, configurable: true});
  }

  /** Разрешения, которые приложение запросило у системы. */
  function asked(): string[] {
    return (PermissionsAndroid.requestMultiple as jest.Mock).mock.calls[0]![0];
  }

  it('на Android 12 и новее просит только Bluetooth, без местоположения', async () => {
    // Местоположение приложению киоска не нужно ни для чего, и спрашивать
    // его там, где система этого больше не требует, — значит пугать
    // владельца устройства на ровном месте.
    onAndroid(33);
    await requestBluetoothPermissions();
    expect(asked()).toEqual([
      'android.permission.BLUETOOTH_SCAN',
      'android.permission.BLUETOOTH_CONNECT',
    ]);
  });

  it('на старых версиях без местоположения поиск не работает вовсе', async () => {
    // До Android 12 система считала список видимых рядом устройств
    // сведениями о том, где находится человек, и без этого разрешения
    // просто не отдавала результаты поиска.
    onAndroid(30);
    await requestBluetoothPermissions();
    expect(asked()).toEqual(['android.permission.ACCESS_FINE_LOCATION']);
  });

  it('отказ возвращает false, а не исключение', async () => {
    (PermissionsAndroid.requestMultiple as jest.Mock).mockResolvedValue({
      'android.permission.BLUETOOTH_SCAN': 'denied',
      'android.permission.BLUETOOTH_CONNECT': 'granted',
    } as never);
    expect(await requestBluetoothPermissions()).toBe(false);
  });

  it('сбой самого запроса тоже не роняет приложение', async () => {
    (PermissionsAndroid.requestMultiple as jest.Mock).mockRejectedValue(
      new Error('Система отказала'),
    );
    expect(await requestBluetoothPermissions()).toBe(false);
  });
});

describe('состояние адаптера', () => {
  it('включённый Bluetooth виден', async () => {
    globalThis.__bleMock.state.mockResolvedValue('PoweredOn');
    expect(await isBluetoothOn()).toBe(true);
  });

  it('выключенный — тоже', async () => {
    globalThis.__bleMock.state.mockResolvedValue('PoweredOff');
    expect(await isBluetoothOn()).toBe(false);
  });

  it('сбой опроса считается «выключено», а не падением', async () => {
    globalThis.__bleMock.state.mockRejectedValue(new Error('Стек не поднялся'));
    expect(await isBluetoothOn()).toBe(false);
  });
});

describe('узнавание принтера по имени', () => {
  it.each([
    'Xiaomi Photo Printer',
    'Mi Photo Printer 1S',
    'MIJIA PRINTER',
    'zink-printer',
  ])('«%s» похоже на принтер', name => {
    expect(looksLikePrinter(name)).toBe(true);
  });

  it.each(['Galaxy Buds', 'JBL Flip 5', '', 'Mi Band 7'])(
    '«%s» — не принтер',
    name => {
      expect(looksLikePrinter(name)).toBe(false);
    },
  );
});

describe('поиск устройств', () => {
  /** Подсовывает поиску заранее заготовленные устройства. */
  function scanFinds(devices: {id: string; name?: string; rssi?: number}[]) {
    globalThis.__bleMock.startDeviceScan.mockImplementation(
      (_uuids, _options, listener) => {
        for (const device of devices) {
          listener(null, {
            id: device.id,
            name: device.name ?? null,
            localName: null,
            rssi: device.rssi ?? null,
          });
        }
      },
    );
  }

  it('возвращает найденное и останавливает поиск', async () => {
    scanFinds([{id: 'AA', name: 'Xiaomi Photo Printer', rssi: -40}]);
    const found = await scanForDevices(10);

    expect(found).toEqual([
      {id: 'AA', name: 'Xiaomi Photo Printer', rssi: -40, looksLikePrinter: true},
    ]);
    expect(globalThis.__bleMock.stopDeviceScan).toHaveBeenCalled();
  });

  it('ближние устройства идут первыми — принтер стоит рядом с планшетом', async () => {
    scanFinds([
      {id: 'FAR', name: 'Колонка', rssi: -90},
      {id: 'NEAR', name: 'Xiaomi Photo Printer', rssi: -35},
    ]);
    const found = await scanForDevices(10);
    expect(found.map(d => d.id)).toEqual(['NEAR', 'FAR']);
  });

  it('одно устройство не попадает в список дважды', async () => {
    scanFinds([
      {id: 'AA', name: 'Принтер', rssi: -50},
      {id: 'AA', name: 'Принтер', rssi: -48},
    ]);
    expect(await scanForDevices(10)).toHaveLength(1);
  });

  it('безымянные устройства не теряются — принтер может не назваться', async () => {
    scanFinds([{id: 'AA', rssi: -50}]);
    const found = await scanForDevices(10);
    expect(found[0]).toMatchObject({name: '', looksLikePrinter: false});
  });

  it('без разрешения поиск честно отказывается', async () => {
    (PermissionsAndroid.requestMultiple as jest.Mock).mockResolvedValue({
      'android.permission.BLUETOOTH_SCAN': 'denied',
    } as never);
    await expect(scanForDevices(10)).rejects.toThrow('Нет разрешения');
  });

  it('сбой поиска не оставляет сканер включённым', async () => {
    // Иначе Bluetooth продолжает искать в фоне и сажает батарею планшета.
    globalThis.__bleMock.startDeviceScan.mockImplementation(
      (_uuids, _options, listener) => {
        listener({message: 'Адаптер занят'}, null);
      },
    );
    await expect(scanForDevices(10)).rejects.toThrow('Адаптер занят');
    expect(globalThis.__bleMock.stopDeviceScan).toHaveBeenCalled();
  });
});

describe('состав подключённого устройства', () => {
  /** Устройство, отвечающее заданным набором сервисов. */
  function connectsWith(services: {uuid: string; chars: object[]}[]) {
    globalThis.__bleMock.connectToDevice.mockResolvedValue({
      id: 'AA',
      name: 'Xiaomi Photo Printer',
      localName: null,
      requestMTU: async () => ({mtu: 247}),
      discoverAllServicesAndCharacteristics: async () => undefined,
      services: async () =>
        services.map(s => ({
          uuid: s.uuid,
          characteristics: async () => s.chars,
        })),
      cancelConnection: async () => undefined,
    } as never);
  }

  it('перечисляет сервисы и помечает, куда можно писать', async () => {
    // Пометки важнее номеров: снимок уходит в характеристику, принимающую
    // запись, а состояние печати приходит из той, что шлёт уведомления.
    connectsWith([
      {
        uuid: '0000ff00-0000-1000-8000-00805f9b34fb',
        chars: [
          {
            uuid: 'ff01',
            isReadable: false,
            isWritableWithResponse: false,
            isWritableWithoutResponse: true,
            isNotifiable: false,
            isIndicatable: false,
          },
          {
            uuid: 'ff02',
            isReadable: true,
            isWritableWithResponse: false,
            isWritableWithoutResponse: false,
            isNotifiable: true,
            isIndicatable: false,
          },
        ],
      },
    ]);

    const profile = await describeDevice('AA');

    expect(profile).toMatchObject({id: 'AA', name: 'Xiaomi Photo Printer', mtu: 247});
    expect(profile.services[0]!.characteristics).toEqual([
      {uuid: 'ff01', isReadable: false, isWritable: true, isNotifiable: false},
      {uuid: 'ff02', isReadable: true, isWritable: false, isNotifiable: true},
    ]);
  });

  it('соединение закрывается — иначе принтер не отдастся Xiaomi Home', async () => {
    const cancelConnection = jest.fn(async () => undefined);
    globalThis.__bleMock.connectToDevice.mockResolvedValue({
      id: 'AA',
      name: null,
      localName: null,
      requestMTU: async () => ({mtu: 247}),
      discoverAllServicesAndCharacteristics: async () => undefined,
      services: async () => [],
      cancelConnection,
    } as never);

    await describeDevice('AA');
    expect(cancelConnection).toHaveBeenCalled();
  });

  it('соединение закрывается и когда разведка упала на середине', async () => {
    const cancelConnection = jest.fn(async () => undefined);
    globalThis.__bleMock.connectToDevice.mockResolvedValue({
      id: 'AA',
      name: null,
      localName: null,
      requestMTU: async () => ({mtu: 247}),
      discoverAllServicesAndCharacteristics: async () => {
        throw new Error('Устройство отключилось');
      },
      services: async () => [],
      cancelConnection,
    } as never);

    await expect(describeDevice('AA')).rejects.toThrow('отключилось');
    expect(cancelConnection).toHaveBeenCalled();
  });

  it('отказ увеличить пакет не мешает разведке', async () => {
    // Принтер может не согласовать MTU — тогда работает стандартный 23.
    globalThis.__bleMock.connectToDevice.mockResolvedValue({
      id: 'AA',
      name: null,
      localName: null,
      requestMTU: async () => {
        throw new Error('Не поддерживается');
      },
      discoverAllServicesAndCharacteristics: async () => undefined,
      services: async () => [],
      cancelConnection: async () => undefined,
    } as never);

    expect((await describeDevice('AA')).mtu).toBe(23);
  });

  it('занятый другим телефоном принтер даёт понятный отказ', async () => {
    globalThis.__bleMock.connectToDevice.mockRejectedValue(
      new Error('Device is already connected'),
    );
    await expect(describeDevice('AA')).rejects.toThrow('already connected');
  });
});
