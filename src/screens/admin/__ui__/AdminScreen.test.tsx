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

const mockSetTraceEnabled = jest.fn((_on: boolean) => undefined);
jest.mock('../../../platform/trace', () => ({
  setTraceEnabled: (on: boolean) => mockSetTraceEnabled(on),
  flushTrace: jest.fn(async () => undefined),
}));

jest.mock('../../../platform/files', () => ({
  usedBytes: jest.fn(async () => 12_300_000),
  purgeAll: jest.fn(async () => undefined),
}));


beforeEach(() => {
  useSettings.setState({settings: {...DEFAULT_SETTINGS, adminPin: '2468'}});
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

  it('формат бумаги показан, но не выбирается — он один', async () => {
    // Принтер печатает только на карманной бумаге ZINK. Переключатель из
    // одного варианта — это не выбор, а лишний повод в него ткнуть.
    await openAdmin();
    expect(screen.getByText(/5 × 7,6 см/)).toBeTruthy();
  });

  it('показывает адрес выбранного принтера', async () => {
    useSettings.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        printer: {
          ...DEFAULT_SETTINGS.printer,
          bluetoothAddress: 'F0:13:C1:52:19:90',
          displayName: 'Mi Portable Photo Printer',
        },
      },
    });
    await openAdmin();
    expect(screen.getByText('F0:13:C1:52:19:90')).toBeTruthy();
    expect(screen.getByText('Mi Portable Photo Printer')).toBeTruthy();
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

});

describe('отладка', () => {
  it('по умолчанию выключена — на мероприятии она только копит файл', async () => {
    await openAdmin();
    expect(useSettings.getState().settings.verboseLog).toBe(false);
  });

  it('флажок включает подробную запись и запоминает это', async () => {
    await openAdmin();
    await act(async () => {
      fireEvent(
        screen.getByLabelText('Отладка: писать каждый шаг'),
        'valueChange',
        true,
      );
    });

    expect(useSettings.getState().settings.verboseLog).toBe(true);
    // Настройки мало: запись должна включиться прямо сейчас, а не после
    // перезапуска — оператор включает её, чтобы тут же повторить сбой.
    expect(mockSetTraceEnabled).toHaveBeenCalledWith(true);
  });

  it('повторное нажатие выключает', async () => {
    useSettings.setState({
      settings: {...DEFAULT_SETTINGS, adminPin: '2468', verboseLog: true},
    });
    await openAdmin();
    await act(async () => {
      fireEvent(
        screen.getByLabelText('Отладка: писать каждый шаг'),
        'valueChange',
        false,
      );
    });

    expect(useSettings.getState().settings.verboseLog).toBe(false);
    expect(mockSetTraceEnabled).toHaveBeenCalledWith(false);
  });
});
