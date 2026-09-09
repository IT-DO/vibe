/**
 * Настройки киоска.
 *
 * Всё, что оператор меняет на площадке, живёт здесь и переживает перезапуск.
 * Значения по умолчанию подобраны так, чтобы приложение работало сразу после
 * установки: нашёл принтер — и можно начинать, без похода в настройки.
 */

import {MMKV} from 'react-native-mmkv';
import {create} from 'zustand';
import {createJSONStorage, persist} from 'zustand/middleware';

import {withDefaults} from './merge';

import type {LayoutId} from '../imaging/layouts';
import type {Locale} from '../i18n/strings';
import type {IppEndpoint} from '../printing/ipp/client';
import {DEFAULT_EVENT_THEME, type EventTheme} from '../theme/theme';

const storage = new MMKV({id: 'photo-na-pamyat'});

/**
 * Формат отпечатка.
 *
 * `2x3` — карманная бумага 50 × 76 мм компактных Xiaomi; `4x6` — привычные
 * 10 × 15 см; `3x3` — квадрат. Точный размер принтер сообщает сам при
 * подключении, и админка подставляет подходящий вариант, но оставить
 * выбор человеку всё равно нужно: картридж меняют между мероприятиями.
 */
export type MediaChoice = '4x6' | '3x3' | '2x3';

/** Какой канал печати использовать. */
export type TransportChoice = 'ipp' | 'system' | 'mock';

export interface PrinterSettings {
  readonly transport: TransportChoice;
  /** Адрес принтера, найденный при подключении. */
  readonly endpoint: IppEndpoint | null;
  readonly displayName: string;
  readonly media: MediaChoice;
  /** Число копий каждого отпечатка. */
  readonly copies: number;
}

export interface CaptureSettings {
  /** Какая камера снимает: фронтальная удобна как зеркало. */
  readonly camera: 'front' | 'back';
  readonly countdownSeconds: number;
  /** Печатать зеркально — так же, как гость видел себя на экране. */
  readonly mirrorPrint: boolean;
  /** Показывать превью зеркально (почти всегда — да). */
  readonly mirrorPreview: boolean;
}

export interface FlowSettings {
  readonly layouts: readonly LayoutId[];
  readonly reviewTimeoutMs: number;
  readonly autoPrintOnTimeout: boolean;
  readonly allowRetake: boolean;
  readonly thanksMs: number;
}

export interface PrivacySettings {
  /** Хранить копии отпечатков (для отправки гостям после мероприятия). */
  readonly keepArchive: boolean;
  /** Через сколько часов автоматически стирать снимки. */
  readonly purgeAfterHours: number;
  /** Показывать ли QR для скачивания цифровой копии. */
  readonly showDigitalCopyQr: boolean;
  /** Адрес, куда ведёт QR. Пусто — QR не показывается. */
  readonly digitalCopyBaseUrl: string;
}

export interface Settings {
  readonly locale: Locale;
  readonly event: EventTheme;
  readonly printer: PrinterSettings;
  readonly capture: CaptureSettings;
  readonly flow: FlowSettings;
  readonly privacy: PrivacySettings;
  /** ПИН входа в админку. */
  readonly adminPin: string;
  /** Путь к PNG-рамке; пусто — без рамки. */
  readonly framePath: string;
}

export const DEFAULT_SETTINGS: Settings = {
  locale: 'ru',
  event: DEFAULT_EVENT_THEME,
  printer: {
    transport: 'ipp',
    endpoint: null,
    displayName: '',
    media: '4x6',
    copies: 1,
  },
  capture: {
    // Фронтальная камера превращает планшет в зеркало — гость видит себя и
    // поправляет причёску сам, без «а куда смотреть?».
    camera: 'front',
    countdownSeconds: 3,
    mirrorPrint: true,
    mirrorPreview: true,
  },
  flow: {
    layouts: ['single', 'twinStrip3', 'grid4', 'polaroid'],
    reviewTimeoutMs: 20_000,
    autoPrintOnTimeout: true,
    allowRetake: true,
    thanksMs: 6_000,
  },
  privacy: {
    keepArchive: false,
    purgeAfterHours: 24,
    showDigitalCopyQr: false,
    digitalCopyBaseUrl: '',
  },
  adminPin: '2468',
  framePath: '',
};

interface SettingsStore {
  readonly settings: Settings;
  setLocale(locale: Locale): void;
  updateEvent(patch: Partial<EventTheme>): void;
  updatePrinter(patch: Partial<PrinterSettings>): void;
  updateCapture(patch: Partial<CaptureSettings>): void;
  updateFlow(patch: Partial<FlowSettings>): void;
  updatePrivacy(patch: Partial<PrivacySettings>): void;
  setAdminPin(pin: string): void;
  setFramePath(path: string): void;
  reset(): void;
}

export const useSettings = create<SettingsStore>()(
  persist(
    set => ({
      settings: DEFAULT_SETTINGS,
      setLocale: locale => set(s => ({settings: {...s.settings, locale}})),
      updateEvent: patch =>
        set(s => ({settings: {...s.settings, event: {...s.settings.event, ...patch}}})),
      updatePrinter: patch =>
        set(s => ({settings: {...s.settings, printer: {...s.settings.printer, ...patch}}})),
      updateCapture: patch =>
        set(s => ({settings: {...s.settings, capture: {...s.settings.capture, ...patch}}})),
      updateFlow: patch =>
        set(s => ({settings: {...s.settings, flow: {...s.settings.flow, ...patch}}})),
      updatePrivacy: patch =>
        set(s => ({settings: {...s.settings, privacy: {...s.settings.privacy, ...patch}}})),
      setAdminPin: adminPin => set(s => ({settings: {...s.settings, adminPin}})),
      setFramePath: framePath => set(s => ({settings: {...s.settings, framePath}})),
      reset: () => set({settings: DEFAULT_SETTINGS}),
    }),
    {
      name: 'settings',
      storage: createJSONStorage(() => ({
        getItem: key => storage.getString(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: key => storage.delete(key),
      })),
      /**
       * Штатное слияние zustand поверхностное: сохранённый объект целиком
       * заменил бы новый объект по умолчанию, и поле, добавленное в
       * следующей версии, у уже установленного приложения оказалось бы
       * undefined. Сливаем вглубь и по типам.
       */
      merge: (persisted, current) => ({
        ...current,
        settings: withDefaults(
          DEFAULT_SETTINGS,
          (persisted as {settings?: unknown} | undefined)?.settings,
        ),
      }),
    },
  ),
);

/** Размер листа под выбранный формат. */
export function mediaSizeOf(choice: MediaChoice): {widthMm: number; heightMm: number} {
  switch (choice) {
    case '3x3':
      return {widthMm: 76.2, heightMm: 76.2};
    case '2x3':
      // Карманная бумага компактных Xiaomi: 2 × 3 дюйма.
      return {widthMm: 50.8, heightMm: 76.2};
    case '4x6':
    default:
      return {widthMm: 101.6, heightMm: 152.4};
  }
}
