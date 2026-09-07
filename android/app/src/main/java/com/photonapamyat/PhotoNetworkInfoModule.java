package com.photonapamyat;

import android.content.Context;
import android.net.DhcpInfo;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

/**
 * Сведения о Wi-Fi: адрес шлюза, свой адрес и имя сети.
 *
 * Шлюз — главное здесь. Когда планшет подключён к точке доступа принтера,
 * принтер и есть шлюз, и это самый надёжный способ его найти: mDNS в таком
 * режиме обычно не отвечает.
 */
public class PhotoNetworkInfoModule extends ReactContextBaseJavaModule {

    public PhotoNetworkInfoModule(ReactApplicationContext context) {
        super(context);
    }

    @NonNull
    @Override
    public String getName() {
        return "PhotoNetworkInfo";
    }

    private WifiManager wifi() {
        return (WifiManager)
                getReactApplicationContext()
                        .getApplicationContext()
                        .getSystemService(Context.WIFI_SERVICE);
    }

    /** Переводит адрес из формата WifiManager (little-endian int) в строку. */
    private static String formatAddress(int address) {
        if (address == 0) {
            return null;
        }
        return String.format(
                "%d.%d.%d.%d",
                address & 0xff, (address >> 8) & 0xff, (address >> 16) & 0xff, (address >> 24) & 0xff);
    }

    @ReactMethod
    public void getGatewayIp(Promise promise) {
        try {
            WifiManager manager = wifi();
            DhcpInfo info = manager == null ? null : manager.getDhcpInfo();
            promise.resolve(info == null ? null : formatAddress(info.gateway));
        } catch (RuntimeException error) {
            promise.resolve(null);
        }
    }

    @ReactMethod
    public void getLocalIp(Promise promise) {
        try {
            WifiManager manager = wifi();
            WifiInfo info = manager == null ? null : manager.getConnectionInfo();
            promise.resolve(info == null ? null : formatAddress(info.getIpAddress()));
        } catch (RuntimeException error) {
            promise.resolve(null);
        }
    }

    @ReactMethod
    public void getSsid(Promise promise) {
        try {
            WifiManager manager = wifi();
            WifiInfo info = manager == null ? null : manager.getConnectionInfo();
            String ssid = info == null ? null : info.getSSID();
            if (ssid == null || ssid.contains("unknown")) {
                // Начиная с Android 10 имя сети отдаётся только при выданном
                // доступе к местоположению. Это не ошибка — просто нечего
                // показать в админке.
                promise.resolve(null);
                return;
            }
            promise.resolve(ssid.replace("\"", ""));
        } catch (RuntimeException error) {
            promise.resolve(null);
        }
    }
}
