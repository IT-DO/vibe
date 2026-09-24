import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react-native';

import {BigButton} from '../BigButton';

describe('BigButton', () => {
  it('показывает подпись и вызывает обработчик', () => {
    const onPress = jest.fn();
    render(<BigButton label="Печатать" onPress={onPress} />);

    fireEvent.press(screen.getByText('Печатать'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('выключенная кнопка не срабатывает', () => {
    const onPress = jest.fn();
    render(<BigButton label="Печатать" onPress={onPress} disabled />);

    fireEvent.press(screen.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('занятая кнопка не срабатывает и прячет подпись', () => {
    // Двойное нажатие на «Печатать» не должно ставить два задания.
    const onPress = jest.fn();
    render(<BigButton label="Печатать" onPress={onPress} busy />);

    expect(screen.queryByText('Печатать')).toBeNull();
    fireEvent.press(screen.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('сообщает о своей недоступности вспомогательным технологиям', () => {
    render(<BigButton label="Печатать" onPress={jest.fn()} disabled />);
    expect(screen.getByRole('button').props.accessibilityState.disabled).toBe(true);
  });

  it('иконка не заменяет подпись', () => {
    render(<BigButton label="Печатать" icon="🖨" onPress={jest.fn()} />);
    expect(screen.getByText('Печатать')).toBeTruthy();
    expect(screen.getByText('🖨')).toBeTruthy();
  });
});
