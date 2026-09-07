/**
 * Счётчики мероприятия.
 *
 * Оператору важны две цифры: сколько напечатано (хватит ли бумаги до конца)
 * и сколько сорвалось. Всё остальное — украшательство.
 */

import {MMKV} from 'react-native-mmkv';
import {create} from 'zustand';
import {createJSONStorage, persist} from 'zustand/middleware';

const storage = new MMKV({id: 'photo-na-pamyat-stats'});

export interface EventStats {
  /** Когда оператор сбросил счётчики — начало текущего мероприятия. */
  readonly startedAt: number;
  readonly sessions: number;
  readonly printed: number;
  readonly failed: number;
  readonly retakes: number;
  /** Сколько отпечатков в пачке бумаги — чтобы считать остаток. */
  readonly paperPackSize: number;
}

const EMPTY: EventStats = {
  startedAt: Date.now(),
  sessions: 0,
  printed: 0,
  failed: 0,
  retakes: 0,
  // Стандартная пачка для Xiaomi 1S — 20 листов; лента рассчитана на 40.
  paperPackSize: 20,
};

interface StatsStore {
  readonly stats: EventStats;
  countSession(): void;
  countPrinted(copies: number): void;
  countFailed(): void;
  countRetake(): void;
  setPaperPackSize(size: number): void;
  /** Сброс перед новым мероприятием. */
  resetEvent(): void;
}

export const useStats = create<StatsStore>()(
  persist(
    set => ({
      stats: EMPTY,
      countSession: () => set(s => ({stats: {...s.stats, sessions: s.stats.sessions + 1}})),
      countPrinted: copies =>
        set(s => ({stats: {...s.stats, printed: s.stats.printed + Math.max(1, copies)}})),
      countFailed: () => set(s => ({stats: {...s.stats, failed: s.stats.failed + 1}})),
      countRetake: () => set(s => ({stats: {...s.stats, retakes: s.stats.retakes + 1}})),
      setPaperPackSize: paperPackSize => set(s => ({stats: {...s.stats, paperPackSize}})),
      resetEvent: () => set({stats: {...EMPTY, startedAt: Date.now()}}),
    }),
    {
      name: 'stats',
      storage: createJSONStorage(() => ({
        getItem: key => storage.getString(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: key => storage.delete(key),
      })),
    },
  ),
);

/**
 * Оценка остатка бумаги по числу напечатанного.
 * Точного счётчика листов у принтера нет, поэтому считаем от последней
 * загруженной пачки — оператор отмечает её в админке.
 */
export function estimateSheetsLeft(stats: EventStats, sheetsLoaded: number): number {
  return Math.max(0, sheetsLoaded - stats.printed);
}
