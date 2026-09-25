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

describe('подпись целиком', () => {
  it('длинная подпись переносится, а не обрывается многоточием', () => {
    // «Выбрать готовое фото» на телефоне не помещалось в строку, и гость
    // видел «Выбрать готово…» — обрыв посреди слова.
    render(<BigButton label="Выбрать готовое фото" onPress={jest.fn()} />);
    const label = screen.getByText('Выбрать готовое фото');
    expect(label.props.numberOfLines).toBe(2);
  });
});

describe('вес действия', () => {
  it('главное действие крупнее запасного', () => {
    const {unmount} = render(<BigButton label="Печатать" onPress={jest.fn()} />);
    const primary = flatten(screen.getByLabelText('Печатать').props.style);
    unmount();

    render(<BigButton label="Переснять" weight="secondary" onPress={jest.fn()} />);
    const secondary = flatten(screen.getByLabelText('Переснять').props.style);

    // Рядом с главным запасное должно читаться как запасное, а не как
    // равный выбор: иначе гость выбирает наугад.
    expect(Number(secondary.minHeight)).toBeLessThan(Number(primary.minHeight));
    expect(Number(secondary.minWidth)).toBeLessThan(Number(primary.minWidth));
  });
});

describe('обратный отсчёт на кнопке', () => {
  it('без срока полосы нет — будка ничего сама не сделает', () => {
    render(<BigButton label="Печатать" onPress={jest.fn()} testID="печать" />);
    expect(screen.queryByTestId('печать-отсчёт')).toBeNull();
  });

  it('со сроком появляется полоса, и она растёт', () => {
    const {rerender} = render(
      <BigButton label="Печатать" onPress={jest.fn()} progress={0.25} testID="печать" />,
    );
    const at25 = widthOfProgress();
    rerender(
      <BigButton label="Печатать" onPress={jest.fn()} progress={0.75} testID="печать" />,
    );
    expect(widthOfProgress()).not.toBe(at25);
    expect(widthOfProgress()).toBe('75%');
  });

  it('доля за пределами 0…1 не ломает полосу', () => {
    const {rerender} = render(
      <BigButton label="Печатать" onPress={jest.fn()} progress={-3} testID="печать" />,
    );
    expect(widthOfProgress()).toBe('0%');
    rerender(
      <BigButton label="Печатать" onPress={jest.fn()} progress={9} testID="печать" />,
    );
    expect(widthOfProgress()).toBe('100%');
  });

  it('пока кнопка занята, полоса не показывается', () => {
    // Задание уже ушло — обещать отсчёт больше нечего.
    render(
      <BigButton label="Печатать" onPress={jest.fn()} progress={0.5} busy testID="печать" />,
    );
    expect(screen.queryByTestId('печать-отсчёт')).toBeNull();
  });
});

/** Ширина полосы отсчёта на кнопке. */
function widthOfProgress(): unknown {
  return flatten(screen.getByTestId('печать-отсчёт').props.style).width;
}

/** Сводит массив стилей в один объект. */
function flatten(style: unknown): Record<string, number | string> {
  const parts = Array.isArray(style) ? style.flat(Infinity) : [style];
  return Object.assign({}, ...parts.filter(Boolean));
}
