/**
 * Связь с принтером по классическому Bluetooth.
 *
 * Что именно проверяется: не протокол печати (он проверен отдельно и на
 * настоящих байтах), а слой между ним и нативным модулем — тот, где
 * ломается площадка. Выключённый адаптер, отказ в разрешении, принтер не
 * сопряжён, соединение оборвалось посреди снимка.
 *
 * Отдельно — двоичность канала. Мост в нативный модуль передаёт строки,
 * поэтому кадры едут через base64: если в этом месте ошибиться, всё
 * сломается не сразу, а на первом же байте выше 0x7F, то есть на
 * зашифрованных данных.
 */

import {PermissionsAndroid, Platform} from 'react-native';

import {
  connectToPrinter,
  isBluetoothOn,
  listPairedDevices,
  looksLikePrinter,
  requestBluetoothPermissions,
  wrapDevice,
} from '../bluetooth';
import {fromBase64, toBase64} from '../base64';

beforeEach(() => {
  // Версия по умолчанию — Android 12+: там разрешение спрашивается, и
  // ветка с запросом должна покрываться тестами связи, а не обходиться.
  Object.defineProperty(Platform, 'Version', {value: 33, configurable: true});
  jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue('granted' as never);
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** Поддельное устройство нативного модуля. */
function fakeDevice(overrides: Record<string, unknown> = {}) {
  let listener: ((event: {data: string}) => void) | null = null;
  const written: string[] = [];
  return {
    address: 'F0:13:C1:52:19:90',
    name: 'Mi Portable Photo Printer',
    written,
    removed: false,
    disconnected: false,
    /** Имитирует приход данных от принтера. */
    emit(bytes: Uint8Array) {
      listener?.({data: toBase64(bytes)});
    },
    onDataReceived(next: (event: {data: string}) => void) {
      listener = next;
      return {
        remove: () => {
          this.removed = true;
          listener = null;
        },
      };
    },
    async write(data: string) {
      written.push(data);
      return true;
    },
    async disconnect() {
      this.disconnected = true;
      return true;
    },
    ...overrides,
  };
}

describe('разрешения', () => {
  function onAndroid(version: number) {
    Object.defineProperty(Platform, 'Version', {value: version, configurable: true});
  }

  it('на Android 12 и новее просит одно разрешение — на связь', async () => {
    // Поиска в эфире приложение не ведёт: к классическому Bluetooth без
    // сопряжения всё равно не подключиться. Значит ни BLUETOOTH_SCAN, ни
    // местоположение не нужны, а фотобудка, просящая геолокацию, вызывает
    // вопросы на ровном месте.
    onAndroid(33);
    await requestBluetoothPermissions();
    expect(PermissionsAndroid.request).toHaveBeenCalledWith(
      'android.permission.BLUETOOTH_CONNECT',
    );
  });

  it('на Android 11 не спрашивает вовсе — хватает выданного при установке', async () => {
    onAndroid(30);
    expect(await requestBluetoothPermissions()).toBe(true);
    expect(PermissionsAndroid.request).not.toHaveBeenCalled();
  });

  it('отказ пользователя не ломает приложение', async () => {
    onAndroid(33);
    (PermissionsAndroid.request as jest.Mock).mockResolvedValue('denied' as never);
    expect(await requestBluetoothPermissions()).toBe(false);
  });

  it('сбой системного диалога тоже не ломает', async () => {
    onAndroid(33);
    (PermissionsAndroid.request as jest.Mock).mockRejectedValue(new Error('сбой'));
    expect(await requestBluetoothPermissions()).toBe(false);
  });
});

describe('состояние адаптера', () => {
  it('включённый адаптер виден', async () => {
    expect(await isBluetoothOn()).toBe(true);
  });

  it('сбой нативного модуля читается как «выключен», а не как исключение', async () => {
    globalThis.__btMock.isBluetoothEnabled.mockRejectedValue(new Error('нет модуля'));
    expect(await isBluetoothOn()).toBe(false);
  });
});

describe('список сопряжённых устройств', () => {
  it('принтеры идут первыми — оператору не придётся их искать', async () => {
    globalThis.__btMock.getBondedDevices.mockResolvedValue([
      {address: '11', name: 'Колонка JBL'},
      {address: '22', name: 'Mi Portable Photo Printer'},
      {address: '33', name: 'Наушники'},
    ]);
    const devices = await listPairedDevices();
    expect(devices[0]!.name).toBe('Mi Portable Photo Printer');
    expect(devices[0]!.looksLikePrinter).toBe(true);
    expect(devices).toHaveLength(3);
  });

  it('устройство без имени не роняет список', async () => {
    globalThis.__btMock.getBondedDevices.mockResolvedValue([{address: '11', name: null}]);
    const devices = await listPairedDevices();
    expect(devices[0]!.name).toBe('');
    expect(devices[0]!.looksLikePrinter).toBe(false);
  });

  it('без разрешения — понятная ошибка, а не пустой список', async () => {
    (PermissionsAndroid.request as jest.Mock).mockResolvedValue('denied' as never);
    await expect(listPairedDevices()).rejects.toThrow(/разрешения/);
  });
});

describe('узнавание принтера по имени', () => {
  it('узнаёт разные написания Xiaomi', () => {
    for (const name of [
      'Mi Portable Photo Printer',
      'XIAOMI Photo Printer 1S',
      'Mijia Instant Photo',
      'Hannto ZINK',
    ]) {
      expect(looksLikePrinter(name)).toBe(true);
    }
  });

  it('не принимает за принтер что попало', () => {
    for (const name of ['Колонка JBL', 'Galaxy Buds', '', 'Mi Band 5']) {
      expect(looksLikePrinter(name)).toBe(false);
    }
  });
});

describe('подключение', () => {
  it('выключенный адаптер объясняется человеку', async () => {
    globalThis.__btMock.isBluetoothEnabled.mockResolvedValue(false);
    await expect(connectToPrinter('11')).rejects.toThrow(/Bluetooth выключен/);
  });

  it('без разрешения не подключаемся', async () => {
    (PermissionsAndroid.request as jest.Mock).mockResolvedValue('denied' as never);
    await expect(connectToPrinter('11')).rejects.toThrow(/разрешения/);
  });

  it('просит двоичное соединение, а не разбор по строкам', async () => {
    globalThis.__btMock.connectToDevice.mockResolvedValue(fakeDevice());
    await connectToPrinter('F0:13:C1:52:19:90');

    const [, options] = globalThis.__btMock.connectToDevice.mock.calls[0]!;
    // Соединение по умолчанию режет поток по переводу строки и декодирует
    // его как текст — в кадрах встречается любой байт, включая 0x0A.
    expect(options).toMatchObject({connectionType: 'binary', connectorType: 'rfcomm'});
    // Кадр доходит до 1045 байт, а буфер по умолчанию — 1024.
    expect((options as {readSize: number}).readSize).toBeGreaterThan(1045);
  });
});

describe('канал байтов', () => {
  it('отправленное доходит до устройства без искажений', async () => {
    const device = fakeDevice();
    const link = wrapDevice(device as never);

    // В кадре есть и метка 0x7e, и нули, и байты выше 0x7F.
    const frame = Uint8Array.from([0x7e, 0x64, 0x00, 0xff, 0x80, 0x0a, 0x7e]);
    await link.write(frame);

    expect(device.written).toHaveLength(1);
    expect(fromBase64(device.written[0]!)).toEqual(frame);
  });

  it('пришедшее от устройства разбирается обратно в байты', async () => {
    const device = fakeDevice();
    const link = wrapDevice(device as never);

    const received: Uint8Array[] = [];
    link.subscribe(data => received.push(data));

    const answer = Uint8Array.from([0x7e, 0x64, 0x00, 0xff, 0x11, 0x02, 0x7e]);
    device.emit(answer);
    expect(received).toEqual([answer]);
  });

  it('все 256 значений байта проходят в обе стороны', async () => {
    const device = fakeDevice();
    const link = wrapDevice(device as never);
    const all = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      all[i] = i;
    }

    await link.write(all);
    expect(fromBase64(device.written[0]!)).toEqual(all);

    const received: Uint8Array[] = [];
    link.subscribe(data => received.push(data));
    device.emit(all);
    expect(received[0]).toEqual(all);
  });

  it('отписка прекращает поток именно этому слушателю', async () => {
    const device = fakeDevice();
    const link = wrapDevice(device as never);

    const first: Uint8Array[] = [];
    const second: Uint8Array[] = [];
    const stop = link.subscribe(data => first.push(data));
    link.subscribe(data => second.push(data));

    stop();
    device.emit(Uint8Array.from([1, 2, 3]));
    expect(first).toHaveLength(0);
    expect(second).toHaveLength(1);
  });

  it('пустой пакет не будит разбор понапрасну', () => {
    const device = fakeDevice();
    const link = wrapDevice(device as never);
    const received: Uint8Array[] = [];
    link.subscribe(data => received.push(data));

    device.emit(new Uint8Array(0));
    expect(received).toHaveLength(0);
  });

  it('отказ устройства принять данные виден как ошибка', async () => {
    const device = fakeDevice({write: async () => false});
    const link = wrapDevice(device as never);
    await expect(link.write(Uint8Array.from([1]))).rejects.toThrow(/не принял/);
  });

  it('закрытие отпускает принтер — иначе к нему не подключится никто', async () => {
    const device = fakeDevice();
    const link = wrapDevice(device as never);
    await link.close();
    expect(device.removed).toBe(true);
    expect(device.disconnected).toBe(true);
  });

  it('принтер, отключившийся сам, не мешает закрыться', async () => {
    const device = fakeDevice({
      disconnect: async () => {
        throw new Error('уже отключён');
      },
    });
    const link = wrapDevice(device as never);
    await expect(link.close()).resolves.toBeUndefined();
  });

  it('после закрытия данные больше не приходят', async () => {
    const device = fakeDevice();
    const link = wrapDevice(device as never);
    const received: Uint8Array[] = [];
    link.subscribe(data => received.push(data));

    await link.close();
    device.emit(Uint8Array.from([1, 2, 3]));
    expect(received).toHaveLength(0);
  });
});
