/**
 * Индикатор принтера в углу заставки.
 *
 * Он нужен не гостю, а оператору: с другого конца зала должно быть видно,
 * что бумага кончилась, — иначе будка молча копит очередь, а очередь молча
 * расходится. Поэтому проблема показывается цветом и крупной точкой, а не
 * мелким текстом.
 */

import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {describePrinterState, type Locale} from '../i18n/strings';
import type {PrinterHealth} from '../printing/ipp/capabilities';
import {palette, radius, spacing, typography} from '../theme/theme';

export interface PrinterBadgeProps {
  readonly health: PrinterHealth;
  readonly reason?: string;
  readonly queueLength: number;
  readonly locale: Locale;
}

const HEALTH_COLOR: Record<PrinterHealth, string> = {
  ready: palette.success,
  busy: palette.warning,
  warning: palette.warning,
  blocked: palette.danger,
  unknown: palette.textMuted,
};

export function PrinterBadge({health, reason, queueLength, locale}: PrinterBadgeProps) {
  // В обычной работе значок не отвлекает: показываем его, только когда есть
  // что сказать.
  const needsAttention = health === 'blocked' || health === 'warning' || health === 'unknown';
  if (!needsAttention && queueLength === 0) {
    return null;
  }

  const text = needsAttention
    ? describePrinterState(reason, locale)
    : `${queueLength}`;

  return (
    <View style={styles.badge}>
      <View style={[styles.dot, {backgroundColor: HEALTH_COLOR[health]}]} />
      <Text style={styles.text} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: palette.surface,
    maxWidth: 420,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  text: {
    color: palette.text,
    fontSize: typography.caption,
    fontWeight: '600',
  },
});
