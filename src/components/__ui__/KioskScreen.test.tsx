/**
 * Общая обёртка экранов: вход в админку и касание по всему экрану.
 *
 * Вход спрятан намеренно — кнопка «Настройки» на виду означает, что в неё
 * будет тыкать каждый гость. Поэтому проверяем ровно баланс: случайное
 * касание админку не открывает, а осознанное удержание открывает.
 */

import React from 'react';
import {Text} from 'react-native';
import {act, fireEvent, render, screen} from '@testing-library/react-native';

import {ADMIN_HOLD_MS, KioskScreen} from '../KioskScreen';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

/** Скрытая зона входа в админку — она намеренно без подписи. */
function secretCorner() {
  return screen.UNSAFE_root.findAllByProps({importantForAccessibility: 'no-hide-descendants'})[0];
}

describe('вход в админку', () => {
  it('открывается после удержания угла', () => {
    const onSecretHold = jest.fn();
    render(
      <KioskScreen onSecretHold={onSecretHold}>
        <Text>содержимое</Text>
      </KioskScreen>,
    );

    fireEvent(secretCorner()!, 'pressIn');
    act(() => {
      jest.advanceTimersByTime(ADMIN_HOLD_MS);
    });

    expect(onSecretHold).toHaveBeenCalledTimes(1);
  });

  it('короткое касание угла админку не открывает', () => {
    // Угол экрана задевают рукой постоянно — это не должно ничего значить.
    const onSecretHold = jest.fn();
    render(
      <KioskScreen onSecretHold={onSecretHold}>
        <Text>содержимое</Text>
      </KioskScreen>,
    );

    fireEvent(secretCorner()!, 'pressIn');
    act(() => {
      jest.advanceTimersByTime(ADMIN_HOLD_MS - 500);
    });
    fireEvent(secretCorner()!, 'pressOut');
    act(() => {
      jest.advanceTimersByTime(ADMIN_HOLD_MS);
    });

    expect(onSecretHold).not.toHaveBeenCalled();
  });

  it('без обработчика скрытой зоны вообще нет', () => {
    render(
      <KioskScreen>
        <Text>содержимое</Text>
      </KioskScreen>,
    );
    expect(
      screen.UNSAFE_root.findAllByProps({importantForAccessibility: 'no-hide-descendants'}),
    ).toHaveLength(0);
  });

  it('уход с экрана во время удержания не открывает админку позже', () => {
    // Иначе таймер срабатывает уже на другом экране и вываливает настройки
    // посреди чужой съёмки.
    const onSecretHold = jest.fn();
    const view = render(
      <KioskScreen onSecretHold={onSecretHold}>
        <Text>содержимое</Text>
      </KioskScreen>,
    );

    fireEvent(secretCorner()!, 'pressIn');
    view.unmount();
    act(() => {
      jest.advanceTimersByTime(ADMIN_HOLD_MS * 2);
    });

    expect(onSecretHold).not.toHaveBeenCalled();
  });
});

describe('касание по всему экрану', () => {
  it('работает, когда обработчик задан', () => {
    const onPressAnywhere = jest.fn();
    render(
      <KioskScreen onPressAnywhere={onPressAnywhere}>
        <Text>содержимое</Text>
      </KioskScreen>,
    );
    fireEvent.press(screen.getAllByRole('button')[0]!);
    expect(onPressAnywhere).toHaveBeenCalled();
  });

  it('без обработчика экран не оборачивается в кнопку', () => {
    // Пустая кнопка во весь экран перехватывала бы касания у содержимого.
    render(
      <KioskScreen>
        <Text>содержимое</Text>
      </KioskScreen>,
    );
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('содержимое остаётся нажимаемым поверх подложки', () => {
    const onPressAnywhere = jest.fn();
    const onInner = jest.fn();
    render(
      <KioskScreen onPressAnywhere={onPressAnywhere}>
        <Text onPress={onInner}>кнопка внутри</Text>
      </KioskScreen>,
    );
    fireEvent.press(screen.getByText('кнопка внутри'));
    expect(onInner).toHaveBeenCalled();
  });
});

describe('фон экрана', () => {
  it('по умолчанию непрозрачный', () => {
    render(
      <KioskScreen>
        <Text>содержимое</Text>
      </KioskScreen>,
    );
    const style = screen.getByTestId('kiosk-screen').props.style;
    expect(JSON.stringify(style)).toContain('backgroundColor');
  });

  it('может быть прозрачным — под ним живая камера', () => {
    render(
      <KioskScreen backgroundColor="transparent">
        <Text>содержимое</Text>
      </KioskScreen>,
    );
    expect(JSON.stringify(screen.getByTestId('kiosk-screen').props.style)).toContain(
      'transparent',
    );
  });
});
