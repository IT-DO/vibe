package com.photonapamyat;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.print.PrintManager;

import androidx.annotation.NonNull;
import androidx.print.PrintHelper;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

/**
 * Запасной путь печати через системный Print Framework (его подхватывает
 * плагин Mopria).
 *
 * Показывает системный диалог печати, поэтому для необслуживаемого киоска не
 * подходит — см. комментарий в src/printing/transports/system.ts. Здесь он
 * нужен для отладки на площадке и как последняя возможность выдать гостю
 * фотографию, если прямой IPP почему-то не поднялся.
 */
public class PhotoSystemPrintModule extends ReactContextBaseJavaModule {

    public PhotoSystemPrintModule(ReactApplicationContext context) {
        super(context);
    }

    @NonNull
    @Override
    public String getName() {
        return "PhotoSystemPrint";
    }

    @ReactMethod
    public void isAvailable(Promise promise) {
        Object service = getReactApplicationContext().getSystemService(Activity.PRINT_SERVICE);
        promise.resolve(service instanceof PrintManager);
    }

    @ReactMethod
    public void print(String filePath, String jobName, int copies, Promise promise) {
        Activity activity = getCurrentActivity();
        if (activity == null) {
            promise.reject("no_activity", "Приложение не на переднем плане");
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                Bitmap bitmap = BitmapFactory.decodeFile(filePath);
                if (bitmap == null) {
                    promise.reject("bad_file", "Не удалось прочитать файл: " + filePath);
                    return;
                }
                PrintHelper helper = new PrintHelper(activity);
                // FILL печатает в край, как и прямой путь по IPP: лист уже
                // подготовлен точно под размер бумаги.
                helper.setScaleMode(PrintHelper.SCALE_MODE_FILL);
                helper.setColorMode(PrintHelper.COLOR_MODE_COLOR);
                helper.printBitmap(jobName, bitmap);
                promise.resolve(null);
            } catch (RuntimeException error) {
                promise.reject("print_failed", error.getMessage(), error);
            }
        });
    }
}
