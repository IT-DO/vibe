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

describe('бумага принтера', () => {
  it('карманная бумага 50 × 76 распознаётся', () => {
    // Компактные Xiaomi печатают на 2 × 3 дюйма — 50,8 × 76,2 мм.
    expect(mediaChoiceFor([option('oe_photo-2x3_2x3in', 50.8, 76.2)])).toBe('2x3');
  });

  it('та же бумага, описанная в миллиметрах и округлённая', () => {
    // Прошивки округляют дюймы по-разному: встречается и «50 × 76».
    expect(mediaChoiceFor([option('om_small-photo_50x76mm', 50, 76)])).toBe('2x3');
  });

  it('лист, описанный боком, — тот же лист', () => {
    expect(mediaChoiceFor([option('oe_photo-3x2_3x2in', 76.2, 50.8)])).toBe('2x3');
  });

  it('находится среди прочих носителей', () => {
    const choice = mediaChoiceFor([
      option('iso_a4_210x297mm', 210, 297),
      option('oe_photo-2x3_2x3in', 50.8, 76.2),
    ]);
    expect(choice).toBe('2x3');
  });
});

describe('когда бумаги нет', () => {
  it('чужой принтер не притворяется своим', () => {
    // Напечатать наш лист на 10 × 15 значит получить обрезанный отпечаток.
    expect(mediaChoiceFor([option('na_index-4x6_4x6in', 101.6, 152.4)])).toBeNull();
  });

  it('пустой список — выбор остаётся за оператором', () => {
    expect(mediaChoiceFor([])).toBeNull();
  });

  it('принтер вообще без списка носителей не роняет подбор', () => {
    // Урезанные прошивки не перечисляют носители, а принтер, введённый
    // адресом вручную, до первого опроса о себе ничего не знает.
    expect(mediaChoiceFor(undefined)).toBeNull();
  });

  it('лист, отличающийся сильнее допуска, не считается своим', () => {
    // 60 × 90 — это не 50 × 76: отпечаток выйдет обрезанным.
    expect(mediaChoiceFor([option('custom_60x90mm', 60, 90)])).toBeNull();
  });

  it('носитель без разобранных габаритов пропускается', () => {
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

describe('габариты формата', () => {
  it('совпадают с настоящим размером бумаги ZINK', () => {
    expect(MEDIA_CHOICE_SIZES['2x3']).toEqual({widthMm: 50.8, heightMm: 76.2});
  });

  it('пропорция листа — 2:3', () => {
    const size = MEDIA_CHOICE_SIZES['2x3'];
    expect(size.widthMm / size.heightMm).toBeCloseTo(2 / 3, 3);
  });
});
