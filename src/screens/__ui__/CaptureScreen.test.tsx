/**
 * Съёмка. Экран лежит поверх живого превью, поэтому главное здесь —
 * не закрывать камеру и правильно считать кадры серии.
 */

import React from 'react';
import {StyleSheet} from 'react-native';
import {fireEvent, render, screen} from '@testing-library/react-native';

import {CaptureScreen, type CapturePhase, type CaptureScreenProps} from '../CaptureScreen';

const baseProps = () => ({
  locale: 'ru' as const,
  accent: '#FF5A5F',
  phase: {kind: 'getReady', totalShots: 1} as CapturePhase,
  onCancel: jest.fn(),
});

const setup = (overrides: Partial<CaptureScreenProps> = {}) => {
  const props = {...baseProps(), ...overrides};
  const view = render(<CaptureScreen {...props} />);
  return {...props, view};
};

describe('съёмка — подготовка', () => {
  it('говорит «приготовьтесь»', () => {
    setup({phase: {kind: 'getReady', totalShots: 1}});
    expect(screen.getByText('Приготовьтесь!')).toBeTruthy();
  });

  it('для одного кадра не обещает серию', () => {
    setup({phase: {kind: 'getReady', totalShots: 1}});
    expect(screen.queryByText(/Снимаем/)).toBeNull();
  });

  it('для серии предупреждает, сколько будет кадров', () => {
    // Человек должен знать заранее: иначе после первой вспышки он уходит,
    // а будка снимает его спину ещё дважды.
    setup({phase: {kind: 'getReady', totalShots: 3}});
    expect(screen.getByText('Снимаем 3 кадра подряд')).toBeTruthy();
  });

  it('счётчик кадров на подготовке не показывается', () => {
    setup({phase: {kind: 'getReady', totalShots: 3}});
    expect(screen.queryByText(/Кадр \d+ из/)).toBeNull();
  });
});

describe('съёмка — отсчёт', () => {
  it('показывает оставшиеся секунды', () => {
    setup({phase: {kind: 'countdown', secondsLeft: 3, shot: 0, totalShots: 1}});
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('нумерует кадры серии с единицы, а не с нуля', () => {
    // Индекс кадра внутренний, с нуля; гостю показываем человеческий счёт.
    setup({phase: {kind: 'countdown', secondsLeft: 2, shot: 0, totalShots: 3}});
    expect(screen.getByText('Кадр 1 из 3')).toBeTruthy();
  });

  it('на последнем кадре серии счёт сходится', () => {
    setup({phase: {kind: 'countdown', secondsLeft: 1, shot: 2, totalShots: 3}});
    expect(screen.getByText('Кадр 3 из 3')).toBeTruthy();
  });

  it('для одиночного кадра счётчик не мешает', () => {
    setup({phase: {kind: 'countdown', secondsLeft: 3, shot: 0, totalShots: 1}});
    expect(screen.queryByText(/Кадр/)).toBeNull();
  });
});

describe('съёмка — между кадрами', () => {
  it('держит внимание', () => {
    setup({phase: {kind: 'between', shot: 1, totalShots: 3}});
    expect(screen.getByText('Улыбайтесь!')).toBeTruthy();
  });
});

describe('съёмка — не закрывает камеру', () => {
  it('фон экрана прозрачный на всех фазах', () => {
    // Регрессия: непрозрачная подложка гасила живое превью ровно в тот
    // момент, когда человек позирует.
    const phases: CapturePhase[] = [
      {kind: 'getReady', totalShots: 1},
      {kind: 'countdown', secondsLeft: 3, shot: 0, totalShots: 1},
      {kind: 'flash', shot: 0, totalShots: 1},
      {kind: 'between', shot: 0, totalShots: 2},
    ];
    for (const phase of phases) {
      const {view} = setup({phase});
      const root = view.UNSAFE_root.findByProps({pointerEvents: 'box-none'});
      const style = StyleSheet.flatten(root.props.style);
      expect(style.backgroundColor).toBeUndefined();
      view.unmount();
    }
  });
});

describe('съёмка — отмена', () => {
  it('доступна на каждой фазе', () => {
    const phases: CapturePhase[] = [
      {kind: 'getReady', totalShots: 2},
      {kind: 'countdown', secondsLeft: 3, shot: 0, totalShots: 2},
      {kind: 'flash', shot: 0, totalShots: 2},
      {kind: 'between', shot: 0, totalShots: 2},
    ];
    for (const phase of phases) {
      const {onCancel, view} = setup({phase});
      fireEvent.press(screen.getByText('Отмена'));
      expect(onCancel).toHaveBeenCalledTimes(1);
      view.unmount();
    }
  });

  it('переводится', () => {
    setup({locale: 'en', phase: {kind: 'getReady', totalShots: 2}});
    expect(screen.getByText('Get ready!')).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();
  });
});
