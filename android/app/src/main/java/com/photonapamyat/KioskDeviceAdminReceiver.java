package com.photonapamyat;

import android.app.admin.DeviceAdminReceiver;

/**
 * Получатель прав администратора устройства.
 *
 * Нужен только для «настоящего» киоска: если приложение назначено владельцем
 * устройства (device owner), startLockTask() закрепляет экран молча и выйти
 * из приложения нельзя. Без этого Android покажет запрос «Закрепить
 * приложение?», а гость сможет выйти долгим нажатием «Назад» + «Обзор».
 *
 * Назначается один раз на чистом планшете:
 *   adb shell dpm set-device-owner com.photonapamyat/.KioskDeviceAdminReceiver
 *
 * Подробности — в docs/KIOSK-SETUP.md.
 */
public class KioskDeviceAdminReceiver extends DeviceAdminReceiver {
}
