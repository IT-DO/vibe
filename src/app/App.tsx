/**
 * Корень приложения «Фото на память».
 *
 * Устройство экрана: снизу — постоянный слой камеры, сверху — экран текущего
 * шага сценария. Камера не перемонтируется никогда, поэтому переходы между
 * шагами мгновенные, а гость всё время видит себя.
 */

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {StatusBar, StyleSheet, View} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {CameraLayer, type CameraLayerHandle} from './CameraLayer';
import {applyPrinterSettings, bootstrap, printQueue} from './services';
import {useKioskSession} from './useKioskSession';
import {layoutById} from '../imaging/layouts';
import {enterKioskMode} from '../platform/kiosk';
import {purgeOlderThan} from '../platform/files';
import type {QueueSnapshot} from '../printing/queue';
import {AdminScreen} from '../screens/admin/AdminScreen';
import {AttractScreen} from '../screens/AttractScreen';
import {CaptureScreen, type CapturePhase} from '../screens/CaptureScreen';
import {LayoutScreen} from '../screens/LayoutScreen';
import {ReviewScreen} from '../screens/ReviewScreen';
import {ErrorScreen, PrintingScreen, ThanksScreen} from '../screens/ThanksScreen';
import {useSettings} from '../store/settings';
import {palette} from '../theme/theme';

/** Сколько секунд печатается один лист — для оценки ожидания. */
const SECONDS_PER_PRINT = 57;

export default function App() {
  const settings = useSettings(s => s.settings);
  const setLocale = useSettings(s => s.setLocale);

  const camera = useRef<CameraLayerHandle | null>(null);
  const session = useKioskSession(settings, camera);

  const [adminOpen, setAdminOpen] = useState(false);
  const [queue, setQueue] = useState<QueueSnapshot>(() => printQueue.snapshot());

  // Запуск: папки, очередь, киоск-режим и уборка старых снимков.
  useEffect(() => {
    void (async () => {
      await bootstrap();
      await enterKioskMode();
      await purgeOlderThan(settings.privacy.purgeAfterHours * 3_600_000);
    })();
    // Выполняется один раз при старте приложения.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Транспорт печати пересобирается при изменении настроек принтера.
  useEffect(() => {
    void applyPrinterSettings(settings.printer).catch(() => {
      // Ошибку увидит оператор в админке; сценарий гостя не прерываем.
    });
  }, [settings.printer]);

  useEffect(() => printQueue.subscribe(setQueue), []);

  const openAdmin = useCallback(() => setAdminOpen(true), []);
  const toggleLocale = useCallback(
    () => setLocale(settings.locale === 'ru' ? 'en' : 'ru'),
    [settings.locale, setLocale],
  );

  const {state} = session;
  const inCaptureFlow =
    state.name === 'getReady' ||
    state.name === 'countdown' ||
    state.name === 'capturing' ||
    state.name === 'betweenShots';

  // Камера активна на заставке и во время съёмки: на заставке она работает
  // зеркалом и привлекает людей, во время съёмки — по прямому назначению.
  const cameraActive = state.name === 'attract' || inCaptureFlow;
  // Затемнение помогает читать текст поверх кадра, но на съёмке его почти
  // нет — гость должен хорошо себя видеть.
  const dim = state.name === 'attract' ? 0.55 : inCaptureFlow ? 0.15 : 1;

  return (
    <SafeAreaProvider>
      <StatusBar hidden />
      <View style={styles.root}>
        <CameraLayer
          ref={camera}
          facing={settings.capture.camera}
          mirrorPreview={settings.capture.mirrorPreview}
          active={cameraActive && !adminOpen}
          dim={dim}
        />

        {renderScreen()}

        {adminOpen ? <AdminScreen onClose={() => setAdminOpen(false)} /> : null}
      </View>
    </SafeAreaProvider>
  );

  function renderScreen() {
    const accent = settings.event.accent;

    switch (state.name) {
      case 'attract':
        return (
          <AttractScreen
            locale={settings.locale}
            title={settings.event.title}
            subtitle={settings.event.subtitle}
            logoPath={settings.event.logoPath}
            accent={accent}
            printerHealth={queue.printer?.health ?? 'unknown'}
            {...(queue.pausedReason ? {printerReason: queue.pausedReason} : {})}
            queueLength={queue.pending}
            onStart={session.start}
            onSecretHold={openAdmin}
            onToggleLocale={toggleLocale}
          />
        );

      case 'chooseLayout':
        return (
          <LayoutScreen
            locale={settings.locale}
            accent={accent}
            layouts={settings.flow.layouts}
            secondsLeft={session.secondsLeft}
            onChoose={session.chooseLayout}
            onCancel={session.cancel}
          />
        );

      case 'getReady':
      case 'countdown':
      case 'capturing':
      case 'betweenShots':
        return (
          <CaptureScreen
            locale={settings.locale}
            accent={accent}
            phase={capturePhase()}
            onCancel={session.cancel}
          />
        );

      case 'review':
        return (
          <ReviewScreen
            locale={settings.locale}
            accent={accent}
            previewUri={session.previewUri}
            secondsLeft={session.secondsLeft}
            allowRetake={settings.flow.allowRetake}
            busy={session.busy}
            onPrint={session.print}
            onRetake={session.retake}
          />
        );

      case 'printing':
        return <PrintingScreen locale={settings.locale} accent={accent} />;

      case 'thanks':
        return (
          <ThanksScreen
            locale={settings.locale}
            accent={accent}
            queuePosition={state.queuePosition}
            waitSeconds={Math.max(1, queue.pending) * SECONDS_PER_PRINT}
            digitalCopyUrl={
              settings.privacy.showDigitalCopyQr ? settings.privacy.digitalCopyBaseUrl : ''
            }
            onDismiss={session.dismiss}
          />
        );

      case 'error':
        return (
          <ErrorScreen
            locale={settings.locale}
            message={state.message}
            onDismiss={session.dismiss}
          />
        );
    }
  }

  /** Переводит состояние автомата в фазу экрана съёмки. */
  function capturePhase(): CapturePhase {
    const totalShots =
      'layoutId' in state ? layoutById(state.layoutId).shots : 1;

    switch (state.name) {
      case 'getReady':
        return {kind: 'getReady', totalShots};
      case 'countdown':
        return {
          kind: 'countdown',
          secondsLeft: state.secondsLeft,
          shot: state.shotIndex,
          totalShots,
        };
      case 'capturing':
        return {kind: 'flash', shot: state.shotIndex, totalShots};
      default:
        return {
          kind: 'between',
          shot: 'shotIndex' in state ? state.shotIndex : 0,
          totalShots,
        };
    }
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
  },
});
