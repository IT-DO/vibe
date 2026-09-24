/**
 * Какой формат бумаги выбрать под найденный принтер.
 *
 * Догадываться о формате по названию модели бесполезно: у одного и того же
 * «1S» встречаются и картриджи 10 × 15 см, и карманная бумага 50 × 76 мм, а
 * между мероприятиями картридж меняют. Зато принтер сам перечисляет
 * носители в ответе на Get-Printer-Attributes — этому источнику и верим.
 *
 * Модуль чистый: он получает уже разобранный список носителей и возвращает
 * пункт настроек, поэтому проверяется без сети и без принтера.
 */

import type {MediaOption} from './ipp/capabilities';

/** Формат отпечатка так, как он называется в настройках. */
export type MediaChoiceName = '2x3';

/** Габариты каждого формата в миллиметрах. */
export const MEDIA_CHOICE_SIZES: Record<
  MediaChoiceName,
  {widthMm: number; heightMm: number}
> = {
  '2x3': {widthMm: 50.8, heightMm: 76.2},
};

/**
 * Насколько заявленный принтером носитель может отличаться от нашего
 * формата, чтобы считаться тем же. Допуск щедрый: прошивки округляют
 * дюймы в миллиметры по-разному, а 2 × 3 дюйма — это и 50,8, и «50».
 */
const TOLERANCE_MM = 4;

/**
 * Подтверждает, что принтер печатает на нашей бумаге.
 *
 * Возвращает `'2x3'`, если среди заявленных носителей есть карманный
 * формат, и `null`, если его нет: тогда это чужой принтер, и печатать на
 * нём наш лист нельзя — выйдет обрезанным, а бумага потрачена.
 */
export function mediaChoiceFor(
  supported: readonly MediaOption[] | undefined,
): MediaChoiceName | null {
  // Урезанные прошивки не перечисляют носители вовсе, а принтер, введённый
  // адресом вручную, до первого опроса не знает о себе ничего.
  if (!Array.isArray(supported)) {
    return null;
  }

  const target = MEDIA_CHOICE_SIZES['2x3'];
  for (const option of supported) {
    if (isMeasured(option) && distance(option, target) <= TOLERANCE_MM * 2) {
      return '2x3';
    }
  }
  return null;
}

/** Есть ли у носителя разобранные габариты — имя без размеров бесполезно. */
function isMeasured(option: MediaOption | undefined): option is MediaOption {
  return (
    !!option &&
    Number.isFinite(option.widthMm) &&
    Number.isFinite(option.heightMm) &&
    option.widthMm > 0 &&
    option.heightMm > 0
  );
}

/** Отклонение габаритов с учётом того, что лист могут описать боком. */
function distance(
  option: {widthMm: number; heightMm: number},
  target: {widthMm: number; heightMm: number},
): number {
  const direct =
    Math.abs(option.widthMm - target.widthMm) + Math.abs(option.heightMm - target.heightMm);
  const rotated =
    Math.abs(option.heightMm - target.widthMm) + Math.abs(option.widthMm - target.heightMm);
  return Math.min(direct, rotated);
}
