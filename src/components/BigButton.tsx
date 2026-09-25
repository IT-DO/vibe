/**
 * Главная кнопка киоска.
 *
 * Размер — не украшение: в неё целится человек, который стоит в полутора
 * метрах и держит бокал. Минимальная высота 120 pt и ширина 320 pt взяты
 * из этого, а не из вкусовых соображений.
 *
 * Три вещи, которые кнопка обязана делать и о которых легко забыть:
 *
 *  - **показывать подпись целиком.** «Выбрать готовое фото» в одну строку
 *    на телефоне не помещалось и обрывалось многоточием: «Выбрать
 *    готово…». Подпись переносится по словам на две строки;
 *  - **различаться по важности.** На экране два действия, и главное из них
 *    должно быть заметно крупнее — иначе гость выбирает наугад;
 *  - **показывать, что будка вот-вот решит сама.** Через двадцать секунд
 *    бездействия лист уходит в печать. Мелкая серая строчка внизу об этом
 *    не говорит — говорит полоса, растущая по самой кнопке.
 */

import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';

import {fonts, palette, radius, spacing, touch, typography} from '../theme/theme';

export interface BigButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  /** `primary` — акцентная заливка, `ghost` — только контур. */
  readonly variant?: 'primary' | 'ghost' | 'danger';
  /**
   * Вес действия. `secondary` ниже и уже: рядом с главным действием оно
   * должно читаться как запасное, а не как равный выбор.
   */
  readonly weight?: 'primary' | 'secondary';
  readonly accent?: string;
  readonly disabled?: boolean;
  readonly busy?: boolean;
  readonly icon?: string;
  /**
   * Доля заполнения, 0…1 — сколько осталось до того, как действие
   * произойдёт само. Видно как полоса по кнопке.
   */
  readonly progress?: number;
  readonly style?: ViewStyle;
  readonly testID?: string;
}

export function BigButton({
  label,
  onPress,
  variant = 'primary',
  weight = 'primary',
  accent = palette.accent,
  disabled = false,
  busy = false,
  icon,
  progress,
  style,
  testID,
}: BigButtonProps) {
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';
  const background = isPrimary ? accent : isDanger ? palette.danger : 'transparent';
  const border = isPrimary || isDanger ? background : palette.textMuted;
  const secondary = weight === 'secondary';

  const fill = progress === undefined ? null : Math.max(0, Math.min(1, progress));

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{disabled: disabled || busy, busy}}
      disabled={disabled || busy}
      onPress={onPress}
      style={({pressed}) => [
        styles.button,
        secondary && styles.secondary,
        {
          backgroundColor: background,
          borderColor: border,
          opacity: disabled ? 0.4 : pressed ? 0.82 : 1,
          // Лёгкое «вдавливание» — единственная обратная связь, которую
          // человек замечает, не глядя на экран в упор.
          transform: [{scale: pressed ? 0.97 : 1}],
        },
        style,
      ]}>
      {/*
        Полоса обратного отсчёта лежит под подписью и не перехватывает
        нажатия: это указатель, а не элемент управления.
      */}
      {fill !== null && !busy ? (
        <View
          pointerEvents="none"
          testID={testID ? `${testID}-отсчёт` : undefined}
          style={[
            styles.progress,
            {
              width: `${fill * 100}%`,
              backgroundColor: isPrimary || isDanger ? palette.accentText : accent,
            },
          ]}
        />
      ) : null}

      {busy ? (
        <ActivityIndicator color={isPrimary ? palette.accentText : accent} size="large" />
      ) : (
        <View style={styles.content}>
          {icon ? <Text style={[styles.icon, secondary && styles.iconSecondary]}>{icon}</Text> : null}
          <Text
            // Две строки вместо одной: длинная подпись переносится по
            // словам, а не обрывается многоточием на середине.
            numberOfLines={2}
            style={[
              styles.label,
              secondary && styles.labelSecondary,
              {color: isPrimary || isDanger ? palette.accentText : palette.text},
            ]}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: touch.primaryHeight,
    minWidth: touch.primaryMinWidth,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    // Полоса отсчёта скруглена вместе с кнопкой.
    overflow: 'hidden',
  },
  secondary: {
    minHeight: Math.round(touch.primaryHeight * 0.7),
    minWidth: Math.round(touch.primaryMinWidth * 0.62),
    paddingHorizontal: spacing.lg,
  },
  progress: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    opacity: 0.22,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  icon: {
    fontSize: typography.button,
  },
  iconSecondary: {
    fontSize: typography.body,
  },
  label: {
    // Антиква вместо системного гротеска: кегль кнопки крупный (32 pt на
    // планшете), на нём она читается мгновенно и держит общий вид будки.
    // `fontWeight` не задаём — начертание уже жирное, а синтетическая
    // жирность поверх настоящей портит рисунок букв на Android.
    ...fonts.display,
    fontSize: typography.button,
    textAlign: 'center',
    flexShrink: 1,
  },
  labelSecondary: {
    fontSize: typography.body,
  },
});
