/**
 * ПИН на входе в админку.
 *
 * Защита здесь не от взлома, а от любопытства: цель — чтобы гость, случайно
 * нащупавший скрытый угол, не попал в настройки принтера. Поэтому четыре
 * цифры и никакого усложнения.
 */

import React, {useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {palette, radius, spacing, typography} from '../../theme/theme';

export interface PinGateProps {
  readonly expectedPin: string;
  readonly onUnlock: () => void;
  readonly onCancel: () => void;
  readonly title: string;
  readonly wrongPinLabel: string;
}

export function PinGate({
  expectedPin,
  onUnlock,
  onCancel,
  title,
  wrongPinLabel,
}: PinGateProps) {
  const [entered, setEntered] = useState('');
  const [wrong, setWrong] = useState(false);

  const press = (digit: string) => {
    setWrong(false);

    const next = entered + digit;
    if (next.length < expectedPin.length) {
      setEntered(next);
      return;
    }

    // Код набран целиком. Набранное стираем в любом случае — и при верном
    // коде тоже: иначе полный код остаётся в состоянии, и следующее касание
    // цифры снова его «подтверждает». Экран после ввода всегда чистый.
    setEntered('');
    if (next === expectedPin) {
      onUnlock();
    } else {
      setWrong(true);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>

      <View style={styles.dots}>
        {Array.from({length: expectedPin.length}, (_, i) => (
          <View
            key={i}
            style={[styles.dot, i < entered.length ? styles.dotFilled : null]}
          />
        ))}
      </View>

      {wrong ? <Text style={styles.wrong}>{wrongPinLabel}</Text> : <View style={styles.wrongSpace} />}

      <View style={styles.pad}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(digit => (
          <PadKey key={digit} label={digit} onPress={() => press(digit)} />
        ))}
        <PadKey label="✕" onPress={onCancel} />
        <PadKey label="0" onPress={() => press('0')} />
        <PadKey label="⌫" onPress={() => setEntered(entered.slice(0, -1))} />
      </View>
    </View>
  );
}

function PadKey({label, onPress}: {label: string; onPress: () => void}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({pressed}) => [styles.key, pressed ? styles.keyPressed : null]}>
      <Text style={styles.keyLabel}>{label}</Text>
    </Pressable>
  );
}

const KEY_SIZE = 92;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: palette.background,
  },
  title: {
    fontSize: typography.heading,
    color: palette.text,
    fontWeight: '700',
  },
  dots: {flexDirection: 'row', gap: spacing.md, marginVertical: spacing.md},
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: palette.textMuted,
  },
  dotFilled: {backgroundColor: palette.text, borderColor: palette.text},
  wrong: {color: palette.danger, fontSize: typography.caption, height: 24},
  wrongSpace: {height: 24},
  pad: {
    width: KEY_SIZE * 3 + spacing.md * 2,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  key: {
    width: KEY_SIZE,
    height: KEY_SIZE,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyPressed: {backgroundColor: palette.surfaceRaised},
  keyLabel: {fontSize: typography.heading, color: palette.text, fontWeight: '600'},
});
