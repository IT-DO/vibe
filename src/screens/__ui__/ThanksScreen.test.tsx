/**
 * Экраны после печати. Главная задача — отправить человека к принтеру и
 * освободить будку, а при ошибке не пугать техническими подробностями.
 */

import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react-native';

import {
  ErrorScreen,
  PrintingScreen,
  ThanksScreen,
  type ErrorScreenProps,
  type ThanksScreenProps,
} from '../ThanksScreen';

const thanksProps = () => ({
  locale: 'ru' as const,
  accent: '#FF5A5F',
  queuePosition: 1,
  waitSeconds: 45,
  digitalCopyUrl: '',
  onDismiss: jest.fn(),
});

const setupThanks = (overrides: Partial<ThanksScreenProps> = {}) => {
  const props = {...thanksProps(), ...overrides};
  render(<ThanksScreen {...props} />);
  return props;
};

const setupError = (overrides: Partial<ErrorScreenProps> = {}) => {
  const props = {locale: 'ru' as const, message: '', onDismiss: jest.fn(), ...overrides};
  render(<ErrorScreen {...props} />);
  return props;
};

describe('отправка', () => {
  it('говорит, что происходит', () => {
    render(<PrintingScreen locale="ru" accent="#FF5A5F" />);
    expect(screen.getByText('Отправляем на принтер…')).toBeTruthy();
  });
});

describe('благодарность', () => {
  it('отправляет человека к принтеру, а не оставляет у экрана', () => {
    // Пока гость стоит у планшета, будка занята и очередь стоит.
    setupThanks();
    expect(screen.getByText('Спасибо!')).toBeTruthy();
    expect(screen.getByText('Заберите фотографию из принтера')).toBeTruthy();
  });

  it('называет время ожидания', () => {
    setupThanks({waitSeconds: 90});
    expect(screen.getByText('Будет готова примерно через 90 с')).toBeTruthy();
  });

  it('первому в очереди про очередь не сообщает', () => {
    setupThanks({queuePosition: 1});
    expect(screen.queryByText(/в очереди/)).toBeNull();
  });

  it('остальным честно называет место в очереди', () => {
    setupThanks({queuePosition: 3});
    expect(screen.getByText('Ваша фотография 3-я в очереди')).toBeTruthy();
  });

  it('без ссылки QR-код не рисует', () => {
    setupThanks({digitalCopyUrl: ''});
    expect(screen.queryByText(/цифровую копию/)).toBeNull();
  });

  it('со ссылкой предлагает цифровую копию', () => {
    setupThanks({digitalCopyUrl: 'https://example.org/фото/17'});
    expect(screen.getByText('Наведите камеру, чтобы забрать цифровую копию')).toBeTruthy();
  });

  it('касание освобождает будку для следующего', () => {
    const props = setupThanks();
    fireEvent.press(screen.getAllByRole('button')[0]!);
    expect(props.onDismiss).toHaveBeenCalled();
  });

  it('переводится', () => {
    setupThanks({locale: 'en', waitSeconds: 30});
    expect(screen.getByText('Thank you!')).toBeTruthy();
    expect(screen.getByText('Ready in about 30s')).toBeTruthy();
  });
});

describe('ошибка', () => {
  it('не показывает гостю технический текст, если сообщения нет', () => {
    setupError({message: ''});
    expect(screen.getByText('Одну минуту')).toBeTruthy();
    expect(screen.getByText('Что-то пошло не так')).toBeTruthy();
  });

  it('показывает понятную причину, когда она есть', () => {
    setupError({message: 'Закончилась бумага'});
    expect(screen.getByText('Закончилась бумага')).toBeTruthy();
    expect(screen.queryByText('Что-то пошло не так')).toBeNull();
  });

  it('всегда зовёт организатора', () => {
    // Гость не должен решать проблему сам и не должен уходить молча.
    setupError({message: 'Замятие бумаги'});
    expect(screen.getByText('Позовите, пожалуйста, организатора')).toBeTruthy();
  });

  it('касание закрывает экран', () => {
    const props = setupError();
    fireEvent.press(screen.getAllByRole('button')[0]!);
    expect(props.onDismiss).toHaveBeenCalled();
  });

  it('переводится', () => {
    setupError({locale: 'en'});
    expect(screen.getByText('One moment')).toBeTruthy();
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByText('Please find a host')).toBeTruthy();
  });
});
