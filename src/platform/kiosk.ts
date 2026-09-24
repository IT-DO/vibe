/**
 * Киоск-режим: экран не гаснет, из приложения нельзя выйти случайным жестом.
 *
 * Android умеет закреплять приложение системно (lock task). iOS такого API
 * для обычных приложений не даёт — там это включается вручную «Гид-доступом»
 * (Настройки -> Универсальный доступ -> Гид-доступ), поэтому нативный модуль
 * на iOS только держит экран включённым, а инструкция для оператора лежит в
 * `docs/KIOSK-SETUP.md`.
 */

import {NativeModules, Platform} from 'react-native';

interface KioskNativeModule {
  /** Включает закрепление экрана (Android lock task). */
  enterKioskMode(): Promise<boolean>;
  exitKioskMode(): Promise<boolean>;
  /** Запрещает гашение экрана. */
  keepScreenOn(enabled: boolean): Promise<void>;
  /** Скрывает системные панели (Android immersive mode). */
  setImmersive(enabled: boolean): Promise<void>;
  /** Активен ли сейчас киоск-режим (на iOS — включён ли Гид-доступ). */
  isKioskActive(): Promise<boolean>;
}

const native = NativeModules.PhotoKiosk as KioskNativeModule | undefined;

/** Доступен ли системный киоск-режим на этой платформе. */
export const supportsLockTask = Platform.OS === 'android';

/** Включает всё, что удерживает планшет в приложении. */
export async function enterKioskMode(): Promise<{locked: boolean; hint?: string}> {
  if (!native) {
    return {locked: false, hint: 'native-module-missing'};
  }
  await native.keepScreenOn(true);
  await native.setImmersive(true);

  if (!supportsLockTask) {
    // iOS: закрепить приложение программно нельзя — нужен Гид-доступ.
    const active = await native.isKioskActive();
    return active ? {locked: true} : {locked: false, hint: 'ios-guided-access-required'};
  }

  try {
    return {locked: await native.enterKioskMode()};
  } catch {
    // Без прав владельца устройства Android разрешает только «мягкое»
    // закрепление с подтверждением пользователя.
    return {locked: false, hint: 'lock-task-not-permitted'};
  }
}

/** Возвращает планшет в обычный режим — выход оператора из киоска. */
export async function exitKioskMode(): Promise<void> {
  if (!native) {
    return;
  }
  await native.setImmersive(false);
  await native.keepScreenOn(false);
  if (supportsLockTask) {
    try {
      await native.exitKioskMode();
    } catch {
      // Уже вышли.
    }
  }
}

/** Проверяет, удерживается ли планшет в приложении прямо сейчас. */
export async function isKioskActive(): Promise<boolean> {
  try {
    return native ? await native.isKioskActive() : false;
  } catch {
    // Не смогли выяснить — считаем, что не закреплено: соседние функции
    // молчат об отказах платформы так же, а вызывающему нужен ответ, а не
    // исключение посреди подготовки к мероприятию.
    return false;
  }
}
