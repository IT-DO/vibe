/**
 * Оформление киоска.
 *
 * Планшет стоит на стойке, гость смотрит на него с расстояния метра-полутора,
 * часто в полутёмном зале и почти всегда — с бокалом в одной руке. Отсюда все
 * решения ниже:
 *
 *  - тёмный фон: живое превью с камеры на нём читается лучше, а сам планшет
 *    не слепит соседей;
 *  - крупные кегли: минимальный текст на экране гостя — 22 pt, кнопки — 32 pt;
 *  - огромные цели нажатия: 96 pt против системных 44 — в человека, который
 *    тянется к экрану издалека и не целится, попасть иначе невозможно;
 *  - один акцентный цвет, который меняется под мероприятие.
 */

import {Dimensions, PixelRatio} from 'react-native';

import {fontFamily} from './fonts';
import {fontScaleAdjustment, isPhoneSized, scaleAll, scaleFactorFor} from './scale';

/**
 * Размеры экрана. Ориентация зафиксирована портретной (`screenOrientation`
 * в манифесте), поэтому измерить достаточно один раз при запуске: пока
 * приложение живёт, поменяться они не могут.
 */
const {width, height} = Dimensions.get('window');
const shortestSide = Math.min(width, height);

/**
 * Во сколько раз интерфейс отличается от эталонного планшета.
 *
 * Считается по обеим сторонам: экран, широкий но низкий, ограничен высотой,
 * и масштаб по одной ширине обрезал бы низ — а внизу заставки лежит кнопка
 * «Выбрать готовое фото».
 */
export const screenScale = scaleFactorFor({width, height});

/**
 * Отдельный масштаб для текста: к размеру экрана добавляется приглушённая
 * системная настройка размера шрифта. Человек, увеличивший шрифт в системе,
 * сделал это не из прихоти, но подчиняться ей целиком киоск не может —
 * призыв на заставке перестанет помещаться в строку у всех гостей ради
 * настройки одного владельца устройства.
 */
export const textScale = screenScale * fontScaleAdjustment(PixelRatio.getFontScale());

/** Приложение запущено на телефоне — раскладки становятся компактнее. */
export const isCompact = isPhoneSized(shortestSide);

export interface Palette {
  readonly background: string;
  readonly surface: string;
  readonly surfaceRaised: string;
  readonly accent: string;
  readonly accentText: string;
  readonly text: string;
  readonly textMuted: string;
  readonly danger: string;
  readonly success: string;
  readonly warning: string;
  readonly overlay: string;
}

export const palette: Palette = {
  background: '#0B0B10',
  surface: '#16161F',
  surfaceRaised: '#22222E',
  // Тёплый коралловый: живой, праздничный, не сливается ни с кожей, ни с
  // типичным интерьером зала.
  accent: '#FF5A5F',
  accentText: '#FFFFFF',
  text: '#FFFFFF',
  textMuted: '#A0A0B0',
  danger: '#FF4D4F',
  success: '#4ADE80',
  warning: '#FBBF24',
  overlay: 'rgba(11, 11, 16, 0.82)',
};

/**
 * Базовые размеры шрифтов под планшет. Наружу отдаются уже масштабированные:
 * на телефоне те же значения, умноженные на `screenScale`.
 */
const BASE_TYPOGRAPHY = {
  /** Обратный отсчёт — во весь экран. */
  countdown: 280,
  display: 72,
  title: 44,
  heading: 32,
  button: 32,
  body: 24,
  caption: 18,
  /** Мелкий кегль допустим только в админке. */
  admin: 15,
} as const;

/** Размеры шрифтов для текущего экрана. */
export const typography = scaleAll(BASE_TYPOGRAPHY, textScale);

const BASE_SPACING = {
  xs: 6,
  sm: 12,
  md: 20,
  lg: 32,
  xl: 48,
  xxl: 72,
} as const;

/** Отступы для текущего экрана. */
export const spacing = scaleAll(BASE_SPACING, screenScale);

export const radius = {
  sm: 12,
  md: 20,
  lg: 32,
  pill: 999,
} as const;

/**
 * Минимальные размеры целей нажатия. Системные рекомендации (44 pt) рассчитаны
 * на телефон в руке; здесь человек тянется к закреплённому экрану издалека,
 * поэтому даже после масштабирования цели остаются заметно крупнее.
 */
const BASE_TOUCH = {
  minSize: 96,
  primaryHeight: 120,
  primaryMinWidth: 320,
} as const;

/** Размеры целей нажатия для текущего экрана. */
export const touch = scaleAll(BASE_TOUCH, screenScale);

/**
 * Начертания. Заголовки и праздничные фразы набираются антиквой и
 * рукописным шрифтом (см. `theme/fonts.ts`), служебный текст — системным
 * гротеском: его читают быстро и вблизи, а декоративная антиква замедляет
 * чтение.
 */
export const fonts = {
  display: {fontFamily: fontFamily.display},
  displayRegular: {fontFamily: fontFamily.displayRegular},
  script: {fontFamily: fontFamily.script},
  system: {fontFamily: fontFamily.system},
} as const;

export const timing = {
  fast: 150,
  normal: 300,
  slow: 600,
  /** Вспышка затвора. */
  shutterFlash: 220,
} as const;

/** Тень для приподнятых поверхностей. */
export const elevation = {
  shadowColor: '#000000',
  shadowOpacity: 0.4,
  shadowRadius: 24,
  shadowOffset: {width: 0, height: 8},
  elevation: 12,
} as const;

export interface EventTheme {
  /** Акцентный цвет мероприятия. */
  readonly accent: string;
  /** Название на заставке и на отпечатке. */
  readonly title: string;
  readonly subtitle: string;
  /** Путь к логотипу; пусто — логотипа нет. */
  readonly logoPath: string;
}

export const DEFAULT_EVENT_THEME: EventTheme = {
  accent: palette.accent,
  title: 'Фото на память',
  subtitle: '',
  logoPath: '',
};
