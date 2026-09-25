/**
 * Экран выбора принтера в админке.
 *
 * Проверяется путь оператора целиком: открыл раздел — увидел сопряжённые
 * устройства, выбрал принтер — он сохранился в настройках, нажал «Проверить
 * связь» — приложение действительно поговорило с принтером и показало, что
 * тот ответил.
 *
 * На другом конце канала — `FakePrinter`, отвечающий теми же кадрами, что
 * снятые с настоящего устройства. То есть проверка связи в тесте проходит
 * настоящее рукопожатие Диффи — Хеллмана и настоящие команды, а не заглушку.
 */

import React from 'react';
import {PermissionsAndroid} from 'react-native';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react-native';

import {BluetoothScan, askPrinter, describeState} from '../BluetoothScan';
import {FakePrinter} from '../../../printing/hannto/__tests__/fake-printer';
import {toBase64} from '../../../platform/base64';
import {DEFAULT_SETTINGS, useSettings} from '../../../store/settings';

/** Оборачивает поддельный принтер в то, что отдаёт нативный модуль. */
function deviceFor(printer: FakePrinter, address = 'F0:13:C1:52:19:90') {
  return {
    address,
    name: 'Mi Portable Photo Printer',
    onDataReceived(listener: (event: {data: string}) => void) {
      const stop = printer.subscribe(bytes => listener({data: toBase64(bytes)}));
      return {remove: stop};
    },
    async write(data: string, _encoding?: string) {
      // Нативный модуль декодирует base64 обратно в байты.
      const raw = Uint8Array.from(atobBytes(data));
      await printer.write(raw);
      return true;
    },
    async disconnect() {
      printer.disconnect();
      return true;
    },
  };
}

function atobBytes(text: string): number[] {
  const {fromBase64} = require('../../../platform/base64');
  return Array.from(fromBase64(text) as Uint8Array);
}

beforeEach(() => {
  jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue('granted' as never);
  useSettings.setState({settings: DEFAULT_SETTINGS});
  globalThis.__btMock.getBondedDevices.mockResolvedValue([
    {address: 'F0:13:C1:52:19:90', name: 'Mi Portable Photo Printer'},
    {address: '11:22:33:44:55:66', name: 'Колонка JBL'},
  ]);
});

describe('список устройств', () => {
  it('показывается сразу при открытии раздела', async () => {
    render(<BluetoothScan />);
    expect(await screen.findByText(/Mi Portable Photo Printer/)).toBeTruthy();
    expect(screen.getByText(/Колонка JBL/)).toBeTruthy();
  });

  it('принтер помечен, чтобы оператор не гадал', async () => {
    render(<BluetoothScan />);
    expect(await screen.findByText(/похоже на принтер/)).toBeTruthy();
  });

  it('выключенный Bluetooth объясняется, а не оставляет пустой экран', async () => {
    globalThis.__btMock.isBluetoothEnabled.mockResolvedValue(false);
    render(<BluetoothScan />);
    expect(await screen.findByText(/Bluetooth выключен/)).toBeTruthy();
  });

  it('пустой список подсказывает, что делать', async () => {
    globalThis.__btMock.getBondedDevices.mockResolvedValue([]);
    render(<BluetoothScan />);
    expect(await screen.findByText(/Свяжите планшет с принтером/)).toBeTruthy();
  });
});

describe('выбор принтера', () => {
  it('сохраняется в настройках вместе с каналом печати', async () => {
    render(<BluetoothScan />);
    const buttons = await screen.findAllByText('Выбрать');
    await act(async () => {
      fireEvent.press(buttons[0]!);
    });

    const printer = useSettings.getState().settings.printer;
    expect(printer.bluetoothAddress).toBe('F0:13:C1:52:19:90');
    expect(printer.displayName).toBe('Mi Portable Photo Printer');
  });

  it('выбранный принтер отмечен в списке', async () => {
    useSettings.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        printer: {...DEFAULT_SETTINGS.printer, bluetoothAddress: 'F0:13:C1:52:19:90'},
      },
    });
    render(<BluetoothScan />);
    expect(await screen.findByText(/· выбран/)).toBeTruthy();
  });
});

describe('проверка связи', () => {
  it('проходит рукопожатие и показывает, что ответил принтер', async () => {
    const printer = new FakePrinter({battery: 77, cleanRemain: 4});
    globalThis.__btMock.connectToDevice.mockResolvedValue(deviceFor(printer));

    render(<BluetoothScan />);
    const buttons = await screen.findAllByText('Проверить связь');
    await act(async () => {
      fireEvent.press(buttons[0]!);
    });

    await waitFor(() => expect(screen.getByText('BHR9974GL')).toBeTruthy());
    expect(screen.getByText('2.1.2_0015')).toBeTruthy();
    expect(screen.getByText('свободен')).toBeTruthy();
    expect(screen.getByText('77%')).toBeTruthy();
    expect(screen.getByText('4 отпечатков')).toBeTruthy();
  });

  it('неотвечающий принтер объясняется, а не молчит', async () => {
    globalThis.__btMock.connectToDevice.mockRejectedValue(new Error('Устройство занято'));

    render(<BluetoothScan />);
    const buttons = await screen.findAllByText('Проверить связь');
    await act(async () => {
      fireEvent.press(buttons[0]!);
    });

    expect(await screen.findByText(/Принтер не отвечает: Устройство занято/)).toBeTruthy();
  });
});

describe('askPrinter', () => {
  it('отпускает принтер после проверки', async () => {
    const printer = new FakePrinter();
    const device = deviceFor(printer);
    const disconnect = jest.spyOn(device, 'disconnect');
    globalThis.__btMock.connectToDevice.mockResolvedValue(device);

    await askPrinter('F0:13:C1:52:19:90');
    // Занятый принтер не примет ни печать, ни телефон оператора.
    expect(disconnect).toHaveBeenCalled();
  });

  it('отпускает принтер даже когда проверка сорвалась', async () => {
    const printer = new FakePrinter({rejectHandshake: true});
    const device = deviceFor(printer);
    const disconnect = jest.spyOn(device, 'disconnect');
    globalThis.__btMock.connectToDevice.mockResolvedValue(device);

    await expect(askPrinter('F0:13:C1:52:19:90')).rejects.toThrow();
    expect(disconnect).toHaveBeenCalled();
  });
});

describe('состояния принтера по-русски', () => {
  it('переводятся понятно', () => {
    expect(describeState('idle')).toBe('свободен');
    expect(describeState('processing')).toBe('печатает');
    expect(describeState('error')).toBe('неисправность');
  });

  it('незнакомое состояние показывается как есть, а не теряется', () => {
    expect(describeState('calibrating')).toBe('calibrating');
  });
});
