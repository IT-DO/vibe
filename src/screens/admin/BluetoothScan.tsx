/**
 * Разведка Bluetooth в админке.
 *
 * Принтер Xiaomi 1S печатает по закрытому протоколу поверх BLE — угадать
 * его нельзя, а разобрать можно, и начинается разбор отсюда. Экран находит
 * устройства рядом, подключается к выбранному и показывает, из чего оно
 * состоит: какие сервисы, какие характеристики, какие из них принимают
 * запись (туда уходит снимок) и какие шлют уведомления (оттуда приходит
 * состояние печати).
 *
 * Список можно отправить одной кнопкой — по нему видно, куда именно
 * приложение Xiaomi Home передаёт данные, и задача сужается с «разобрать
 * протокол» до «разобрать формат вот этой характеристики».
 */

import React, {useCallback, useState} from 'react';
import {ScrollView, Share, StyleSheet, Text, View} from 'react-native';

import {AdminButton, Row, Section} from './controls';
import {
  describeDevice,
  isBluetoothOn,
  scanForDevices,
  type DeviceProfile,
  type FoundDevice,
} from '../../platform/bluetooth';
import {palette, radius, spacing, typography} from '../../theme/theme';

export function BluetoothScan() {
  const [devices, setDevices] = useState<FoundDevice[]>([]);
  const [profile, setProfile] = useState<DeviceProfile | null>(null);
  const [busy, setBusy] = useState<'scan' | 'connect' | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const scan = useCallback(async () => {
    setBusy('scan');
    setNote(null);
    setProfile(null);
    try {
      if (!(await isBluetoothOn())) {
        setNote('Bluetooth выключен — включите его в настройках устройства');
        return;
      }
      const found = await scanForDevices();
      setDevices(found);
      if (found.length === 0) {
        setNote('Рядом ничего не найдено. Принтер включён и не занят другим телефоном?');
      }
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'Не удалось выполнить поиск');
    } finally {
      setBusy(null);
    }
  }, []);

  const connect = useCallback(async (device: FoundDevice) => {
    setBusy('connect');
    setNote(null);
    try {
      setProfile(await describeDevice(device.id));
    } catch (error) {
      setNote(
        error instanceof Error
          ? `Не удалось подключиться: ${error.message}`
          : 'Не удалось подключиться',
      );
    } finally {
      setBusy(null);
    }
  }, []);

  return (
    <Section title="Bluetooth: разведка принтера">
      <Row
        label=""
        value="Принтер Xiaomi 1S печатает только по Bluetooth. Здесь видно, из чего он состоит — это нужно, чтобы научить приложение печатать напрямую."
      />

      <View style={styles.buttonRow}>
        <AdminButton
          label="Искать устройства"
          tone="accent"
          busy={busy === 'scan'}
          onPress={() => void scan()}
        />
      </View>

      {note ? <Row label="" value={note} /> : null}

      {devices.map(device => (
        <View key={device.id} style={styles.deviceRow}>
          <View style={styles.deviceInfo}>
            <Text style={styles.deviceName}>
              {device.name || 'без имени'}
              {device.looksLikePrinter ? ' · похоже на принтер' : ''}
            </Text>
            <Text style={styles.deviceMeta}>
              {device.id}
              {device.rssi === null ? '' : ` · сигнал ${device.rssi} дБм`}
            </Text>
          </View>
          <AdminButton
            label="Разведать"
            busy={busy === 'connect'}
            onPress={() => void connect(device)}
          />
        </View>
      ))}

      {profile ? <Profile profile={profile} /> : null}
    </Section>
  );
}

/** Состав подключённого устройства. */
function Profile({profile}: {profile: DeviceProfile}) {
  const text = describeAsText(profile);

  return (
    <>
      <Row label="Устройство" value={profile.name || profile.id} />
      <Row label="Размер пакета" value={`${profile.mtu} байт`} />
      <Row label="Сервисов" value={String(profile.services.length)} />

      <View style={styles.report}>
        <ScrollView nestedScrollEnabled style={styles.reportScroll}>
          <Text style={styles.reportText} selectable>
            {text}
          </Text>
        </ScrollView>
      </View>

      <View style={styles.buttonRow}>
        <AdminButton
          label="Отправить разработчику"
          tone="accent"
          onPress={() => {
            void Share.share({
              title: 'Состав принтера по Bluetooth',
              message: text,
            });
          }}
        />
      </View>
    </>
  );
}

/**
 * Состав устройства текстом — в таком виде его можно переслать.
 *
 * Пометки рядом с характеристиками важнее их номеров: снимок уходит в ту,
 * что принимает запись, а состояние приходит из той, что шлёт уведомления.
 */
export function describeAsText(profile: DeviceProfile): string {
  const lines: string[] = [
    `Устройство: ${profile.name || '(без имени)'}`,
    `Идентификатор: ${profile.id}`,
    `Размер пакета (MTU): ${profile.mtu}`,
    '',
  ];

  for (const service of profile.services) {
    lines.push(`Сервис ${service.uuid}`);
    if (service.characteristics.length === 0) {
      lines.push('  (характеристик нет)');
    }
    for (const c of service.characteristics) {
      const marks = [
        c.isReadable ? 'чтение' : null,
        c.isWritable ? 'ЗАПИСЬ' : null,
        c.isNotifiable ? 'уведомления' : null,
      ].filter(Boolean);
      lines.push(`  ${c.uuid} — ${marks.length > 0 ? marks.join(', ') : 'без доступа'}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

const styles = StyleSheet.create({
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
    flexWrap: 'wrap',
    marginTop: spacing.sm,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  deviceInfo: {flex: 1, gap: 2},
  deviceName: {
    color: palette.text,
    fontSize: typography.admin,
    fontWeight: '600',
  },
  deviceMeta: {
    color: palette.textMuted,
    fontSize: typography.admin - 2,
  },
  report: {
    backgroundColor: palette.background,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginTop: spacing.sm,
    maxHeight: 260,
  },
  reportScroll: {maxHeight: 244},
  reportText: {
    color: palette.textMuted,
    fontSize: typography.admin - 2,
    fontFamily: 'monospace',
  },
});
