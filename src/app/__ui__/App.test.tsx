/**
 * Приложение целиком: что видит человек, открывший его на своём телефоне.
 *
 * Здесь проверяются решения уровня композиции, а не отдельных экранов:
 * приложение не захватывает телефон при запуске, живое превью работает,
 * ненастроенный принтер виден сразу, а вход в админку остаётся спрятанным.
 */

import React from 'react';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react-native';

import App from '../App';
import {ADMIN_HOLD_MS} from '../../components/KioskScreen';
import {PRINTER_NOT_CONFIGURED} from '../../printing/transports';
import {DEFAULT_SETTINGS, useSettings} from '../../store/settings';

// ── Соседние слои ─────────────────────────────────────────────────────────
const mockBootstrap = jest.fn(async () => undefined);
const mockApplyPrinterSettings = jest.fn(async () => undefined);
const mockSnapshot = jest.fn(() => ({
  pending: 0,
  printer: {health: 'ready' as const},
}));
let mockNotifyQueue: ((snapshot: unknown) => void) | null = null;

jest.mock('../services', () => ({
  bootstrap: () => mockBootstrap(),
  applyPrinterSettings: (...args: unknown[]) => mockApplyPrinterSettings(...(args as [])),
  activeTransport: () => ({documentFormat: 'image/jpeg'}),
  printQueue: {
    snapshot: () => mockSnapshot(),
    subscribe: (listener: (snapshot: unknown) => void) => {
      mockNotifyQueue = listener;
      return () => {
        mockNotifyQueue = null;
      };
    },
    enqueue: jest.fn(async () => undefined),
  },
}));

jest.mock('../../platform/files', () => ({
  Paths: {shots: '/к/кадры', sheets: '/к/листы', archive: '/к/архив'},
  newFilePath: (dir: string, ext: string) => `${dir}/лист.${ext}`,
  writeBytes: jest.fn(async () => undefined),
  removeFile: jest.fn(async () => undefined),
  purgeOlderThan: jest.fn(async () => 0),
}));

jest.mock('../../imaging/composer', () => ({
  composeSheet: jest.fn(async () => ({
    jpeg: Uint8Array.from([1]),
    toRaster: () => ({width: 2, height: 3, rgba: new Uint8Array(24)}),
  })),
  DEFAULT_COMPOSE: {
    mirror: false,
    bleedPercent: 2,
    backgroundColor: '#FFFFFF',
    jpegQuality: 92,
    showTearLine: true,
  },
}));

// Админка тяжёлая и проверяется отдельно: здесь важно лишь, открылась ли она.
jest.mock('../../screens/admin/AdminScreen', () => {
  const React2 = require('react');
  const {Text} = require('react-native');
  return {
    AdminScreen: () => React2.createElement(Text, null, 'АДМИНКА'),
  };
});

const mockKiosk = {
  enterKioskMode: jest.fn(async () => true),
  exitKioskMode: jest.fn(async () => true),
};
jest.mock('../../platform/kiosk', () => ({
  enterKioskMode: () => mockKiosk.enterKioskMode(),
  exitKioskMode: () => mockKiosk.exitKioskMode(),
  isKioskActive: jest.fn(async () => false),
  keepScreenOn: jest.fn(async () => undefined),
  setImmersive: jest.fn(async () => undefined),
}));

beforeEach(() => {
  mockNotifyQueue = null;
  mockSnapshot.mockReturnValue({pending: 0, printer: {health: 'ready'}});
  useSettings.setState({
    settings: {
      ...DEFAULT_SETTINGS,
      locale: 'ru',
      printer: {...DEFAULT_SETTINGS.printer, transport: 'mock', endpoint: null},
      flow: {...DEFAULT_SETTINGS.flow, layouts: ['single']},
    },
  });
});

describe('запуск приложения', () => {
  it('не захватывает телефон при старте', async () => {
    // Человек ставит приложение на свой телефон, чтобы посмотреть. Если оно
    // закрепляет себя на экране, это выглядит как «телефон заблокировался»:
    // именно так и было. Закрепление — осознанное действие оператора.
    render(<App />);
    await act(async () => {});
    expect(mockKiosk.enterKioskMode).not.toHaveBeenCalled();
  });

  it('открывается на заставке с живым превью', async () => {
    render(<App />);
    await act(async () => {});

    expect(screen.getByText(/Нажмите, чтобы/)).toBeTruthy();
    const preview = screen.UNSAFE_root.findAllByType('Camera' as never)[0];
    expect(preview!.props.isActive).toBe(true);
  });

  it('готовит папки и очередь', async () => {
    render(<App />);
    await waitFor(() => expect(mockBootstrap).toHaveBeenCalled());
  });

  it('собирает транспорт печати под текущие настройки', async () => {
    render(<App />);
    await waitFor(() => expect(mockApplyPrinterSettings).toHaveBeenCalled());
  });
});

