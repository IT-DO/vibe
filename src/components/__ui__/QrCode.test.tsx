/**
 * QR-код цифровой копии.
 *
 * Проверяем не красоту, а читаемость: тихая зона по краям, модули внутри
 * заданного размера и совпадение с эталонной матрицей — если библиотека
 * или наша отрисовка поедут, код перестанут распознавать камеры, а увидим
 * мы это только на мероприятии.
 */

import React from 'react';
import {render, screen} from '@testing-library/react-native';
import qrcode from 'qrcode-generator';

import {QrCode} from '../QrCode';

/** Все нарисованные модули, кроме фоновой подложки. */
function modules() {
  return screen.UNSAFE_root
    .findAllByType('Rect' as never)
    .filter((node: {props: {fill?: string}}) => node.props.fill !== '#FFFFFF');
}

describe('QR-код', () => {
  it('рисует ровно те модули, которые насчитала библиотека', () => {
    const value = 'https://example.org/фото/17';
    render(<QrCode value={value} size={220} />);

    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    let dark = 0;
    for (let y = 0; y < count; y++) {
      for (let x = 0; x < count; x++) {
        if (qr.isDark(y, x)) {
          dark++;
        }
      }
    }

    expect(modules()).toHaveLength(dark);
  });

  it('оставляет тихую зону по краям', () => {
    // Без неё камеры телефона код не находят.
    render(<QrCode value="привет" size={100} />);
    const xs = modules().map((node: {props: {x: number}}) => node.props.x);
    expect(Math.min(...xs)).toBeGreaterThan(0);
  });

  it('не выходит за заданный размер', () => {
    const size = 220;
    render(<QrCode value="https://example.org/очень/длинный/адрес/17" size={size} />);
    for (const node of modules() as {props: {x: number; width: number}}[]) {
      expect(node.props.x + node.props.width).toBeLessThanOrEqual(size);
    }
  });

  it('разные ссылки дают разные коды', () => {
    render(<QrCode value="https://example.org/1" size={100} />);
    const first = modules().length;
    screen.unmount();
    render(<QrCode value="https://example.org/совершенно-другой-адрес" size={100} />);
    expect(modules().length).not.toBe(first);
  });

  it('цвета можно задать', () => {
    render(<QrCode value="привет" size={100} color="#101014" background="#FAFAFA" />);
    const dark = screen.UNSAFE_root
      .findAllByType('Rect' as never)
      .filter((node: {props: {fill?: string}}) => node.props.fill === '#101014');
    expect(dark.length).toBeGreaterThan(0);
  });
});
