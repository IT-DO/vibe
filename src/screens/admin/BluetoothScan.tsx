/**
 * Выбор принтера в админке.
 *
 * Xiaomi 1S печатает только по классическому Bluetooth (профиль
 * последовательного порта), а такое соединение требует сопряжения
 * средствами системы. Поэтому здесь не поиск в эфире, а список уже
 * сопряжённых устройств: оператор один раз связывает планшет с принтером в
 * настройках Android, выбирает его тут — и дальше приложение подключается
 * само при каждой печати.
 *
 * Кнопка «Проверить связь» делает полный круг: подключается, проводит
 * рукопожатие, спрашивает модель и состояние. Если она отвечает — печать
 * заработает; если нет, видно, на каком шаге сломалось.
 */

import React, {useCallback, useEffect, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {AdminButton, Row, Section} from './controls';
import {
  connectToPrinter,
  isBluetoothOn,
  listPairedDevices,
  openBluetoothSettings,
  type PairedDevice,
} from '../../platform/bluetooth';
import {HanntoSession} from '../../printing/hannto/session';
import {useSettings} from '../../store/settings';
import {palette, spacing, typography} from '../../theme/theme';

/** Что удалось узнать у принтера при проверке связи. */
export interface PrinterCheck {
  readonly model: string;
  readonly firmware: string;
  readonly state: string;
  readonly battery: number | null;
  readonly cleanRemain: number | null;
}

export function BluetoothScan() {
  const address = useSettings(s => s.settings.printer.bluetoothAddress);
  const updatePrinter = useSettings(s => s.updatePrinter);

  const [devices, setDevices] = useState<PairedDevice[]>([]);
  const [check, setCheck] = useState<PrinterCheck | null>(null);
  const [busy, setBusy] = useState<'list' | 'check' | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setBusy('list');
    setNote(null);
    try {
      if (!(await isBluetoothOn())) {
        setNote('Bluetooth выключен — включите его в настройках устройства');
        setDevices([]);
        return;
      }
      const paired = await listPairedDevices();
      setDevices(paired);
      if (paired.length === 0) {
        setNote(
          'Сопряжённых устройств нет. Свяжите планшет с принтером в настройках Bluetooth — он подключается как обычная гарнитура.',
        );
      }
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'Не удалось получить список');
    } finally {
      setBusy(null);
    }
  }, []);

  // Список нужен сразу при открытии раздела: оператор пришёл сюда именно
  // за ним, лишнее нажатие тут ни к чему.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const verify = useCallback(async (device: PairedDevice) => {
    setBusy('check');
    setNote(null);
    setCheck(null);
    try {
      setCheck(await askPrinter(device.address));
    } catch (error) {
      setNote(
        error instanceof Error
          ? `Принтер не отвечает: ${error.message}`
          : 'Принтер не отвечает',
      );
    } finally {
      setBusy(null);
    }
  }, []);

  return (
    <Section title="Принтер по Bluetooth">
      <Row
        label=""
        value="Свяжите планшет с принтером в настройках Bluetooth, затем выберите его здесь. Приложение подключается к нему само при каждой печати."
      />

      <View style={styles.buttonRow}>
        <AdminButton
          label="Обновить список"
          tone="accent"
          busy={busy === 'list'}
          onPress={() => void refresh()}
        />
        <AdminButton label="Настройки Bluetooth" onPress={openBluetoothSettings} />
      </View>

      {note ? <Row label="" value={note} /> : null}

      {devices.map(device => {
        const chosen = device.address === address;
        return (
          <View key={device.address} style={styles.deviceRow}>
            <View style={styles.deviceInfo}>
              <Text style={styles.deviceName}>
                {device.name || 'без имени'}
                {chosen ? ' · выбран' : device.looksLikePrinter ? ' · похоже на принтер' : ''}
              </Text>
              <Text style={styles.deviceMeta}>{device.address}</Text>
            </View>
            <View style={styles.deviceActions}>
              <AdminButton
                label={chosen ? 'Выбран' : 'Выбрать'}
                tone={chosen ? 'accent' : undefined}
                onPress={() =>
                  updatePrinter({
                    transport: 'bluetooth',
                    bluetoothAddress: device.address,
                    displayName: device.name,
                  })
                }
              />
              <AdminButton
                label="Проверить связь"
                busy={busy === 'check'}
                onPress={() => void verify(device)}
              />
            </View>
          </View>
        );
      })}

      {check ? (
        <>
          <Row label="Модель" value={check.model} />
          <Row label="Прошивка" value={check.firmware} />
          <Row label="Состояние" value={describeState(check.state)} />
          <Row
            label="Заряд"
            value={check.battery === null ? 'неизвестен' : `${check.battery}%`}
          />
          <Row
            label="До чистки"
            value={
              check.cleanRemain === null
                ? 'неизвестно'
                : `${check.cleanRemain} отпечатков`
            }
          />
        </>
      ) : null}
    </Section>
  );
}

/**
 * Подключается к принтеру и спрашивает, кто он и как себя чувствует.
 *
 * Соединение закрывается сразу: занятый принтер не примет ни печать из
 * приложения, ни подключение с телефона оператора.
 */
export async function askPrinter(address: string): Promise<PrinterCheck> {
  const connection = await connectToPrinter(address);
  const session = new HanntoSession(connection, {timeoutMs: 15_000});
  try {
    await session.connect();
    const info = await session.deviceInfo();
    const status = await session.status();
    return {
      model: info.sku ?? 'неизвестна',
      firmware: info.fw_ver ?? 'неизвестна',
      state: status.category,
      battery: status['battery-level'] ?? null,
      cleanRemain: status.clean_remain ?? null,
    };
  } finally {
    session.close();
    await connection.close();
  }
}

/** Состояние принтера по-русски. */
export function describeState(state: string): string {
  switch (state) {
    case 'idle':
      return 'свободен';
    case 'processing':
      return 'печатает';
    case 'error':
      return 'неисправность';
    default:
      return state;
  }
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
  deviceActions: {flexDirection: 'row', gap: spacing.sm},
  deviceName: {
    color: palette.text,
    fontSize: typography.admin,
    fontWeight: '600',
  },
  deviceMeta: {
    color: palette.textMuted,
    fontSize: typography.admin - 2,
  },
});