describe('состояние принтера на заставке', () => {
  it('ненастроенный принтер виден сразу и предлагает настройку', async () => {
    mockSnapshot.mockReturnValue({
      pending: 0,
      printer: {health: 'blocked', blockingReason: PRINTER_NOT_CONFIGURED} as never,
    });
    render(<App />);
    await act(async () => {});

    expect(screen.getByText('Принтер не подключён')).toBeTruthy();
    expect(screen.getByText(/Настроить принтер/)).toBeTruthy();
  });

  it('выбранный, но не найденный IPP-принтер — тоже «не подключён»', async () => {
    useSettings.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        printer: {...DEFAULT_SETTINGS.printer, transport: 'ipp', endpoint: null},
      },
    });
    render(<App />);
    await act(async () => {});
    expect(screen.getByText('Принтер не подключён')).toBeTruthy();
  });

  it('состояние очереди доезжает до экрана без перезапуска', async () => {
    render(<App />);
    await act(async () => {});
    expect(screen.queryByText('Закончилась бумага')).toBeNull();

    act(() => {
      mockNotifyQueue?.({
        pending: 2,
        pausedReason: 'media-empty',
        printer: {health: 'blocked'},
      });
    });

    expect(screen.getByText('Закончилась бумага')).toBeTruthy();
  });
});

describe('вход в админку', () => {
  it('спрятан от гостя, но открывается удержанием угла', async () => {
    jest.useFakeTimers();
    render(<App />);

    expect(screen.queryByText('АДМИНКА')).toBeNull();

    const corner = screen.UNSAFE_root.findAllByProps({
      importantForAccessibility: 'no-hide-descendants',
    })[0];
    fireEvent(corner!, 'pressIn');
    act(() => {
      jest.advanceTimersByTime(ADMIN_HOLD_MS);
    });

    expect(screen.getByText('АДМИНКА')).toBeTruthy();
    jest.useRealTimers();
  });

  it('кнопка «Настроить принтер» ведёт туда же', async () => {
    mockSnapshot.mockReturnValue({
      pending: 0,
      printer: {health: 'blocked', blockingReason: PRINTER_NOT_CONFIGURED} as never,
    });
    render(<App />);
    await act(async () => {});

    fireEvent.press(screen.getByText(/Настроить принтер/));
    expect(screen.getByText('АДМИНКА')).toBeTruthy();
  });

  it('пока админка открыта, камера выключена', async () => {
    // Оператор настраивает принтер — превью в это время только жрёт батарею.
    mockSnapshot.mockReturnValue({
      pending: 0,
      printer: {health: 'blocked', blockingReason: PRINTER_NOT_CONFIGURED} as never,
    });
    render(<App />);
    await act(async () => {});
    fireEvent.press(screen.getByText(/Настроить принтер/));

    const preview = screen.UNSAFE_root.findAllByType('Camera' as never)[0];
    expect(preview!.props.isActive).toBe(false);
  });
});

describe('язык интерфейса', () => {
  it('переключается и запоминается в настройках', async () => {
    render(<App />);
    await act(async () => {});

    fireEvent.press(screen.getByText('EN'));
    expect(useSettings.getState().settings.locale).toBe('en');
    expect(screen.getByText(/Tap to take a photo/)).toBeTruthy();
  });
});

describe('сценарий гостя целиком', () => {
  // Поддельные часы тут не годятся: `act` дожидается работы планировщика
  // React через реальный макрозадачу, и вместе с замороженными таймерами это
  // встаёт намертво. Поэтому проход идёт в реальном времени и занимает
  // несколько секунд — цена одной честной сквозной проверки.
  let noise: jest.SpyInstance;

  beforeEach(() => {
    // Такты автомата приходят по таймеру между проверками `waitFor` и потому
    // формально вне `act`. Предупреждение об этом здесь ожидаемо и заливает
    // вывод; глушим только его, остальные ошибки идут как обычно.
    const original = console.error;
    noise = jest.spyOn(console, 'error').mockImplementation((...args) => {
      if (String(args[0] ?? '').includes('not wrapped in act')) {
        return;
      }
      original(...args);
    });
  });

  afterEach(() => noise.mockRestore());

  it('от касания до благодарности', async () => {
    render(<App />);
    await act(async () => {});

    fireEvent.press(screen.getAllByRole('button')[0]!);
    await waitFor(() => expect(screen.getByText('Как вам?')).toBeTruthy(), {
      timeout: 15_000,
      interval: 50,
    });

    fireEvent.press(screen.getByText('Печатать'));
    await waitFor(() => expect(screen.getByText('Спасибо!')).toBeTruthy(), {
      timeout: 15_000,
      interval: 50,
    });

    expect(screen.getByText('Заберите фотографию из принтера')).toBeTruthy();
  }, 40_000);

  it('отмена на съёмке возвращает к заставке', async () => {
    render(<App />);
    await act(async () => {});

    fireEvent.press(screen.getAllByRole('button')[0]!);
    await waitFor(() => expect(screen.getByText('Приготовьтесь!')).toBeTruthy(), {
      timeout: 15_000,
      interval: 50,
    });

    fireEvent.press(screen.getByText('Отмена'));
    expect(screen.getByText(/Нажмите, чтобы/)).toBeTruthy();
  }, 40_000);

});
