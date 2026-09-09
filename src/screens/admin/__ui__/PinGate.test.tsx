/**
 * ПИН на входе в админку.
 *
 * Защита не от взлома, а от любопытства: гость, случайно нащупавший скрытый
 * угол, не должен попасть в настройки принтера. Проверяем ровно это — и то,
 * что оператор, знающий код, входит с первого раза.
 */

import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react-native';

import {PinGate} from '../PinGate';

const setup = (expectedPin = '2468') => {
  const onUnlock = jest.fn();
  const onCancel = jest.fn();
  render(
    <PinGate
      expectedPin={expectedPin}
      onUnlock={onUnlock}
      onCancel={onCancel}
      title="ПИН-код"
      wrongPinLabel="Неверный ПИН"
    />,
  );
  return {onUnlock, onCancel};
};

/** Набирает код по цифрам. */
function type(digits: string) {
  for (const digit of digits) {
    fireEvent.press(screen.getByLabelText(digit));
  }
}

describe('ПИН-код', () => {
  it('верный код открывает настройки', () => {
    const {onUnlock} = setup('2468');
    type('2468');
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it('неверный не открывает и говорит об этом', () => {
    const {onUnlock} = setup('2468');
    type('1111');
    expect(onUnlock).not.toHaveBeenCalled();
    expect(screen.getByText('Неверный ПИН')).toBeTruthy();
  });

  it('после ошибки набор начинается заново', () => {
    // Иначе следующая цифра дописалась бы к неверному коду и оператор
    // не смог бы войти, даже набирая правильный.
    const {onUnlock} = setup('2468');
    type('1111');
    type('2468');
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it('лишняя цифра не подтверждает код повторно', () => {
    // Набранное стирается после каждой полной попытки. Иначе полный код
    // оставался бы в состоянии и любое следующее касание открывало бы
    // настройки заново — в том числе после того, как их снова закрыли.
    const {onUnlock} = setup('2468');
    type('24689');
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it('стирание возвращает предыдущую цифру', () => {
    const {onUnlock} = setup('2468');
    type('249');
    fireEvent.press(screen.getByLabelText('⌫'));
    type('68');
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it('крестик закрывает вход, ничего не открыв', () => {
    const {onCancel, onUnlock} = setup();
    fireEvent.press(screen.getByLabelText('✕'));
    expect(onCancel).toHaveBeenCalled();
    expect(onUnlock).not.toHaveBeenCalled();
  });

  it('точек ровно столько, сколько цифр в коде', () => {
    setup('123456');
    // Оператор видит длину кода до набора — иначе непонятно, когда он
    // закончится.
    expect(screen.getByText('ПИН-код')).toBeTruthy();
    const dots = screen.UNSAFE_root
      .findAllByType('View' as never)
      .filter((node: {props: {style?: unknown}}) => {
        const style = JSON.stringify(node.props.style ?? '');
        return style.includes('"borderRadius":10') && style.includes('"width":20');
      });
    expect(dots).toHaveLength(6);
  });

  it('сообщение об ошибке не прыгает по вёрстке', () => {
    // Место под него зарезервировано всегда: иначе клавиатура дёргается
    // вверх-вниз при каждой ошибке.
    const {onUnlock} = setup('2468');
    const before = JSON.stringify(screen.toJSON()).length;
    type('1111');
    void onUnlock;
    const after = JSON.stringify(screen.toJSON()).length;
    expect(Math.abs(after - before)).toBeLessThan(400);
  });
});
