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
export type MediaChoiceName = '4x6' | '3x3' | '2x3';

/** Габариты каждого формата в миллиметрах. */
export const MEDIA_CHOICE_SIZES: Record<
  MediaChoiceName,
  {widthMm: number; heightMm: number}
> = {
  '4x6': {widthMm: 101.6, heightMm: 152.4},
  '3x3': {widthMm: 76.2, heightMm: 76.2},
  '2x3': {widthMm: 50.8, heightMm: 76.2},
};

/**
 * Насколько заявленный принтером носитель может отличаться от нашего
 * формата, чтобы считаться тем же. Допуск щедрый: прошивки округляют
 * дюймы в миллиметры по-разному, а 2 × 3 дюйма — это и 50,8, и «50».
 */
const TOLERANCE_MM = 4;

/**
 * Подбирает формат настроек под то, что умеет принтер.
 *
 * Возвращает `null`, если принтер не заявил ни одного знакомого носителя, —
 * тогда выбор остаётся за оператором, и подменять его догадкой нельзя:
 * напечатать 10 × 15 на карманной бумаге значит испортить лист.
 */
export function mediaChoiceFor(
  supported: readonly MediaOption[] | undefined,
): MediaChoiceName | null {
  // Урезанные прошивки не перечисляют носители вовсе, а принтер, введённый
  // адресом вручную, до первого опроса не знает о себе ничего. Уронить на
  // этом выбор принтера значит оставить оператора с кнопкой, которая
  // молча ничего не делает.
  if (!Array.isArray(supported)) {
    return null;
  }

  let best: {choice: MediaChoiceName; delta: number} | null = null;

  for (const option of supported) {
    if (!isMeasured(option)) {
      continue;
    }
    for (const [name, size] of Object.entries(MEDIA_CHOICE_SIZES)) {
      const delta = distance(option, size);
      if (delta > TOLERANCE_MM * 2) {
        continue;
      }
      // При равном совпадении побеждает больший лист: если принтер
      // заявляет и 10 × 15, и карманный формат, гостю приятнее большой.
      if (!best || delta < best.delta || (delta === best.delta && isLarger(name, best.choice))) {
        best = {choice: name as MediaChoiceName, delta};
      }
    }
  }

  return best?.choice ?? null;
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

/** Площадь листа — по ней сравниваем, какой формат крупнее. */
function area(choice: MediaChoiceName): number {
  const size = MEDIA_CHOICE_SIZES[choice];
  return size.widthMm * size.heightMm;
}

function isLarger(candidate: string, current: MediaChoiceName): boolean {
  return area(candidate as MediaChoiceName) > area(current);
}
