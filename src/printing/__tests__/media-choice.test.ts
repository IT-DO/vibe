/**
 * Подбор формата бумаги под найденный принтер.
 *
 * Ошибка здесь стоит дорого и заметна только на бумаге: лист, собранный
 * под 10 × 15, на карманной бумаге 50 × 76 выйдет обрезанным, а картридж
 * потрачен. Поэтому формат берётся из ответа самого принтера, а не из
 * названия модели.
 */

import {MEDIA_CHOICE_SIZES, mediaChoiceFor} from '../media-choice';
import type {MediaOption} from '../ipp/capabilities';

const option = (name: string, widthMm: number, heightMm: number): MediaOption => ({
  name,
  widthMm,
  heightMm,
});

describe('формат по ответу принтера', () => {
  it('карманная бумага 50 × 76 распознаётся', () => {
    // Компактные Xiaomi печатают на 2 × 3 дюйма — 50,8 × 76,2 мм.
    expect(mediaChoiceFor([option('oe_photo-2x3_2x3in', 50.8, 76.2)])).toBe('2x3');
  });

  it('та же бумага, описанная в миллиметрах и округлённая', () => {
    // Прошивки округляют дюймы по-разному: встречается и «50 × 76».
    expect(mediaChoiceFor([option('om_small-photo_50x76mm', 50, 76)])).toBe('2x3');
  });

  it('лист 10 × 15 распознаётся', () => {
    expect(mediaChoiceFor([option('na_index-4x6_4x6in', 101.6, 152.4)])).toBe('4x6');
  });

  it('квадрат 3 × 3 распознаётся', () => {
    expect(mediaChoiceFor([option('om_photo-3x3_76.2x76.2mm', 76.2, 76.2)])).toBe('3x3');
  });

  it('лист, описанный боком, — тот же лист', () => {
    expect(mediaChoiceFor([option('na_index-4x6_6x4in', 152.4, 101.6)])).toBe('4x6');
  });
});

describe('когда форматов несколько', () => {
  it('выбирается больший — гостю приятнее крупный отпечаток', () => {
    const choice = mediaChoiceFor([
      option('oe_photo-2x3_2x3in', 50.8, 76.2),
      option('na_index-4x6_4x6in', 101.6, 152.4),
    ]);
    expect(choice).toBe('4x6');
  });

  it('порядок в ответе принтера ничего не меняет', () => {
    const large = option('na_index-4x6_4x6in', 101.6, 152.4);
    const small = option('oe_photo-2x3_2x3in', 50.8, 76.2);
    expect(mediaChoiceFor([large, small])).toBe(mediaChoiceFor([small, large]));
  });

  it('точное совпадение важнее размера', () => {
    // Приблизительный большой лист хуже точно совпавшего маленького.
    const choice = mediaChoiceFor([
      option('oe_photo-2x3_2x3in', 50.8, 76.2),
      option('custom_odd_105x160mm', 105, 160),
    ]);
    expect(choice).toBe('2x3');
  });
});

describe('когда подобрать нечего', () => {
  it('пустой список — выбор остаётся за оператором', () => {
    // Подменять его догадкой нельзя: напечатать 10 × 15 на карманной
    // бумаге значит испортить лист и потратить картридж.
    expect(mediaChoiceFor([])).toBeNull();
  });

  it('незнакомый формат не притягивается к ближайшему', () => {
    expect(mediaChoiceFor([option('iso_a4_210x297mm', 210, 297)])).toBeNull();
  });

  it('лист, отличающийся сильнее допуска, не считается своим', () => {
    // 60 × 90 — это не 50 × 76: отпечаток выйдет обрезанным.
    expect(mediaChoiceFor([option('custom_60x90mm', 60, 90)])).toBeNull();
  });

  it('принтер вообще без списка носителей не роняет подбор', () => {
    // Урезанные прошивки не перечисляют носители, а принтер, введённый
    // адресом вручную, до первого опроса о себе ничего не знает. Исключение
    // здесь оставило бы оператора с кнопкой, которая молча не работает.
    expect(mediaChoiceFor(undefined)).toBeNull();
  });

  it('носитель без разобранных габаритов пропускается', () => {
    // Кастомные имена вендоров не разбираются, и размеры выходят нулями.
    const choice = mediaChoiceFor([
      option('vendor-custom-media', 0, 0),
      option('oe_photo-2x3_2x3in', 50.8, 76.2),
    ]);
    expect(choice).toBe('2x3');
  });

  it('мусор в габаритах не притворяется форматом', () => {
    expect(mediaChoiceFor([option('broken', Number.NaN, 76.2)])).toBeNull();
  });
});

describe('габариты форматов', () => {
  it('совпадают с настоящими размерами бумаги', () => {
    expect(MEDIA_CHOICE_SIZES['2x3']).toEqual({widthMm: 50.8, heightMm: 76.2});
    expect(MEDIA_CHOICE_SIZES['4x6']).toEqual({widthMm: 101.6, heightMm: 152.4});
    expect(MEDIA_CHOICE_SIZES['3x3']).toEqual({widthMm: 76.2, heightMm: 76.2});
  });

  it('у карманного формата та же пропорция, что у 10 × 15', () => {
    // Значит все раскладки переносятся без изменений — кадры просто мельче.
    const small = MEDIA_CHOICE_SIZES['2x3'];
    const large = MEDIA_CHOICE_SIZES['4x6'];
    expect(small.widthMm / small.heightMm).toBeCloseTo(large.widthMm / large.heightMm, 3);
  });
});
