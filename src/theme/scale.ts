/**
 * Масштабирование интерфейса под размер экрана.
 *
 * Размеры в `theme.ts` подобраны под планшет на стойке: гость смотрит с
 * полутора метров, тянется к экрану издалека и не целится. Но приложение
 * ставят и на телефон — например, когда под рукой нет планшета, а камера
 * телефона всё равно лучше планшетной. На экране шириной 360 pt кнопка
 * шириной 320 pt занимает его целиком, а заголовок 72 pt обрезается.
 *
 * Масштаб намеренно «наполовину пропорциональный»: при уменьшении экрана
 * вдвое размеры падают не вдвое, а примерно на четверть. Киоску нужны
 * крупные цели нажатия даже на телефоне — человек всё так же тянется к
 * закреплённому устройству, а не держит его в руке.
 */

/** Ширина экрана планшета, под который считался интерфейс, в единицах RN. */
export const REFERENCE_WIDTH = 800;

/** Ниже этого масштаба интерфейс перестал бы быть киоском. */
export const MIN_SCALE = 0.7;

/** Выше — на больших планшетах всё разъезжается без пользы. */
export const MAX_SCALE = 1.15;

/**
 * Коэффициент масштабирования по короткой стороне экрана.
 *
 * @param shortestSide короткая сторона экрана в единицах RN (dp / pt).
 */
export function scaleFactorFor(
  shortestSide: number,
  min = MIN_SCALE,
  max = MAX_SCALE,
): number {
  if (!Number.isFinite(shortestSide) || shortestSide <= 0) {
    return 1;
  }
  const proportional = 0.5 + 0.5 * (shortestSide / REFERENCE_WIDTH);
  return Math.min(Math.max(proportional, min), max);
}

/** Применяет масштаб к одному размеру, округляя до целого. */
export function scaleValue(value: number, factor: number): number {
  return Math.round(value * factor);
}

/**
 * Применяет масштаб ко всем числам набора, сохраняя набор ключей.
 * Значения больше `keepAbove` не трогаются: так `radius.pill` остаётся
 * пилюлей, а не превращается в скруглённый прямоугольник.
 */
export function scaleAll<T extends Record<string, number>>(
  values: T,
  factor: number,
  keepAbove = 500,
): T {
  const out = {} as Record<string, number>;
  for (const [key, value] of Object.entries(values)) {
    out[key] = value >= keepAbove ? value : scaleValue(value, factor);
  }
  return out as T;
}

/** Похож ли экран на телефон — по нему включаются компактные раскладки. */
export function isPhoneSized(shortestSide: number): boolean {
  // 600 dp — граница, по которой Android сам отличает телефон от планшета.
  return shortestSide < 600;
}
