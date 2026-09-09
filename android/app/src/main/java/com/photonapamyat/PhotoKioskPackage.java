package com.photonapamyat;

import androidx.annotation.NonNull;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Регистрация нативных модулей приложения.
 *
 * KioskDeviceAdminReceiver сюда не входит: это системный получатель
 * широковещательных сообщений, он объявляется в манифесте.
 */
public class PhotoKioskPackage implements ReactPackage {

    @NonNull
    @Override
    public List<NativeModule> createNativeModules(@NonNull ReactApplicationContext context) {
        List<NativeModule> modules = new ArrayList<>();
        modules.add(new PhotoKioskModule(context));
        modules.add(new PhotoCrashLogModule(context));
        modules.add(new PhotoNetworkInfoModule(context));
        modules.add(new PhotoSystemPrintModule(context));
        return modules;
    }

    @NonNull
    @Override
    public List<ViewManager> createViewManagers(@NonNull ReactApplicationContext context) {
        return Collections.emptyList();
    }
}
