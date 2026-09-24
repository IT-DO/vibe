/**
 * Мелкие элементы админки.
 *
 * Единственное место здесь с настоящей логикой — набор форматов: выключить
 * последний нельзя, иначе гостю нечего выбирать и сценарий обрывается на
 * первом же шаге.
 */

import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react-native';

import {Choice, Field, MultiChoice, Row, Toggle} from '../controls';

describe('строка со значением', () => {
  it('показывает подпись и значение', () => {
    render(<Row label="Сеть" value="Event-WiFi" />);
    expect(screen.getByText('Сеть')).toBeTruthy();
    expect(screen.getByText('Event-WiFi')).toBeTruthy();
  });

  it('без значения ничего лишнего не рисует', () => {
    render(<Row label="Адрес" />);
    expect(screen.getByText('Адрес')).toBeTruthy();
  });
});

describe('переключатель', () => {
  it('передаёт новое значение', () => {
    const onChange = jest.fn();
    render(<Toggle label="Зеркалить превью" value={false} onChange={onChange} />);
    fireEvent(screen.getByLabelText('Зеркалить превью'), 'valueChange', true);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('поле ввода', () => {
  it('доступно по подписи и отдаёт введённое', () => {
    const onChange = jest.fn();
    render(<Field label="Название" value="" onChange={onChange} />);
    fireEvent.changeText(screen.getByLabelText('Название'), 'Юбилей');
    expect(onChange).toHaveBeenCalledWith('Юбилей');
  });

  it('подсказка показывается, пока пусто', () => {
    render(
      <Field label="Адрес для QR" value="" onChange={jest.fn()} placeholder="https://..." />,
    );
    expect(screen.getByPlaceholderText('https://...')).toBeTruthy();
  });
});

describe('выбор одного из нескольких', () => {
  const options = [
    {value: 'ipp' as const, label: 'Прямой IPP'},
    {value: 'mock' as const, label: 'Демо'},
  ];

  it('отмечает текущий вариант', () => {
    render(
      <Choice label="Канал" value="ipp" options={options} onChange={jest.fn()} />,
    );
    expect(
      screen.getByRole('button', {name: 'Прямой IPP'}).props.accessibilityState,
    ).toMatchObject({selected: true});
    expect(
      screen.getByRole('button', {name: 'Демо'}).props.accessibilityState,
    ).toMatchObject({selected: false});
  });

  it('нажатие возвращает выбранное значение', () => {
    const onChange = jest.fn();
    render(<Choice label="Канал" value="ipp" options={options} onChange={onChange} />);
    fireEvent.press(screen.getByText('Демо'));
    expect(onChange).toHaveBeenCalledWith('mock');
  });
});

describe('набор форматов', () => {
  const options = [
    {value: 'single' as const, label: 'Одно фото'},
    {value: 'grid4' as const, label: 'Четыре кадра'},
    {value: 'polaroid' as const, label: 'Полароид'},
  ];

  it('добавляет невыбранный', () => {
    const onChange = jest.fn();
    render(
      <MultiChoice label="Форматы" values={['single']} options={options} onChange={onChange} />,
    );
    fireEvent.press(screen.getByText('Полароид'));
    expect(onChange).toHaveBeenCalledWith(['single', 'polaroid']);
  });

  it('убирает выбранный, если остаётся хотя бы один', () => {
    const onChange = jest.fn();
    render(
      <MultiChoice
        label="Форматы"
        values={['single', 'grid4']}
        options={options}
        onChange={onChange}
      />,
    );
    fireEvent.press(screen.getByText('Одно фото'));
    expect(onChange).toHaveBeenCalledWith(['grid4']);
  });

  it('последний формат выключить нельзя', () => {
    // Иначе гость нажимает «сфотографироваться» и упирается в пустой
    // экран выбора — сценарий обрывается на первом шаге.
    const onChange = jest.fn();
    render(
      <MultiChoice label="Форматы" values={['single']} options={options} onChange={onChange} />,
    );
    fireEvent.press(screen.getByText('Одно фото'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('отмечает включённые', () => {
    render(
      <MultiChoice
        label="Форматы"
        values={['grid4']}
        options={options}
        onChange={jest.fn()}
      />,
    );
    expect(
      screen.getByRole('checkbox', {name: 'Четыре кадра'}).props.accessibilityState,
    ).toMatchObject({checked: true});
    expect(
      screen.getByRole('checkbox', {name: 'Полароид'}).props.accessibilityState,
    ).toMatchObject({checked: false});
  });
});
