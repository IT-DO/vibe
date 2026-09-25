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
import {fonts, palette, radius, spacing, typography} from '../theme/theme';

export interface ReviewScreenProps {
  readonly locale: Locale;
  readonly accent: string;
  /** URI собранного листа для показа. */
  readonly previewUri: string | null;
  readonly secondsLeft: number;
  /**
   * Сколько всего секунд отведено на раздумье. Нужно, чтобы показать
   * оставшееся долей, а не только числом: полоса понятнее цифры тому, кто
   * на экран не всматривается.
   */
  readonly autoPrintSeconds?: number;
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
  autoPrintSeconds,
  allowRetake,
  fromGallery,
  busy,
  onPrint,
  onRetake,
}: ReviewScreenProps) {
  const t = stringsFor(locale);

  // Полоса растёт по мере того, как время выходит. Пока срок не задан —
  // полосы нет: будка ничего сама не сделает, и обещать этого не надо.
  const autoPrintProgress =
    autoPrintSeconds && autoPrintSeconds > 0 && secondsLeft > 0
      ? 1 - Math.min(1, secondsLeft / autoPrintSeconds)
      : null;

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
          {/*
            Главное действие идёт первым и крупнее: гость смотрит на свой
            снимок и хочет его забрать, а не выбирать между двумя равными
            кнопками. Полоса по кнопке показывает, сколько осталось до
            того, как будка напечатает сама, — мелкая строчка внизу этого
            не сообщала, и гость не понимал, почему печать вдруг началась.
          */}
          <BigButton
            label={t.review.print}
            icon="🖨"
            accent={accent}
            onPress={onPrint}
            busy={busy}
            style={styles.primaryAction}
            {...(autoPrintProgress === null ? {} : {progress: autoPrintProgress})}
          />
          {allowRetake ? (
            <BigButton
              label={fromGallery ? t.review.pickAnother : t.review.retake}
              icon={fromGallery ? '🖼' : '↺'}
              variant="ghost"
              weight="secondary"
              onPress={onRetake}
              disabled={busy}
            />
          ) : null}
        </View>

        {/* Словами — для тех, кто полосу не заметил. */}
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
    ...fonts.script,
    fontSize: typography.title,
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
    // В столбец, а не в строку: на телефоне две кнопки в строку не
    // помещались и переносились, становясь визуально равными.
    alignItems: 'center',
    gap: spacing.md,
    alignSelf: 'stretch',
    paddingHorizontal: spacing.lg,
  },
  primaryAction: {
    alignSelf: 'stretch',
  },
  timer: {
    fontSize: typography.body,
    color: palette.textMuted,
    height: typography.body + 8,
  },
});
