/**
 * Просмотр перед печатью — экран, на котором гость принимает решение.
 *
 * Проверяем не вёрстку, а обещания экрана: показать именно то, что выйдет из
 * принтера; не дать напечатать один лист дважды; не предлагать «переснять»
 * снимок, который сняли не мы.
 */

import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react-native';

import {ReviewScreen, type ReviewScreenProps} from '../ReviewScreen';

const baseProps = () => ({
  locale: 'ru' as const,
  accent: '#FF5A5F',
  previewUri: 'file:///лист.jpg',
  secondsLeft: 12,
  allowRetake: true,
  fromGallery: false,
  busy: false,
  onPrint: jest.fn(),
  onRetake: jest.fn(),
});

const setup = (overrides: Partial<ReviewScreenProps> = {}) => {
  const props = {...baseProps(), ...overrides};
  render(<ReviewScreen {...props} />);
  return props;
};

describe('просмотр — снимок с камеры', () => {
  it('показывает собранный лист, а не исходный кадр', () => {
    setup({previewUri: 'file:///лист.jpg'});
    // Гость должен видеть тот же лист, что выйдет из принтера: с рамкой,
    // подписью и в выбранной раскладке.
    expect(screen.getByLabelText('Как вам?').props.source).toEqual({
      uri: 'file:///лист.jpg',
    });
  });

  it('переживает отсутствие превью без падения', () => {
    // Сборка листа может не успеть или упасть — экран всё равно должен дать
    // напечатать: файл к этому моменту уже снят.
    const props = setup({previewUri: null});
    expect(screen.queryByLabelText('Как вам?')).toBeNull();
    fireEvent.press(screen.getByText('Печатать'));
    expect(props.onPrint).toHaveBeenCalled();
  });

  it('печатает по кнопке', () => {
    const props = setup();
    fireEvent.press(screen.getByText('Печатать'));
    expect(props.onPrint).toHaveBeenCalledTimes(1);
  });

  it('предлагает переснять', () => {
    const props = setup();
    fireEvent.press(screen.getByText('Переснять'));
    expect(props.onRetake).toHaveBeenCalledTimes(1);
  });

  it('называет срок автопечати', () => {
    setup({secondsLeft: 7});
    expect(screen.getByText('Печать через 7 с')).toBeTruthy();
  });

  it('на нуле секунд не пишет про автопечать', () => {
    setup({secondsLeft: 0});
    expect(screen.queryByText(/Печать через/)).toBeNull();
  });
});

describe('просмотр — во время отправки', () => {
  it('второе нажатие «печатать» не уходит в очередь', () => {
    // Лист, отправленный дважды, — это два отпечатка и минус лента.
    const props = setup({busy: true});
    fireEvent.press(screen.getByLabelText('Печатать'));
    expect(props.onPrint).not.toHaveBeenCalled();
  });

  it('переснять во время отправки нельзя', () => {
    const props = setup({busy: true});
    fireEvent.press(screen.getByLabelText('Переснять'));
    expect(props.onRetake).not.toHaveBeenCalled();
  });
});

describe('просмотр — снимок из галереи', () => {
  it('вместо «переснять» предлагает выбрать другой', () => {
    // Переснять чужой файл невозможно: камера тут ни при чём.
    setup({fromGallery: true});
    expect(screen.getByText('Выбрать другое')).toBeTruthy();
    expect(screen.queryByText('Переснять')).toBeNull();
  });

  it('кнопка ведёт в ту же галерею', () => {
    const props = setup({fromGallery: true});
    fireEvent.press(screen.getByText('Выбрать другое'));
    expect(props.onRetake).toHaveBeenCalled();
  });
});

describe('просмотр — без права на пересъёмку', () => {
  it('оставляет только печать', () => {
    setup({allowRetake: false});
    expect(screen.queryByText('Переснять')).toBeNull();
    expect(screen.getByText('Печатать')).toBeTruthy();
  });
});

describe('просмотр — английский', () => {
  it('переводит и кнопки, и таймер', () => {
    setup({locale: 'en', secondsLeft: 5});
    expect(screen.getByText('Print')).toBeTruthy();
    expect(screen.getByText('Retake')).toBeTruthy();
    expect(screen.getByText('Printing in 5s')).toBeTruthy();
  });
});
