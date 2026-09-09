/**
 * Выбор формата — единственный экран, где гость что-то решает.
 * Проверяем, что показаны ровно разрешённые форматы и что нажатие
 * возвращает именно тот, по которому нажали.
 */

import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react-native';

import {LayoutScreen, type LayoutScreenProps} from '../LayoutScreen';
import {LAYOUTS, type LayoutId} from '../../imaging/layouts';

/** Все форматы, какие вообще есть в приложении. */
const EVERY_LAYOUT: readonly LayoutId[] = LAYOUTS.map(l => l.id);

const baseProps = () => ({
  locale: 'ru' as const,
  accent: '#FF5A5F',
  layouts: ['single', 'twinStrip3', 'grid4'] as readonly LayoutId[],
  secondsLeft: 20,
  onChoose: jest.fn(),
  onCancel: jest.fn(),
});

const setup = (overrides: Partial<LayoutScreenProps> = {}) => {
  const props = {...baseProps(), ...overrides};
  render(<LayoutScreen {...props} />);
  return props;
};

describe('выбор формата', () => {
  it('показывает только разрешённые форматы', () => {
    // Оператор отключает форматы в настройках; отключённый не должен
    // просачиваться на экран гостя.
    setup({layouts: ['single', 'polaroid']});
    expect(screen.getByText('Одно фото')).toBeTruthy();
    expect(screen.getByText('Полароид')).toBeTruthy();
    expect(screen.queryByText('Четыре кадра')).toBeNull();
  });

  it('возвращает выбранный формат, а не первый попавшийся', () => {
    const props = setup({layouts: ['single', 'twinStrip3', 'grid4']});
    fireEvent.press(screen.getByLabelText('Четыре кадра'));
    expect(props.onChoose).toHaveBeenCalledWith('grid4');
  });

  it('каждый формат честно называет число кадров', () => {
    setup({layouts: EVERY_LAYOUT});
    for (const layout of LAYOUTS) {
      const n = layout.shots;
      const expected = n === 1 ? '1 кадр' : n < 5 ? `${n} кадра` : `${n} кадров`;
      expect(screen.getAllByText(expected).length).toBeGreaterThan(0);
    }
  });

  it('о полоске на двоих предупреждает заранее', () => {
    // Иначе человек ждёт один отпечаток, а получает лист с двумя полосками
    // и не понимает, что его можно разорвать.
    setup({layouts: ['twinStrip3']});
    expect(screen.getByText(/разорвите и поделитесь/)).toBeTruthy();
  });

  it('подсказка про разрыв не появляется у других форматов', () => {
    setup({layouts: ['single', 'grid4']});
    expect(screen.queryByText(/разорвите/)).toBeNull();
  });

  it('нажимается каждый формат, а не только первый', () => {
    const onChoose = jest.fn();
    setup({layouts: EVERY_LAYOUT, onChoose});
    for (const id of EVERY_LAYOUT) {
      onChoose.mockClear();
      fireEvent.press(screen.getByLabelText(labelOf(id)));
      expect(onChoose).toHaveBeenCalledWith(id);
    }
  });

  it('отмена возвращает на заставку', () => {
    const props = setup();
    fireEvent.press(screen.getByText('Отмена'));
    expect(props.onCancel).toHaveBeenCalled();
  });

  it('показывает отсчёт до автовыбора', () => {
    setup({secondsLeft: 9});
    expect(screen.getByText('9')).toBeTruthy();
  });

  it('на нуле секунд цифру не рисует', () => {
    setup({secondsLeft: 0});
    expect(screen.queryByText('0')).toBeNull();
  });

  it('переводится целиком', () => {
    setup({locale: 'en', layouts: ['single', 'twinStrip3']});
    expect(screen.getByText('Choose a format')).toBeTruthy();
    expect(screen.getByText('Single photo')).toBeTruthy();
    expect(screen.getByText('Strip for two')).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();
  });
});

/** Русское название формата — как его видит гость. */
function labelOf(id: LayoutId): string {
  const names: Record<LayoutId, string> = {
    single: 'Одно фото',
    twinStrip3: 'Полоска на двоих',
    grid4: 'Четыре кадра',
    polaroid: 'Полароид',
    duo: 'Два кадра',
  };
  return names[id];
}
