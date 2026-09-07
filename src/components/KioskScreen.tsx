/**
 * Общая обёртка экранов киоска: тёмный фон, безопасные отступы и невидимая
 * зона входа в админку.
 *
 * Вход спрятан намеренно: кнопка «Настройки» на виду — это приглашение
 * потыкать в неё для любого гостя. Здесь нужно удерживать угол пять секунд,
 * что случайно не выходит, а оператор запоминает с первого раза.
 */

import React, {useRef} from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {palette} from '../theme/theme';

/** Сколько держать угол, чтобы открылась админка. */
export const ADMIN_HOLD_MS = 5_000;

export interface KioskScreenProps {
  readonly children: React.ReactNode;
  /** Вызывается после удержания скрытой зоны. */
  readonly onSecretHold?: () => void;
  readonly backgroundColor?: string;
  readonly style?: StyleProp<ViewStyle>;
  /** Касание в любом месте экрана — используется на заставке. */
  readonly onPressAnywhere?: () => void;
}

export function KioskScreen({
  children,
  onSecretHold,
  backgroundColor = palette.background,
  style,
  onPressAnywhere,
}: KioskScreenProps) {
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startHold = () => {
    if (!onSecretHold) {
      return;
    }
    holdTimer.current = setTimeout(onSecretHold, ADMIN_HOLD_MS);
  };

  const cancelHold = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  const content = (
    <SafeAreaView style={[styles.safe, {backgroundColor}, style]}>
      {children}
      {onSecretHold ? (
        // Зона входа в админку: верхний левый угол, полностью прозрачна.
        <Pressable
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.secretCorner}
          onPressIn={startHold}
          onPressOut={cancelHold}
        />
      ) : null}
    </SafeAreaView>
  );

  if (!onPressAnywhere) {
    return content;
  }

  return (
    <Pressable style={styles.fill} onPress={onPressAnywhere} accessibilityRole="button">
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: {flex: 1},
  safe: {flex: 1},
  secretCorner: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 110,
    height: 110,
  },
});

export {View};
