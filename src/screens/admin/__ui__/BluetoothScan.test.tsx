/**
 * Экран разведки Bluetooth в админке.
 *
 * Он нужен, чтобы разобрать протокол принтера, а пользоваться им будет
 * человек за пятнадцать минут до мероприятия. Поэтому проверяется не
 * красота, а понятность: почему список пуст, что нажать дальше и что
 * означает найденное.
 */

import React from 'react';
import {PermissionsAndroid} from 'react-native';
import {act, fireEvent, render, screen} from '@testing-library/react-native';

import {BluetoothScan, describeAsText} from '../BluetoothScan';

/** По умолчанию разрешения выданы — иначе поиск и не начнётся. */
beforeEach(() => {
  jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue({
    'android.permission.BLUETOOTH_SCAN': 'granted',
    'android.permission.BLUETOOTH_CONNECT': 'granted',
    'android.permission.ACCESS_FINE_LOCATION': 'granted',
  } as never);
});

afterEach(() => jest.restoreAllMocks());

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

describe('поиск', () => {
  /**
   * Нажимает «искать» и прокручивает поддельные часы до конца поиска.
   * Восемь секунд ожидания на площадке уместны, в тесте — нет.
   */
  async function search() {
    fireEvent.press(screen.getByText('Искать устройства'));
    // Сначала разрешения и опрос адаптера — это промисы, и таймер поиска
    // заводится только после них. Потом прокручиваем сам поиск.
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        jest.advanceTimersByTime(9_000);
      });
    }
  }

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('находит принтер и помечает его', async () => {
    scanFinds([{id: 'AA:BB', name: 'Xiaomi Photo Printer', rssi: -40}]);
    render(<BluetoothScan />);

    await search();

    expect(screen.getByText(/Xiaomi Photo Printer/)).toBeTruthy();
    expect(screen.getByText(/похоже на принтер/)).toBeTruthy();
    expect(screen.getByText(/AA:BB/)).toBeTruthy();
  });

  it('ближний принтер показан выше дальней колонки', async () => {
    scanFinds([
      {id: 'FAR', name: 'Колонка', rssi: -90},
      {id: 'NEAR', name: 'Xiaomi Photo Printer', rssi: -35},
    ]);
    render(<BluetoothScan />);

    await search();

    const printer = screen.getByText(/Xiaomi Photo Printer/);
    const speaker = screen.getByText(/Колонка/);
    const order = JSON.stringify(screen.toJSON());
    expect(order.indexOf('Xiaomi')).toBeLessThan(order.indexOf('Колонка'));
    expect(printer).toBeTruthy();
    expect(speaker).toBeTruthy();
  });

  it('выключенный Bluetooth объясняется, а не выглядит как пустой список', async () => {
    globalThis.__bleMock.state.mockResolvedValue('PoweredOff');
    render(<BluetoothScan />);

    await search();

    expect(screen.getByText(/Bluetooth выключен/)).toBeTruthy();
    expect(globalThis.__bleMock.startDeviceScan).not.toHaveBeenCalled();
  });

  it('пустой результат подсказывает, что проверить', async () => {
    scanFinds([]);
    render(<BluetoothScan />);

    await search();

    expect(screen.getByText(/Рядом ничего не найдено/)).toBeTruthy();
  });

  it('отказ в разрешении показан словами', async () => {
    globalThis.__bleMock.state.mockResolvedValue('PoweredOn');
    (PermissionsAndroid.requestMultiple as jest.Mock).mockResolvedValue({} as never);
    render(<BluetoothScan />);

    await search();

    expect(screen.getByText(/Нет разрешения на Bluetooth/)).toBeTruthy();
  });
});

describe('состав устройства текстом', () => {
  const profile = {
    id: 'AA:BB',
    name: 'Xiaomi Photo Printer',
    mtu: 247,
    services: [
      {
        uuid: 'ff00',
        characteristics: [
          {uuid: 'ff01', isReadable: false, isWritable: true, isNotifiable: false},
          {uuid: 'ff02', isReadable: true, isWritable: false, isNotifiable: true},
        ],
      },
    ],
  };

  it('выделяет характеристику, принимающую запись', () => {
    // Именно туда приложение Xiaomi Home передаёт снимок — с неё начнётся
    // разбор протокола.
    const text = describeAsText(profile);
    expect(text).toContain('ff01 — ЗАПИСЬ');
  });

  it('отмечает уведомления — оттуда приходит состояние печати', () => {
    expect(describeAsText(profile)).toContain('ff02 — чтение, уведомления');
  });

  it('называет размер пакета: от него зависит, сколькими кусками уйдёт снимок', () => {
    expect(describeAsText(profile)).toContain('Размер пакета (MTU): 247');
  });

  it('сервис без характеристик не выглядит как обрыв текста', () => {
    const text = describeAsText({...profile, services: [{uuid: 'ff10', characteristics: []}]});
    expect(text).toContain('(характеристик нет)');
  });

  it('безымянное устройство подписано явно', () => {
    expect(describeAsText({...profile, name: ''})).toContain('(без имени)');
  });
});
