package com.photonapamyat;

import android.app.Activity;
import android.media.AudioManager;
import android.media.MediaActionSound;
import android.media.ToneGenerator;
import android.os.Build;
import android.view.View;
import android.view.WindowManager;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

/**
 * Киоск-режим на Android: закрепление приложения, постоянно включённый экран,
 * скрытые системные панели и звуковые сигналы сценария.
 *
 * Про закрепление важно понимать вот что. startLockTask() ведёт себя по-разному
 * в зависимости от того, назначено ли приложение владельцем устройства (device
 * owner):
 *
 *  - назначено  -> закрепление включается молча, выйти можно только из
 *                  приложения. Это рабочий режим для мероприятия;
 *  - не назначено -> система покажет запрос «Закрепить приложение?», и выйти
 *                  можно долгим нажатием «Назад» + «Обзор». Годится для
 *                  репетиции, но на площадке планшет лучше готовить заранее —
 *                  порядок описан в docs/KIOSK-SETUP.md.
 *
 * Приложение НИКОГДА не включает закрепление само. Раньше оно делало это при
 * запуске, и на личном телефоне это выглядело как «телефон заблокировался»:
 * человек ставит приложение посмотреть, а оно закрепляет себя на экране.
 * Теперь режим включает оператор из админки, осознанно.
 */
public class PhotoKioskModule extends ReactContextBaseJavaModule {

    private ToneGenerator toneGenerator;
    private MediaActionSound shutterSound;

    public PhotoKioskModule(ReactApplicationContext context) {
        super(context);
    }

    @NonNull
    @Override
    public String getName() {
        return "PhotoKiosk";
    }

    @ReactMethod
    public void enterKioskMode(Promise promise) {
        Activity activity = getCurrentActivity();
        if (activity == null) {
            promise.resolve(false);
            return;
        }
        activity.runOnUiThread(() -> {
            try {
                activity.startLockTask();
                promise.resolve(true);
            } catch (Throwable error) {
                // Ловим всё. На обычном телефоне startLockTask() бросает
                // IllegalStateException, если закрепление экрана не включено
                // в настройках, и раньше это исключение улетало в UI-поток и
                // роняло приложение, а промис не разрешался никогда.
                // Закрепление — не критичная функция: без него будка просто
                // работает без защиты от выхода.
                promise.resolve(false);
            }
        });
    }

    @ReactMethod
    public void exitKioskMode(Promise promise) {
        Activity activity = getCurrentActivity();
        if (activity == null) {
            promise.resolve(false);
            return;
        }
        activity.runOnUiThread(() -> {
            try {
                activity.stopLockTask();
                promise.resolve(true);
            } catch (Throwable error) {
                // Уже вышли, либо закрепление и не включалось.
                promise.resolve(false);
            }
        });
    }

    @ReactMethod
    public void isKioskActive(Promise promise) {
        Activity activity = getCurrentActivity();
        if (activity == null) {
            promise.resolve(false);
            return;
        }
        android.app.ActivityManager manager =
                (android.app.ActivityManager) activity.getSystemService(Activity.ACTIVITY_SERVICE);
        if (manager == null) {
            promise.resolve(false);
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            promise.resolve(
                    manager.getLockTaskModeState()
                            != android.app.ActivityManager.LOCK_TASK_MODE_NONE);
        } else {
            promise.resolve(manager.isInLockTaskMode());
        }
    }

    @ReactMethod
    public void keepScreenOn(boolean enabled, Promise promise) {
        Activity activity = getCurrentActivity();
        if (activity == null) {
            promise.resolve(null);
            return;
        }
        activity.runOnUiThread(() -> {
            if (enabled) {
                activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            } else {
                activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
            promise.resolve(null);
        });
    }

    @ReactMethod
    public void setImmersive(boolean enabled, Promise promise) {
        Activity activity = getCurrentActivity();
        if (activity == null) {
            promise.resolve(null);
            return;
        }
        activity.runOnUiThread(() -> {
            View decor = activity.getWindow().getDecorView();
            if (enabled) {
                // STICKY возвращает панели в скрытое состояние после того, как
                // гость смахнул их жестом от края.
                decor.setSystemUiVisibility(
                        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                                | View.SYSTEM_UI_FLAG_FULLSCREEN
                                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
            } else {
                decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
            }
            promise.resolve(null);
        });
    }

    /**
     * Системные звуки сценария. Своих файлов не держим: сигналы короткие и
     * служебные, а лишние ассеты — лишний вес приложения.
     */
    @ReactMethod
    public void playCue(String cue) {
        try {
            if ("shutter".equals(cue)) {
                if (shutterSound == null) {
                    shutterSound = new MediaActionSound();
                    shutterSound.load(MediaActionSound.SHUTTER_CLICK);
                }
                shutterSound.play(MediaActionSound.SHUTTER_CLICK);
                return;
            }

            if (toneGenerator == null) {
                toneGenerator = new ToneGenerator(AudioManager.STREAM_MUSIC, 90);
            }
            switch (cue) {
                case "countdown":
                    toneGenerator.startTone(ToneGenerator.TONE_PROP_BEEP, 120);
                    break;
                case "done":
                    toneGenerator.startTone(ToneGenerator.TONE_PROP_ACK, 200);
                    break;
                case "error":
                    toneGenerator.startTone(ToneGenerator.TONE_PROP_NACK, 300);
                    break;
                default:
                    break;
            }
        } catch (RuntimeException error) {
            // Звук — не критичная функция; молчим и работаем дальше.
        }
    }

    @Override
    public void invalidate() {
        if (toneGenerator != null) {
            toneGenerator.release();
            toneGenerator = null;
        }
        if (shutterSound != null) {
            shutterSound.release();
            shutterSound = null;
        }
        super.invalidate();
    }
}
