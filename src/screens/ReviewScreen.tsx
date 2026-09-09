/**
 * Просмотр перед печатью.
 *
 * Здесь два решения, которые важнее остального оформления:
 *
 *  1. Показываем готовый лист целиком — в той раскладке и с той рамкой, что
 *     выйдут из принтера. Иначе гость видит одно, забирает другое.
 *  2. Видимый таймер до автопечати. Он не давит — он объясняет, что будет,
 *     если просто отойти. Без него люди либо стоят и думают, либо уходят,
 *     оставив будку занятой.
 */

import React from 'react';
import {Image, StyleSheet, Text, View} from 'react-native';

import {BigButton} from '../components/BigButton';
import {KioskScreen} from '../components/KioskScreen';
import {stringsFor, type Locale} from '../i18n/strings';
import {palette, radius, spacing, typography} from '../theme/theme';

export interface ReviewScreenProps {
  readonly locale: Locale;
  readonly accent: string;
  /** URI собранного листа для показа. */
  readonly previewUri: string | null;
  readonly secondsLeft: number;
  readonly allowRetake: boolean;
  /** Снимок пришёл из галереи — «переснять» его нельзя, можно выбрать другой. */
  readonly fromGallery: boolean;
  readonly busy: boolean;
  readonly onPrint: () => void;
  readonly onRetake: () => void;
}

export function ReviewScreen({
  locale,
  accent,
  previewUri,
  secondsLeft,
  allowRetake,
  fromGallery,
  busy,
  onPrint,
  onRetake,
}: ReviewScreenProps) {
  const t = stringsFor(locale);

  return (
    <KioskScreen>
      <View style={styles.container}>
        <Text style={styles.title}>{t.review.title}</Text>

        <View style={styles.sheetFrame}>
          {previewUri ? (
            <Image
              source={{uri: previewUri}}
              style={styles.sheet}
              resizeMode="contain"
              accessibilityLabel={t.review.title}
            />
          ) : (
            <View style={[styles.sheet, styles.sheetPlaceholder]} />
          )}
        </View>

        <View style={styles.actions}>
          {allowRetake ? (
            <BigButton
              label={fromGallery ? t.review.pickAnother : t.review.retake}
              icon={fromGallery ? '🖼' : '↺'}
              variant="ghost"
              onPress={onRetake}
              disabled={busy}
            />
          ) : null}
          <BigButton
            label={t.review.print}
            icon="🖨"
            accent={accent}
            onPress={onPrint}
            busy={busy}
          />
        </View>

        {/* Таймер объясняет, что случится при бездействии. */}
        <Text style={styles.timer}>
          {secondsLeft > 0 ? t.review.autoPrintIn(secondsLeft) : ''}
        </Text>
      </View>
    </KioskScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  title: {
    fontSize: typography.title,
    fontWeight: '800',
    color: palette.text,
  },
  sheetFrame: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  sheet: {
    flex: 1,
    width: '100%',
    borderRadius: radius.md,
  },
  sheetPlaceholder: {
    backgroundColor: palette.surface,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.lg,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  timer: {
    fontSize: typography.body,
    color: palette.textMuted,
    height: typography.body + 8,
  },
});
