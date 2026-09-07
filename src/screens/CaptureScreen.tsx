/**
 * Экран съёмки: «приготовьтесь», обратный отсчёт, вспышка затвора и пауза
 * между кадрами серии.
 *
 * Живое превью сюда не встроено — оно живёт слоем ниже (`app/CameraLayer`) и
 * не перемонтируется между экранами. Камера стартует около секунды, и если
 * поднимать её заново на каждом шаге, гость увидит чёрный прямоугольник
 * ровно в тот момент, когда позирует.
 *
 * Цифры отсчёта огромные и полупрозрачные поверх изображения: их должно быть
 * видно тому, кто стоит в двух метрах и смотрит в объектив, а не в экран.
 */

import React, {useEffect, useRef} from 'react';
import {Animated, StyleSheet, Text, View} from 'react-native';

import {BigButton} from '../components/BigButton';
import {stringsFor, type Locale} from '../i18n/strings';
import {palette, spacing, timing, typography} from '../theme/theme';

export type CapturePhase =
  | {readonly kind: 'getReady'; readonly totalShots: number}
  | {readonly kind: 'countdown'; readonly secondsLeft: number; readonly shot: number; readonly totalShots: number}
  | {readonly kind: 'flash'; readonly shot: number; readonly totalShots: number}
  | {readonly kind: 'between'; readonly shot: number; readonly totalShots: number};

export interface CaptureScreenProps {
  readonly locale: Locale;
  readonly accent: string;
  readonly phase: CapturePhase;
  readonly onCancel: () => void;
}

export function CaptureScreen({locale, accent, phase, onCancel}: CaptureScreenProps) {
  const t = stringsFor(locale);

  return (
    <View style={styles.container} pointerEvents="box-none">
      {phase.kind === 'getReady' ? (
        <View style={styles.centerBlock}>
          <Text style={[styles.title, {color: accent}]}>{t.getReady.title}</Text>
          {phase.totalShots > 1 ? (
            <Text style={styles.subtitle}>{t.getReady.seriesTitle(phase.totalShots)}</Text>
          ) : null}
        </View>
      ) : null}

      {phase.kind === 'countdown' ? (
        <CountdownNumber value={phase.secondsLeft} accent={accent} />
      ) : null}

      {phase.kind === 'flash' ? <ShutterFlash /> : null}

      {phase.kind === 'between' ? (
        <View style={styles.centerBlock}>
          <Text style={[styles.title, {color: accent}]}>{t.countdown.smile}</Text>
        </View>
      ) : null}

      {'totalShots' in phase && phase.totalShots > 1 && phase.kind !== 'getReady' ? (
        <View style={styles.progress}>
          <Text style={styles.progressText}>
            {t.countdown.shotOf(('shot' in phase ? phase.shot : 0) + 1, phase.totalShots)}
          </Text>
          <View style={styles.dots}>
            {Array.from({length: phase.totalShots}, (_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  {
                    backgroundColor:
                      i <= ('shot' in phase ? phase.shot : 0) ? accent : palette.surfaceRaised,
                  },
                ]}
              />
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.footer}>
        <BigButton
          label={t.getReady.cancel}
          variant="ghost"
          onPress={onCancel}
          style={styles.cancelButton}
        />
      </View>
    </View>
  );
}

/** Крупная цифра отсчёта с «пружинкой» на каждой секунде. */
function CountdownNumber({value, accent}: {value: number; accent: string}) {
  const scale = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    scale.setValue(0.6);
    Animated.spring(scale, {
      toValue: 1,
      friction: 4,
      tension: 90,
      useNativeDriver: true,
    }).start();
  }, [value, scale]);

  return (
    <View style={styles.centerBlock} pointerEvents="none">
      <Animated.Text
        style={[styles.countdown, {color: accent, transform: [{scale}]}]}
        accessibilityLiveRegion="assertive">
        {value}
      </Animated.Text>
    </View>
  );
}

/** Белая вспышка в момент срабатывания затвора. */
function ShutterFlash() {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 0,
      duration: timing.shutterFlash,
      useNativeDriver: true,
    }).start();
  }, [opacity]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.flash, {opacity}]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerBlock: {
    alignItems: 'center',
    gap: spacing.md,
  },
  title: {
    fontSize: typography.display,
    fontWeight: '800',
    textAlign: 'center',
    // Тень нужна, чтобы текст читался поверх любого кадра.
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 18,
  },
  subtitle: {
    fontSize: typography.heading,
    color: palette.text,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 12,
  },
  countdown: {
    fontSize: typography.countdown,
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 30,
  },
  flash: {
    backgroundColor: '#FFFFFF',
  },
  progress: {
    position: 'absolute',
    top: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  progressText: {
    fontSize: typography.body,
    color: palette.text,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 10,
  },
  dots: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  footer: {
    position: 'absolute',
    bottom: spacing.xl,
  },
  cancelButton: {
    minWidth: 220,
    minHeight: 88,
  },
});
