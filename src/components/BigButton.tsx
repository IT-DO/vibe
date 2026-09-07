/**
 * Главная кнопка киоска.
 *
 * Размер — не украшение: в неё целится человек, который стоит в полутора
 * метрах и держит бокал. Минимальная высота 120 pt и ширина 320 pt взяты
 * из этого, а не из вкусовых соображений.
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

import {palette, radius, spacing, touch, typography} from '../theme/theme';

export interface BigButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  /** `primary` — акцентная заливка, `ghost` — только контур. */
  readonly variant?: 'primary' | 'ghost' | 'danger';
  readonly accent?: string;
  readonly disabled?: boolean;
  readonly busy?: boolean;
  readonly icon?: string;
  readonly style?: ViewStyle;
  readonly testID?: string;
}

export function BigButton({
  label,
  onPress,
  variant = 'primary',
  accent = palette.accent,
  disabled = false,
  busy = false,
  icon,
  style,
  testID,
}: BigButtonProps) {
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';
  const background = isPrimary ? accent : isDanger ? palette.danger : 'transparent';
  const border = isPrimary || isDanger ? background : palette.textMuted;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{disabled: disabled || busy}}
      disabled={disabled || busy}
      onPress={onPress}
      style={({pressed}) => [
        styles.button,
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
      {busy ? (
        <ActivityIndicator color={isPrimary ? palette.accentText : accent} size="large" />
      ) : (
        <View style={styles.content}>
          {icon ? <Text style={styles.icon}>{icon}</Text> : null}
          <Text
            numberOfLines={1}
            style={[styles.label, {color: isPrimary || isDanger ? palette.accentText : palette.text}]}>
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
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  icon: {
    fontSize: typography.button,
  },
  label: {
    fontSize: typography.button,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
