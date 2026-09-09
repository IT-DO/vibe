/**
 * Заставка — экран, который люди видят издалека и по которому решают,
 * подходить или нет.
 *
 * Поэтому на нём: живое превью с камеры (человек видит себя ещё на подходе —
 * это работает лучше любого призыва), крупное название мероприятия и одна
 * фраза о том, что произойдёт. Всё остальное — служебное и мелкое.
 */

import React, {useEffect, useRef} from 'react';
import {Animated, Image, StyleSheet, Text, View} from 'react-native';

import {BigButton} from '../components/BigButton';
import {KioskScreen} from '../components/KioskScreen';
import {PrinterBadge} from '../components/PrinterBadge';
import {stringsFor, type Locale} from '../i18n/strings';
import type {PrinterHealth} from '../printing/ipp/capabilities';
import {palette, spacing, typography} from '../theme/theme';

export interface AttractScreenProps {
  readonly locale: Locale;
  readonly title: string;
  readonly subtitle: string;
  readonly logoPath: string;
  readonly accent: string;
  readonly printerHealth: PrinterHealth;
  readonly printerReason?: string;
  readonly queueLength: number;
  /** Принтер вообще не выбран — это чинит оператор, а не гость. */
  readonly printerMissing: boolean;
  readonly onStart: () => void;
  readonly onSecretHold: () => void;
  readonly onToggleLocale: () => void;
  readonly onSetUpPrinter: () => void;
  /** Выбрать готовый снимок из галереи вместо съёмки. */
  readonly onPickPhoto: () => void;
}

export function AttractScreen({
  locale,
  title,
  subtitle,
  logoPath,
  accent,
  printerHealth,
  printerReason,
  queueLength,
  printerMissing,
  onStart,
  onSecretHold,
  onToggleLocale,
  onSetUpPrinter,
  onPickPhoto,
}: AttractScreenProps) {
  const t = stringsFor(locale);
  const pulse = useRef(new Animated.Value(0)).current;

  // Медленная пульсация призыва: движение на периферии зрения замечают даже
  // те, кто идёт мимо и на экран не смотрит.
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {toValue: 1, duration: 1400, useNativeDriver: true}),
        Animated.timing(pulse, {toValue: 0, duration: 1400, useNativeDriver: true}),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  const scale = pulse.interpolate({inputRange: [0, 1], outputRange: [1, 1.04]});
  const opacity = pulse.interpolate({inputRange: [0, 1], outputRange: [0.85, 1]});

  const blocked = printerHealth === 'blocked';

  // Пока принтер не выбран, касание по всему экрану выключено: иначе гость
  // пройдёт весь сценарий ради отпечатка, которого не будет.
  const tapToStart = blocked || printerMissing ? undefined : onStart;

  return (
    <KioskScreen onPressAnywhere={tapToStart} onSecretHold={onSecretHold}>
      <View style={styles.container}>
        <View style={styles.header}>
          {logoPath ? (
            <Image source={{uri: logoPath}} style={styles.logo} resizeMode="contain" />
          ) : null}
          <Text style={[styles.title, {color: accent}]} numberOfLines={3} adjustsFontSizeToFit>
            {title}
          </Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>

        <View style={styles.callToAction}>
          {printerMissing ? (
            // Сообщение адресовано владельцу устройства, а не гостю:
            // говорим прямо, что не так и что нажать.
            <View style={styles.setup}>
              <Text style={[styles.tap, {color: palette.warning}]}>
                {t.attract.printerMissing}
              </Text>
              <Text style={styles.hint}>{t.attract.printerMissingHint}</Text>
              <BigButton
                label={t.attract.setUpPrinter}
                icon="⚙"
                accent={accent}
                onPress={onSetUpPrinter}
                style={styles.setupButton}
              />
            </View>
          ) : blocked ? (
            <Text style={[styles.tap, {color: palette.danger}]}>
              {t.attract.printerOffline}
            </Text>
          ) : (
            <>
              <Animated.View style={{transform: [{scale}], opacity}}>
                <View style={[styles.tapPill, {borderColor: accent}]}>
                  <Text style={styles.tap}>{t.attract.tapToStart}</Text>
                </View>
              </Animated.View>
              <Text style={styles.hint}>{t.attract.hint}</Text>
              {/* Второй сценарий: напечатать уже готовый снимок. Кнопка
                  вторичная — основной путь всё-таки съёмка. */}
              <BigButton
                label={t.attract.pickPhoto}
                icon="🖼"
                variant="ghost"
                onPress={onPickPhoto}
                style={styles.pickButton}
              />
            </>
          )}
        </View>

        <PrinterBadge
          health={printerHealth}
          {...(printerReason ? {reason: printerReason} : {})}
          queueLength={queueLength}
          locale={locale}
        />

        {/* Переключатель языка — маленький, в углу: он нужен меньшинству. */}
        <Text
          accessibilityRole="button"
          onPress={onToggleLocale}
          style={styles.localeToggle}
          suppressHighlighting>
          {locale === 'ru' ? 'EN' : 'РУ'}
        </Text>
      </View>
    </KioskScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  header: {
    alignItems: 'center',
    gap: spacing.md,
  },
  logo: {
    width: 220,
    height: 120,
  },
  title: {
    fontSize: typography.display,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: typography.heading,
    color: palette.textMuted,
    textAlign: 'center',
  },
  callToAction: {
    alignItems: 'center',
    gap: spacing.lg,
  },
  setup: {
    alignItems: 'center',
    gap: spacing.md,
  },
  setupButton: {
    marginTop: spacing.sm,
  },
  pickButton: {
    marginTop: spacing.sm,
    minHeight: 84,
  },
  tapPill: {
    borderWidth: 3,
    borderRadius: 999,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  tap: {
    fontSize: typography.title,
    fontWeight: '700',
    color: palette.text,
    textAlign: 'center',
  },
  hint: {
    fontSize: typography.body,
    color: palette.textMuted,
    textAlign: 'center',
  },
  localeToggle: {
    position: 'absolute',
    bottom: 0,
    right: spacing.md,
    color: palette.textMuted,
    fontSize: typography.caption,
    fontWeight: '700',
    padding: spacing.md,
  },
});
