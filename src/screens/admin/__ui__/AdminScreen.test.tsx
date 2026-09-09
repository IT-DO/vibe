/**
 * Админка оператора.
 *
 * Её задача — чтобы человек, впервые увидевший будку за пятнадцать минут до
 * начала, успел её настроить. Поэтому проверяем не оформление, а путь:
 * найти принтер, выбрать его, увидеть очередь и журнал сбоев, включить
 * киоск-режим осознанно — и не включить его случайно.
 */

import React from 'react';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react-native';

import {AdminScreen} from '../AdminScreen';
import {DEFAULT_SETTINGS, useSettings} from '../../../store/settings';

// ── Соседние слои ─────────────────────────────────────────────────────────
const mockFindPrinters = jest.fn(async () => [] as unknown[]);
const mockApplyPrinterSettings = jest.fn(async () => undefined);
const mockQueueSnapshot = jest.fn(() => ({
  pending: 0,
  paused: false,
  jobs: [] as unknown[],
  printer: {health: 'ready' as const},
}));
const mockRetry = jest.fn(async (_id: string) => undefined);
const mockCancel = jest.fn(async (_id: string) => undefined);

jest.mock('../../../app/services', () => ({
  findPrinters: () => mockFindPrinters(),
  applyPrinterSettings: (...args: unknown[]) => mockApplyPrinterSettings(...(args as [])),
  activeTransport: () => ({label: 'Демо-принтер', canTrackJobs: false}),
  printQueue: {
    snapshot: () => mockQueueSnapshot(),
    subscribe: () => () => {},
    retry: (id: string) => mockRetry(id),
    cancel: (id: string) => mockCancel(id),
  },
}));

const mockEnterKiosk = jest.fn(async () => ({locked: true}));
const mockExitKiosk = jest.fn(async () => undefined);
jest.mock('../../../platform/kiosk', () => ({
  enterKioskMode: () => mockEnterKiosk(),
  exitKioskMode: () => mockExitKiosk(),
  supportsLockTask: true,
}));

const mockCrashLog = jest.fn(async () => '');
const mockClearCrashLog = jest.fn(async () => undefined);
jest.mock('../../../platform/crashlog', () => ({
  readCrashLog: () => mockCrashLog(),
  clearCrashLog: () => mockClearCrashLog(),
}));

jest.mock('../../../platform/files', () => ({
  usedBytes: jest.fn(async () => 12_300_000),
  purgeAll: jest.fn(async () => undefined),
}));

jest.mock('../../../platform/network-info', () => ({
  currentSsid: jest.fn(async () => 'Event-WiFi'),
}));

const PRINTER = {
  displayName: 'Xiaomi Photo Printer',
  endpoint: {host: '192.168.1.42', port: 631, path: '/ipp/print'},
  source: 'mdns' as const,
  capabilities: {
    documentFormats: ['image/jpeg', 'image/pwg-raster'],
    media: [{name: 'na_index-4x6_4x6in', widthMm: 101.6, heightMm: 152.4}],
  },
};

/** Компактный принтер на карманной бумаге 50 × 76 мм. */
const POCKET_PRINTER = {
  displayName: 'Xiaomi Pocket Printer',
  endpoint: {host: '192.168.1.43', port: 631, path: '/ipp/print'},
  source: 'mdns' as const,
  capabilities: {
    documentFormats: ['image/jpeg'],
    media: [{name: 'oe_photo-2x3_2x3in', widthMm: 50.8, heightMm: 76.2}],
  },
};

beforeEach(() => {
  useSettings.setState({settings: {...DEFAULT_SETTINGS, adminPin: '2468'}});
  mockFindPrinters.mockResolvedValue([]);
  mockCrashLog.mockResolvedValue('');
  mockQueueSnapshot.mockReturnValue({
    pending: 0,
    paused: false,
    jobs: [],
    printer: {health: 'ready'},
  });
});

/** Открывает админку, вводя правильный ПИН. */
async function openAdmin(onClose = jest.fn()) {
  render(<AdminScreen onClose={onClose} />);
  for (const digit of '2468') {
    fireEvent.press(screen.getByLabelText(digit));
  }
  await act(async () => {});
  return onClose;
}

