/**
 * Мелкие элементы админки.
 *
 * Здесь, в отличие от экрана гостя, плотность важнее размера: оператор стоит
 * вплотную, часто торопится и хочет видеть максимум на одном экране.
 */

import React from 'react';
import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from 'react-native';

import {palette, radius, spacing, typography} from '../../theme/theme';

export function Section({title, children}: {title: string; children: React.ReactNode}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

export function Row({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowControl}>
        {value !== undefined ? <Text style={styles.rowValue}>{value}</Text> : null}
        {children}
      </View>
    </View>
  );
}

export function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <Row label={label}>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{true: palette.accent, false: palette.surfaceRaised}}
        accessibilityLabel={label}
      />
    </Row>
  );
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboardType = 'default',
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
}) {
  return (
    <Row label={label}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder ?? ''}
        placeholderTextColor={palette.textMuted}
        keyboardType={keyboardType}
        style={styles.input}
        accessibilityLabel={label}
      />
    </Row>
  );
}

/** Переключатель из нескольких взаимоисключающих вариантов. */
export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly {readonly value: T; readonly label: string}[];
  onChange: (next: T) => void;
}) {
  return (
    <Row label={label}>
      <View style={styles.choiceRow}>
        {options.map(option => (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{selected: option.value === value}}
            onPress={() => onChange(option.value)}
            style={[
              styles.chip,
              option.value === value ? styles.chipActive : null,
            ]}>
            <Text
              style={[
                styles.chipLabel,
                option.value === value ? styles.chipLabelActive : null,
              ]}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </Row>
  );
}

/** Набор независимых переключателей (например, включённые форматы). */
export function MultiChoice<T extends string>({
  label,
  values,
  options,
  onChange,
}: {
  label: string;
  values: readonly T[];
  options: readonly {readonly value: T; readonly label: string}[];
  onChange: (next: T[]) => void;
}) {
  const toggle = (option: T) => {
    const next = values.includes(option)
      ? values.filter(v => v !== option)
      : [...values, option];
    // Хотя бы один формат должен остаться включённым, иначе гостю нечего
    // выбирать и сценарий обрывается на первом же шаге.
    if (next.length > 0) {
      onChange(next);
    }
  };

  return (
    <Row label={label}>
      <View style={styles.choiceRow}>
        {options.map(option => (
          <Pressable
            key={option.value}
            accessibilityRole="checkbox"
            accessibilityState={{checked: values.includes(option.value)}}
            onPress={() => toggle(option.value)}
            style={[
              styles.chip,
              values.includes(option.value) ? styles.chipActive : null,
            ]}>
            <Text
              style={[
                styles.chipLabel,
                values.includes(option.value) ? styles.chipLabelActive : null,
              ]}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </Row>
  );
}

export function AdminButton({
  label,
  onPress,
  tone = 'normal',
  busy = false,
}: {
  label: string;
  onPress: () => void;
  tone?: 'normal' | 'danger' | 'accent';
  busy?: boolean;
}) {
  const color =
    tone === 'danger' ? palette.danger : tone === 'accent' ? palette.accent : palette.surfaceRaised;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={busy}
      onPress={onPress}
      style={({pressed}) => [
        styles.button,
        {backgroundColor: color, opacity: busy ? 0.5 : pressed ? 0.8 : 1},
      ]}>
      <Text style={styles.buttonLabel}>{busy ? '…' : label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: {marginBottom: spacing.lg},
  sectionTitle: {
    color: palette.textMuted,
    fontSize: typography.admin,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  sectionBody: {
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.surfaceRaised,
  },
  rowLabel: {color: palette.text, fontSize: typography.admin + 2, flexShrink: 1},
  rowControl: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  rowValue: {color: palette.textMuted, fontSize: typography.admin},
  input: {
    minWidth: 200,
    color: palette.text,
    fontSize: typography.admin + 1,
    backgroundColor: palette.surfaceRaised,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  choiceRow: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, maxWidth: 460},
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: palette.surfaceRaised,
  },
  chipActive: {backgroundColor: palette.accent},
  chipLabel: {color: palette.textMuted, fontSize: typography.admin},
  chipLabelActive: {color: palette.accentText, fontWeight: '700'},
  button: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
    minWidth: 120,
  },
  buttonLabel: {color: palette.text, fontSize: typography.admin + 1, fontWeight: '600'},
});
