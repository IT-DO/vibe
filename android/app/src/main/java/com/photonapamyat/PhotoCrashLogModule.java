package com.photonapamyat;

import android.content.Context;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

import java.io.File;
import java.io.FileWriter;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.Scanner;

/**
 * Журнал падений.
 *
 * Приложение стоит на чужом телефоне, и до сих пор единственным способом
 * узнать причину сбоя было «подключите телефон к компьютеру и снимите
 * logcat». Для человека, который просто хочет фотобудку, это неподъёмное
 * требование, а каждая догадка вслепую стоит цикла сборки.
 *
 * Поэтому приложение записывает падения само. Важно, что перехватчик стоит
 * на нативном уровне: падение из-за отсутствующего разрешения VIBRATE
 * произошло в нативном потоке, и обработчик ошибок JavaScript его бы не
 * увидел.
 *
 * Журнал лежит во внутренней папке приложения, никуда не отправляется сам и
 * показывается только в админке. Отдать его можно вручную кнопкой
 * «Поделиться».
 */
public class PhotoCrashLogModule extends ReactContextBaseJavaModule {

    private static final String FILE_NAME = "crash.log";
    /** Больше этого размера журнал начинается заново: нас интересует свежее. */
    private static final long MAX_BYTES = 128 * 1024;

    public PhotoCrashLogModule(ReactApplicationContext context) {
        super(context);
    }

    @NonNull
    @Override
    public String getName() {
        return "PhotoCrashLog";
    }

    /**
     * Ставит перехватчик необработанных исключений.
     *
     * Вызывается из MainApplication.onCreate(), а не из конструктора модуля:
     * модуль создаётся при первом обращении из JavaScript, а падения бывают
     * и раньше.
     */
    public static void install(final Context context) {
        final Thread.UncaughtExceptionHandler previous =
                Thread.getDefaultUncaughtExceptionHandler();

        Thread.setDefaultUncaughtExceptionHandler((thread, error) -> {
            try {
                appendToFile(context, describe(thread, error));
            } catch (Throwable ignored) {
                // Обработчик падений не имеет права упасть сам.
            }
            if (previous != null) {
                previous.uncaughtException(thread, error);
            }
        });
    }

    /** Текст записи: время, поток, полный стек. */
    private static String describe(Thread thread, Throwable error) {
        StringWriter stack = new StringWriter();
        error.printStackTrace(new PrintWriter(stack));

        String when = new SimpleDateFormat("dd.MM.yyyy HH:mm:ss", Locale.US).format(new Date());
        return "\n=== Падение " + when + " (поток " + thread.getName() + ") ===\n" + stack;
    }

    private static File logFile(Context context) {
        return new File(context.getFilesDir(), FILE_NAME);
    }

    private static synchronized void appendToFile(Context context, String text)
            throws Exception {
        File file = logFile(context);
        boolean truncate = file.exists() && file.length() > MAX_BYTES;
        try (FileWriter writer = new FileWriter(file, !truncate)) {
            writer.write(text);
        }
    }

    /** Дописывает запись из JavaScript — туда попадают ошибки уровня JS. */
    @ReactMethod
    public void append(String text, Promise promise) {
        try {
            appendToFile(getReactApplicationContext(), text);
            promise.resolve(null);
        } catch (Exception error) {
            promise.resolve(null);
        }
    }

    /** Возвращает весь журнал; пустая строка — падений не было. */
    @ReactMethod
    public void read(Promise promise) {
        try {
            File file = logFile(getReactApplicationContext());
            if (!file.exists()) {
                promise.resolve("");
                return;
            }
            try (Scanner scanner = new Scanner(file, "UTF-8")) {
                promise.resolve(scanner.useDelimiter("\\A").hasNext()
                        ? scanner.useDelimiter("\\A").next()
                        : "");
            }
        } catch (Exception error) {
            promise.resolve("");
        }
    }

    @ReactMethod
    public void clear(Promise promise) {
        try {
            File file = logFile(getReactApplicationContext());
            if (file.exists() && !file.delete()) {
                // Не удалось удалить — обнуляем содержимое.
                try (FileWriter writer = new FileWriter(file, false)) {
                    writer.write("");
                }
            }
        } catch (Exception ignored) {
            // Очистка журнала — не та операция, ради которой стоит падать.
        }
        promise.resolve(null);
    }
}
