/**
 * Киоск-режим.
 *
 * Включается только осознанно из админки. Всё, что здесь проверяется, —
 * что отказ устройства объясняется вызывающему, а не выглядит как успех:
 * оператор должен узнать, что закрепление не сработало, до начала
 * мероприятия, а не когда гость свернёт приложение.
 */

import {NativeModules} from 'react-native';

import {enterKioskMode, exitKioskMode, isKioskActive, supportsLockTask} from '../kiosk';

const native = NativeModules.PhotoKiosk as {
  enterKioskMode: jest.Mock;
  exitKioskMode: jest.Mock;
  keepScreenOn: jest.Mock;
  setImmersive: jest.Mock;
  isKioskActive: jest.Mock;
};

beforeEach(() => {
  native.enterKioskMode.mockResolvedValue(true);
  native.exitKioskMode.mockResolvedValue(true);
  native.keepScreenOn.mockResolvedValue(undefined);
  native.setImmersive.mockResolvedValue(undefined);
  native.isKioskActive.mockResolvedValue(false);
});

describe('вход в киоск-режим', () => {
  it('на Android закрепляет приложение', async () => {
    expect(supportsLockTask).toBe(true);
    expect(await enterKioskMode()).toEqual({locked: true});
  });

  it('удерживает экран включённым и прячет системные панели', async () => {
    // Погасший экран на мероприятии означает, что к будке никто не подойдёт.
    await enterKioskMode();
    expect(native.keepScreenOn).toHaveBeenCalledWith(true);
    expect(native.setImmersive).toHaveBeenCalledWith(true);
  });

  it('отказ системы объясняется, а не выдаётся за успех', async () => {
    // Без прав владельца устройства Android закрепление запрещает.
    native.enterKioskMode.mockRejectedValue(new Error('SecurityException'));
    expect(await enterKioskMode()).toEqual({
      locked: false,
      hint: 'lock-task-not-permitted',
    });
  });

  it('отрицательный ответ системы тоже не успех', async () => {
    native.enterKioskMode.mockResolvedValue(false);
    expect(await enterKioskMode()).toEqual({locked: false});
  });
});

describe('выход из киоск-режима', () => {
  it('возвращает экран в обычное состояние', async () => {
    await exitKioskMode();
    expect(native.setImmersive).toHaveBeenCalledWith(false);
    expect(native.keepScreenOn).toHaveBeenCalledWith(false);
    expect(native.exitKioskMode).toHaveBeenCalled();
  });

  it('повторный выход не ошибка', async () => {
    native.exitKioskMode.mockRejectedValue(new Error('Не в киоске'));
    await expect(exitKioskMode()).resolves.toBeUndefined();
  });
});

describe('текущее состояние', () => {
  it('спрашивается у системы, а не хранится у нас', async () => {
    // Из закрепления можно выйти системными средствами, и наш флаг
    // разошёлся бы с действительностью.
    native.isKioskActive.mockResolvedValue(true);
    expect(await isKioskActive()).toBe(true);
    expect(native.isKioskActive).toHaveBeenCalled();
  });

  it('молчащий модуль считается «не в киоске»', async () => {
    native.isKioskActive.mockRejectedValue(new Error('нет модуля'));
    expect(await isKioskActive()).toBe(false);
  });
});
