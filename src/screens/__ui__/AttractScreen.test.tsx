import React from 'react';
import {StyleSheet} from 'react-native';
import {fireEvent, render, screen} from '@testing-library/react-native';

import {AttractScreen, type AttractScreenProps} from '../AttractScreen';
import type {PrinterHealth} from '../../printing/ipp/capabilities';

/**
 * Свежие пропсы на каждый тест: общий объект с jest.fn() копил бы вызовы
 * между тестами, и проверка «не вызывалось» зависела бы от порядка запуска.
 */
const baseProps = () => ({
  locale: 'ru' as const,
  title: 'Свадьба Ани и Пети',
  subtitle: '12 сентября 2026',
  logoPath: '',
  accent: '#FF5A5F',
  printerHealth: 'ready' as PrinterHealth,
  queueLength: 0,
  printerMissing: false,
  onStart: jest.fn(),
  onSecretHold: jest.fn(),
  onToggleLocale: jest.fn(),
  onSetUpPrinter: jest.fn(),
  onPickPhoto: jest.fn(),
});

const setup = (overrides: Partial<AttractScreenProps> = {}) => {
  const props = {...baseProps(), ...overrides};
  render(<AttractScreen {...props} />);
  return props;
};

/** Плоский стиль корневой обёртки экрана. */
function screenStyle() {
  return StyleSheet.flatten(screen.getByTestId('kiosk-screen').props.style);
}

describe('заставка — обычное состояние', () => {
  it('показывает название мероприятия и призыв', () => {
    setup();
    expect(screen.getByText('Свадьба Ани и Пети')).toBeTruthy();
    expect(screen.getByText(/Нажмите, чтобы/)).toBeTruthy();
  });

  it('НЕ закрывает камеру фоном', () => {
    // Регрессия: заставка бралась за общую обёртку с непрозрачным фоном, и
    // живое превью — приём, ради которого человек подходит к будке, — не
    // работало ни разу.
    setup();
    expect(screenStyle().backgroundColor).toBe('transparent');
  });

  it('касание в любом месте запускает съёмку', () => {
    const props = setup();
    fireEvent.press(screen.getAllByRole('button')[0]!);
    expect(props.onStart).toHaveBeenCalled();
  });

  it('предлагает напечатать готовый снимок', () => {
    const props = setup();
    fireEvent.press(screen.getByText(/Выбрать готовое фото/));
    expect(props.onPickPhoto).toHaveBeenCalled();
  });

  it('переключает язык', () => {
    const props = setup();
    fireEvent.press(screen.getByText('EN'));
    expect(props.onToggleLocale).toHaveBeenCalled();
  });
});

describe('заставка — принтер не подключён', () => {
  it('говорит об этом прямо и предлагает настроить', () => {
    setup({printerMissing: true});
    expect(screen.getByText('Принтер не подключён')).toBeTruthy();
    expect(screen.getByText(/Настроить принтер/)).toBeTruthy();
  });

  it('не предлагает фотографироваться', () => {
    // Дать гостю пройти весь сценарий ради отпечатка, которого не будет, —
    // худший из возможных исходов.
    setup({printerMissing: true});
    expect(screen.queryByText(/Нажмите, чтобы/)).toBeNull();
  });

  it('касание экрана не запускает съёмку', () => {
    const props = setup({printerMissing: true});
    for (const button of screen.getAllByRole('button')) {
      fireEvent.press(button);
    }
    expect(props.onStart).not.toHaveBeenCalled();
  });

  it('кнопка ведёт в настройки', () => {
    const props = setup({printerMissing: true});
    fireEvent.press(screen.getByText(/Настроить принтер/));
    expect(props.onSetUpPrinter).toHaveBeenCalled();
  });

  it('не предлагает и печать готового снимка — печатать всё равно нечем', () => {
    setup({printerMissing: true});
    expect(screen.queryByText(/Выбрать готовое фото/)).toBeNull();
  });
});

describe('заставка — принтер неисправен', () => {
  it('сообщение адресовано гостю, а не наладчику', () => {
    setup({printerHealth: 'blocked'});
    expect(screen.getByText(/позовите организатора/)).toBeTruthy();
  });

  it('съёмка не запускается', () => {
    const props = setup({printerHealth: 'blocked'});
    for (const button of screen.getAllByRole('button')) {
      fireEvent.press(button);
    }
    expect(props.onStart).not.toHaveBeenCalled();
  });

  it('индикатор показывает причину', () => {
    setup({printerHealth: 'blocked', printerReason: 'media-empty'});
    expect(screen.getByText('Закончилась бумага')).toBeTruthy();
  });
});

describe('заставка — язык интерфейса', () => {
  it('переключается на английский целиком', () => {
    setup({locale: 'en'});
    expect(screen.getByText(/Tap to take a photo/)).toBeTruthy();
    expect(screen.getByText('РУ')).toBeTruthy();
  });

  it('сообщение о принтере тоже переводится', () => {
    setup({locale: 'en', printerMissing: true});
    expect(screen.getByText('No printer connected')).toBeTruthy();
  });
});
