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

/** Короткая сторона экрана планшета, под который считался интерфейс. */
export const REFERENCE_WIDTH = 800;

/**
 * Длинная сторона того же эталона (планшет 4:3 в портретной ориентации).
 * Нужна отдельно: на вытянутом телефоне 20:9 короткая сторона говорит, что
 * места хватает, а по высоте заголовок и отсчёт уже не помещаются.
 */
export const REFERENCE_HEIGHT = 1067;

/** Ниже этого масштаба интерфейс перестал бы быть киоском. */
export const MIN_SCALE = 0.7;

/** Выше — на больших планшетах всё разъезжается без пользы. */
export const MAX_SCALE = 1.15;

/**
 * Насколько системная настройка размера шрифта влияет на киоск.
 *
 * Полностью игнорировать её нельзя: человек, увеличивший шрифт в системе,
 * сделал это не из прихоти. Но и подчиняться целиком тоже — при системном
 * масштабе 1.3 заголовок «Нажмите, чтобы сфотографироваться» перестаёт
 * помещаться в строку, и киоск ломается у всех гостей ради настройки
 * одного владельца устройства. Берём треть отклонения.
 */
export const FONT_SCALE_WEIGHT = 1 / 3;

/** Границы, за которые системная настройка шрифта увести не может. */
export const MIN_FONT_SCALE = 0.9;
export const MAX_FONT_SCALE = 1.15;

export interface ScreenSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Коэффициент масштабирования по размеру экрана.
 *
 * Берётся меньший из двух коэффициентов — по ширине и по высоте. Интерфейс
 * киоска вертикальный: заголовок, призыв, кнопка и индикатор идут сверху
 * вниз и должны поместиться целиком, без прокрутки. Экран, широкий но
 * низкий (телефон в разделённом режиме, планшет с открытой клавиатурой),
 * ограничен именно высотой, и масштаб по одной ширине обрезал бы низ.
 *
 * Масштаб намеренно «наполовину пропорциональный»: при уменьшении экрана
 * вдвое размеры падают не вдвое, а примерно на четверть. Киоску нужны
 * крупные цели нажатия даже на телефоне — человек всё так же тянется к
 * закреплённому устройству, а не держит его в руке.
 */
export function scaleFactorFor(
  screen: ScreenSize | number,
  min = MIN_SCALE,
  max = MAX_SCALE,
): number {
  // Число вместо размеров — это короткая сторона: так вызывали раньше, и
  // для квадратного планшета ответ тот же.
  const size: ScreenSize =
    typeof screen === 'number'
      ? {width: screen, height: screen * (REFERENCE_HEIGHT / REFERENCE_WIDTH)}
      : screen;

  const shortest = Math.min(size.width, size.height);
  const longest = Math.max(size.width, size.height);
  if (!isUsable(shortest) || !isUsable(longest)) {
    return 1;
  }

  const byWidth = halfProportional(shortest / REFERENCE_WIDTH);
  const byHeight = halfProportional(longest / REFERENCE_HEIGHT);
  return clamp(Math.min(byWidth, byHeight), min, max);
}

/**
 * Поправка на системный размер шрифта.
 *
 * @param fontScale значение `PixelRatio.getFontScale()`.
 */
export function fontScaleAdjustment(
  fontScale: number,
  weight = FONT_SCALE_WEIGHT,
): number {
  if (!isUsable(fontScale)) {
    return 1;
  }
  const damped = 1 + (fontScale - 1) * weight;
  return clamp(damped, MIN_FONT_SCALE, MAX_FONT_SCALE);
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

/** Половинчатая пропорция: экран вдвое меньше — размеры меньше на четверть. */
function halfProportional(ratio: number): number {
  return 0.5 + 0.5 * ratio;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function isUsable(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}