describe('вход в админку', () => {
  it('закрыт ПИН-кодом', () => {
    render(<AdminScreen onClose={jest.fn()} />);
    expect(screen.getByText('ПИН-код')).toBeTruthy();
    expect(screen.queryByText('Настройки')).toBeNull();
  });

  it('верный код открывает настройки', async () => {
    await openAdmin();
    expect(screen.getByText('Настройки')).toBeTruthy();
  });

  it('неверный не открывает', async () => {
    render(<AdminScreen onClose={jest.fn()} />);
    for (const digit of '1357') {
      fireEvent.press(screen.getByLabelText(digit));
    }
    await act(async () => {});
    expect(screen.queryByText('Настройки')).toBeNull();
  });

  it('отмена закрывает админку', () => {
    const onClose = jest.fn();
    render(<AdminScreen onClose={onClose} />);
    fireEvent.press(screen.getByLabelText('✕'));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('настройка принтера', () => {
  it('пока принтер не выбран, так и написано', async () => {
    await openAdmin();
    expect(screen.getByText('не выбран')).toBeTruthy();
  });

  it('поиск показывает найденное с адресом и форматами', async () => {
    mockFindPrinters.mockResolvedValue([PRINTER]);
    await openAdmin();

    fireEvent.press(screen.getByText('Найти принтер'));
    await waitFor(() => expect(screen.getByText('Xiaomi Photo Printer')).toBeTruthy());

    expect(screen.getByText(/192\.168\.1\.42:631/)).toBeTruthy();
    expect(screen.getByText('image/jpeg, image/pwg-raster')).toBeTruthy();
  });

  it('пустой поиск объясняет, куда смотреть', async () => {
    await openAdmin();
    expect(screen.getByText(/в одной сети с ним/)).toBeTruthy();
  });

  it('выбор принтера сохраняется и применяется сразу', async () => {
    // Оператор нажал «выбрать» — принтер должен заработать без перезапуска.
    mockFindPrinters.mockResolvedValue([PRINTER]);
    await openAdmin();

    fireEvent.press(screen.getByText('Найти принтер'));
    await waitFor(() => expect(screen.getByText('Xiaomi Photo Printer')).toBeTruthy());
    fireEvent.press(screen.getByText('выбрать'));
    await act(async () => {});

    expect(useSettings.getState().settings.printer).toMatchObject({
      transport: 'ipp',
      endpoint: PRINTER.endpoint,
      displayName: 'Xiaomi Photo Printer',
    });
    expect(mockApplyPrinterSettings).toHaveBeenCalledWith(
      expect.objectContaining({transport: 'ipp', endpoint: PRINTER.endpoint}),
    );
  });

  it('формат бумаги берётся у самого принтера', async () => {
    // Угадывать по названию модели нельзя: у одного «1S» встречаются и
    // картриджи 10 × 15, и карманная бумага 50 × 76 мм.
    mockFindPrinters.mockResolvedValue([POCKET_PRINTER]);
    await openAdmin();

    fireEvent.press(screen.getByText('Найти принтер'));
    await waitFor(() => expect(screen.getByText('Xiaomi Pocket Printer')).toBeTruthy());
    fireEvent.press(screen.getByText('выбрать'));
    await act(async () => {});

    expect(useSettings.getState().settings.printer.media).toBe('2x3');
  });

  it('принтер без списка носителей не меняет выбранный формат', async () => {
    // Испортить лист хуже, чем не угадать: оставляем то, что выбрал человек.
    mockFindPrinters.mockResolvedValue([
      {...PRINTER, capabilities: {documentFormats: ['image/jpeg']}},
    ]);
    useSettings.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        adminPin: '2468',
        printer: {...DEFAULT_SETTINGS.printer, media: '3x3'},
      },
    });
    await openAdmin();

    fireEvent.press(screen.getByText('Найти принтер'));
    await waitFor(() => expect(screen.getByText('Xiaomi Photo Printer')).toBeTruthy());
    fireEvent.press(screen.getByText('выбрать'));
    await act(async () => {});

    expect(useSettings.getState().settings.printer.media).toBe('3x3');
    expect(useSettings.getState().settings.printer.endpoint).toEqual(PRINTER.endpoint);
  });

  it('показывает сеть, в которой находится планшет', async () => {
    // Половина проблем с печатью — планшет и принтер в разных сетях.
    await openAdmin();
    await waitFor(() => expect(screen.getByText('Event-WiFi')).toBeTruthy());
  });

  it('состояние принтера переводится на человеческий', async () => {
    mockQueueSnapshot.mockReturnValue({
      pending: 2,
      paused: true,
      jobs: [],
      printer: {health: 'blocked', blockingReason: 'media-empty'} as never,
    });
    await openAdmin();
    expect(screen.getAllByText('Закончилась бумага').length).toBeGreaterThan(0);
  });
});

describe('очередь печати', () => {
  it('упавшее задание можно повторить', async () => {
    mockQueueSnapshot.mockReturnValue({
      pending: 1,
      paused: false,
      jobs: [
        {id: 'j1', name: 'Свадьба · 19:40:12', state: 'failed', attempts: 3, error: 'нет связи'},
      ],
      printer: {health: 'ready'},
    } as never);
    await openAdmin();

    expect(screen.getByText(/нет связи/)).toBeTruthy();
    fireEvent.press(screen.getByText('Повторить'));
    expect(mockRetry).toHaveBeenCalledWith('j1');
  });

  it('ждущее задание можно отменить', async () => {
    mockQueueSnapshot.mockReturnValue({
      pending: 1,
      paused: false,
      jobs: [{id: 'j2', name: 'Свадьба · 19:41:00', state: 'queued', attempts: 1}],
      printer: {health: 'ready'},
    } as never);
    await openAdmin();

    fireEvent.press(screen.getByText('Отменить'));
    expect(mockCancel).toHaveBeenCalledWith('j2');
  });

  it('напечатанное не предлагает ни повторить, ни отменить', async () => {
    mockQueueSnapshot.mockReturnValue({
      pending: 0,
      paused: false,
      jobs: [{id: 'j3', name: 'Свадьба · 19:30:00', state: 'done', attempts: 1}],
      printer: {health: 'ready'},
    } as never);
    await openAdmin();

    expect(screen.queryByText('Повторить')).toBeNull();
    expect(screen.queryByText('Отменить')).toBeNull();
  });
});

describe('журнал сбоев', () => {
  it('без сбоев так и говорит', async () => {
    await openAdmin();
    await waitFor(() => expect(screen.getByText('Сбоев не записано')).toBeTruthy());
  });

  it('записанное показывается прямо в админке', async () => {
    // Ради этого журнал и заведён: владельцу телефона не нужен logcat.
    mockCrashLog.mockResolvedValue(
      '\n=== Сборка превью 09.09.2026 ===\nError: Skia недоступна\n',
    );
    await openAdmin();

    await waitFor(() => expect(screen.getByText(/Skia недоступна/)).toBeTruthy());
    expect(screen.getByText('Записей')).toBeTruthy();
    expect(screen.queryByText('Сбоев не записано')).toBeNull();
  });

  it('журнал можно очистить', async () => {
    mockCrashLog.mockResolvedValue(
      '\n=== Запись листа 09.09.2026 ===\nError: диск переполнен\n',
    );
    await openAdmin();
    await waitFor(() => expect(screen.getByText(/диск переполнен/)).toBeTruthy());

    fireEvent.press(screen.getByText('Очистить'));
    await waitFor(() => expect(screen.getByText('Сбоев не записано')).toBeTruthy());
    expect(mockClearCrashLog).toHaveBeenCalled();
  });
});

describe('киоск-режим', () => {
  it('включается только вручную и только отсюда', async () => {
    // Закрепление при запуске выглядело как «телефон заблокировался».
    await openAdmin();
    expect(mockEnterKiosk).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText('Включить киоск-режим'));
    await waitFor(() => expect(mockEnterKiosk).toHaveBeenCalled());
    expect(screen.getByText('Приложение закреплено на экране')).toBeTruthy();
  });

  it('отказ устройства объясняется, а не молчит', async () => {
    mockEnterKiosk.mockResolvedValue({locked: false} as never);
    await openAdmin();

    fireEvent.press(screen.getByText('Включить киоск-режим'));
    await waitFor(() => expect(screen.getByText(/Устройство не разрешило/)).toBeTruthy());
  });

  it('выход из киоска закрывает и саму админку', async () => {
    const onClose = await openAdmin();
    fireEvent.press(screen.getByText('Выйти из киоск-режима'));
    await act(async () => {});

    expect(mockExitKiosk).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

describe('настройки мероприятия', () => {
  it('название сохраняется в хранилище', async () => {
    await openAdmin();
    fireEvent.changeText(screen.getByLabelText('Название'), 'Юбилей');
    expect(useSettings.getState().settings.event.title).toBe('Юбилей');
  });

  it('смена канала печати доходит до настроек', async () => {
    await openAdmin();
    fireEvent.press(screen.getByText('Демо'));
    expect(useSettings.getState().settings.printer.transport).toBe('mock');
  });
});
