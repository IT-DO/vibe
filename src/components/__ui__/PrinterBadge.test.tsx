/**
 * Индикатор принтера. Он адресован оператору с другого конца зала:
 * молчит, когда всё хорошо, и говорит понятным текстом, когда нет.
 */

import React from 'react';
import {render, screen} from '@testing-library/react-native';

import {PrinterBadge} from '../PrinterBadge';
import type {PrinterHealth} from '../../printing/ipp/capabilities';

const setup = (props: {
  health: PrinterHealth;
  reason?: string;
  queueLength?: number;
  locale?: 'ru' | 'en';
}) =>
  render(
    <PrinterBadge
      health={props.health}
      {...(props.reason ? {reason: props.reason} : {})}
      queueLength={props.queueLength ?? 0}
      locale={props.locale ?? 'ru'}
    />,
  );

describe('индикатор принтера', () => {
  it('молчит, когда всё в порядке и очередь пуста', () => {
    // Постоянно висящий значок гость перестаёт замечать — и не замечает,
    // когда он становится красным.
    const {toJSON} = setup({health: 'ready', queueLength: 0});
    expect(toJSON()).toBeNull();
  });

  it('показывает длину очереди, когда печать идёт', () => {
    setup({health: 'ready', queueLength: 4});
    expect(screen.getByText('4')).toBeTruthy();
  });

  it('переводит код принтера на человеческий', () => {
    setup({health: 'blocked', reason: 'media-empty'});
    expect(screen.getByText('Закончилась бумага')).toBeTruthy();
  });

  it('срезает суффикс уровня в коде состояния', () => {
    // IPP присылает `media-empty-error`; таблица знает только основу.
    setup({health: 'blocked', reason: 'media-empty-error'});
    expect(screen.getByText('Закончилась бумага')).toBeTruthy();
  });

  it('незнакомый код не показывает как есть', () => {
    setup({health: 'blocked', reason: 'wsd-scan-subsystem-failure'});
    expect(screen.getByText('Принтер не отвечает')).toBeTruthy();
  });

  it('предупреждение показывает даже при пустой очереди', () => {
    setup({health: 'warning', reason: 'media-low', queueLength: 0});
    expect(screen.getByText('Бумага заканчивается')).toBeTruthy();
  });

  it('молчащий принтер тоже виден оператору', () => {
    setup({health: 'unknown', queueLength: 0});
    expect(screen.getByText('Принтер не отвечает')).toBeTruthy();
  });

  it('занятость сама по себе не тревога', () => {
    const {toJSON} = setup({health: 'busy', queueLength: 0});
    expect(toJSON()).toBeNull();
  });

  it('переводится', () => {
    setup({health: 'blocked', reason: 'media-empty', locale: 'en'});
    expect(screen.getByText('Out of paper')).toBeTruthy();
  });
});
