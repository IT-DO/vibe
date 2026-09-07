/**
 * Экраны после нажатия «печатать»: отправка, благодарность и ошибка.
 *
 * Главное сообщение здесь — «идите к принтеру». Гость не должен гадать,
 * появится фотография сама или надо чего-то ждать у экрана: пока он стоит
 * у планшета, будка занята.
 *
 * Время ожидания называем честно (около минуты на лист). Названная минута
 * ощущается короче безымянной: человек отходит и возвращается, а не топчется
 * рядом, решив, что всё зависло.
 */

import React from 'react';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';

import {KioskScreen} from '../components/KioskScreen';
import {QrCode} from '../components/QrCode';
import {stringsFor, type Locale} from '../i18n/strings';
import {palette, spacing, typography} from '../theme/theme';

export interface PrintingScreenProps {
  readonly locale: Locale;
  readonly accent: string;
}

/** Короткий экран между «печатать» и подтверждением очереди. */
export function PrintingScreen({locale, accent}: PrintingScreenProps) {
  const t = stringsFor(locale);
  return (
    <KioskScreen>
      <View style={styles.center}>
        <ActivityIndicator size="large" color={accent} />
        <Text style={styles.title}>{t.printing.sending}</Text>
      </View>
    </KioskScreen>
  );
}

export interface ThanksScreenProps {
  readonly locale: Locale;
  readonly accent: string;
  readonly queuePosition: number;
  /** Ожидание в секундах — считается по длине очереди. */
  readonly waitSeconds: number;
  /** Ссылка на цифровую копию; пусто — QR не показываем. */
  readonly digitalCopyUrl: string;
  readonly onDismiss: () => void;
}

export function ThanksScreen({
  locale,
  accent,
  queuePosition,
  waitSeconds,
  digitalCopyUrl,
  onDismiss,
}: ThanksScreenProps) {
  const t = stringsFor(locale);

  return (
    <KioskScreen onPressAnywhere={onDismiss}>
      <View style={styles.center}>
        <Text style={[styles.big, {color: accent}]}>{t.thanks.title}</Text>
        <Text style={styles.title}>{t.thanks.takePhoto}</Text>

        {queuePosition > 1 ? (
          <Text style={styles.meta}>{t.printing.position(queuePosition)}</Text>
        ) : null}
        <Text style={styles.meta}>{t.printing.waitTime(waitSeconds)}</Text>

        {digitalCopyUrl ? (
          <View style={styles.qrBlock}>
            <QrCode value={digitalCopyUrl} size={220} />
            <Text style={styles.meta}>{t.thanks.digitalCopy}</Text>
          </View>
        ) : null}

        <Text style={styles.comeBack}>{t.thanks.comeBack}</Text>
      </View>
    </KioskScreen>
  );
}

export interface ErrorScreenProps {
  readonly locale: Locale;
  /** Текст для гостя; технические подробности сюда не попадают. */
  readonly message: string;
  readonly onDismiss: () => void;
}

export function ErrorScreen({locale, message, onDismiss}: ErrorScreenProps) {
  const t = stringsFor(locale);
  return (
    <KioskScreen onPressAnywhere={onDismiss}>
      <View style={styles.center}>
        <Text style={[styles.big, {color: palette.warning}]}>{t.error.title}</Text>
        <Text style={styles.title}>{message || t.error.generic}</Text>
        <Text style={styles.meta}>{t.error.callStaff}</Text>
      </View>
    </KioskScreen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  big: {
    fontSize: typography.display,
    fontWeight: '900',
    textAlign: 'center',
  },
  title: {
    fontSize: typography.title,
    fontWeight: '700',
    color: palette.text,
    textAlign: 'center',
  },
  meta: {
    fontSize: typography.body,
    color: palette.textMuted,
    textAlign: 'center',
  },
  qrBlock: {
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  comeBack: {
    fontSize: typography.heading,
    color: palette.textMuted,
    marginTop: spacing.lg,
  },
});
