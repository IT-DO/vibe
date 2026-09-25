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
import {DEFAULT_EVENT_THEME, type EventTheme} from '../theme/theme';

const storage = new MMKV({id: 'photo-na-pamyat'});

/**
 * Формат отпечатка.
 *
 * Он один: принтер печатает на карманной бумаге ZINK 50 × 76 мм и другой не
 * принимает. Тип оставлен перечислением, а не выброшен совсем, — если
 * когда-нибудь появится второй картридж, добавить его будет одной строкой,
 * а весь код уже готов работать с выбором.
 */
export type MediaChoice = '2x3';

export interface PrinterSettings {
  /** MAC-адрес сопряжённого принтера. Пусто — принтер ещё не выбран. */
  readonly bluetoothAddress: string;
  /** Имя принтера для админки. */
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
  /**
   * Класть готовый отпечаток в галерею телефона.
   *
   * Прежняя настройка называлась «хранить копии» и оставляла файлы во
   * внутренней памяти приложения — туда без компьютера не добраться, и
   * толку от неё не было. Теперь отпечаток попадает в галерею, откуда его
   * видно сразу и можно отправить гостю.
   */
  readonly saveToAlbum: boolean;
  /** Через сколько часов автоматически стирать снимки. */
  readonly purgeAfterHours: number;
  /** Показывать ли QR для скачивания цифровой копии. */
  readonly showDigitalCopyQr: boolean;
  /** Адрес, куда ведёт QR. Пусто — QR не показывается. */
  readonly digitalCopyBaseUrl: string;
}

export interface Settings {
  readonly locale: Locale;
  /**
   * Подробная запись каждого шага в журнал.
   *
   * Выключена по умолчанию: на мероприятии она не нужна и только копит
   * файл. Включается, когда что-то не работает, — по журналу видно, до
   * какого шага дошло дело.
   */
  readonly verboseLog: boolean;
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
  verboseLog: false,
  event: DEFAULT_EVENT_THEME,
  printer: {
    bluetoothAddress: '',
    displayName: '',
    media: '2x3',
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
    layouts: ['single', 'polaroid', 'duo'],
    reviewTimeoutMs: 20_000,
    autoPrintOnTimeout: true,
    allowRetake: true,
    thanksMs: 6_000,
  },
  privacy: {
    saveToAlbum: false,
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
  setVerboseLog(on: boolean): void;
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
      setVerboseLog: verboseLog => set(s => ({settings: {...s.settings, verboseLog}})),
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
export function mediaSizeOf(_choice: MediaChoice): {widthMm: number; heightMm: number} {
  // Карманная бумага ZINK: 2 × 3 дюйма.
  return {widthMm: 50.8, heightMm: 76.2};
}
