/**
 * Админка оператора.
 *
 * Задача этого экрана — чтобы человек, который первый раз видит будку за
 * пятнадцать минут до начала мероприятия, успел её настроить. Отсюда порядок
 * разделов: сперва принтер (без него ничего не работает), потом оформление,
 * потом тонкости сценария. Очередь и статистика — внизу, они нужны уже по ходу.
 */

import React, {useCallback, useEffect, useState} from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {AdminButton, Choice, Field, MultiChoice, Row, Section, Toggle} from './controls';
import {BluetoothScan} from './BluetoothScan';
import {PinGate} from './PinGate';
import {activeTransport, printQueue} from '../../app/services';
import {describePrinterState, stringsFor} from '../../i18n/strings';
import {LAYOUTS, type LayoutId} from '../../imaging/layouts';
import {clearCrashLog, readCrashLog} from '../../platform/crashlog';
import {flushTrace, setTraceEnabled} from '../../platform/trace';
import {countEntries, lastEntries, tailForSharing} from '../../utils/crashlog-format';
import {purgeAll, usedBytes} from '../../platform/files';
import {enterKioskMode, exitKioskMode, supportsLockTask} from '../../platform/kiosk';
import type {QueueSnapshot} from '../../printing/queue';
import {useSettings} from '../../store/settings';
import {useStats} from '../../store/stats';
import {palette, radius, spacing, typography} from '../../theme/theme';

export interface AdminScreenProps {
  readonly onClose: () => void;
}

export function AdminScreen({onClose}: AdminScreenProps) {
  const settings = useSettings(s => s.settings);
  const store = useSettings();
  const stats = useStats();

  const [unlocked, setUnlocked] = useState(false);
  const [queue, setQueue] = useState<QueueSnapshot>(() => printQueue.snapshot());
  const [disk, setDisk] = useState(0);
  const [kioskHint, setKioskHint] = useState<string | null>(null);
  const [crashLog, setCrashLog] = useState('');

  const t = stringsFor(settings.locale).admin;

  useEffect(() => printQueue.subscribe(setQueue), []);

  useEffect(() => {
    if (!unlocked) {
      return;
    }
    void usedBytes().then(setDisk);
    void flushTrace().then(() => readCrashLog().then(setCrashLog));
  }, [unlocked]);

  const confirmPurge = useCallback(() => {
    Alert.alert(t.purge!, t.purgeConfirm!, [
      {text: 'Отмена', style: 'cancel'},
      {
        text: t.purge!,
        style: 'destructive',
        onPress: () => {
          void purgeAll().then(() => usedBytes().then(setDisk));
        },
      },
    ]);
  }, [t]);

  if (!unlocked) {
    return (
      <Modal visible animationType="fade" onRequestClose={onClose}>
        <PinGate
          expectedPin={settings.adminPin}
          onUnlock={() => setUnlocked(true)}
          onCancel={onClose}
          title={t.pin!}
          wrongPinLabel={t.wrongPin!}
        />
      </Modal>
    );
  }

  const printerStatus = queue.printer;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t.title}</Text>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.close}>
            <Text style={styles.closeLabel}>{t.close}</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Section title={t.printer!}>
            <Row
              label="Состояние"
              value={
                printerStatus
                  ? printerStatus.health === 'ready'
                    ? 'Готов'
                    : describePrinterState(printerStatus.blockingReason, settings.locale)
                  : '—'
              }
            />
            <Row label="Подключён" value={settings.printer.displayName || 'не выбран'} />
            <Row label="Адрес" value={settings.printer.bluetoothAddress || '—'} />
            {printerStatus?.suppliesPercent !== undefined ? (
              <Row label={t.ribbonLeft!} value={`${printerStatus.suppliesPercent} %`} />
            ) : null}

            {/*
              Формат не выбирают: принтер печатает на карманной бумаге ZINK
              50 × 76 мм и другой не принимает. Строка вместо переключателя —
              оператору всё равно надо знать размер, чтобы не купить не ту
              пачку бумаги.
            */}
            <Row label="Формат бумаги" value="5 × 7,6 см (ZINK 2×3″)" />
            <Choice
              label="Копий"
              value={String(settings.printer.copies)}
              onChange={value => store.updatePrinter({copies: Number(value)})}
              options={[
                {value: '1', label: '1'},
                {value: '2', label: '2'},
                {value: '3', label: '3'},
              ]}
            />

          </Section>

          <Section title={t.event!}>
            <Field
              label="Название"
              value={settings.event.title}
              onChange={title => store.updateEvent({title})}
              placeholder="Свадьба Ани и Пети"
            />
            <Field
              label="Подпись"
              value={settings.event.subtitle}
              onChange={subtitle => store.updateEvent({subtitle})}
              placeholder="12 сентября 2026"
            />
            <Field
              label="Акцентный цвет"
              value={settings.event.accent}
              onChange={accent => store.updateEvent({accent})}
              placeholder="#FF5A5F"
            />
            <Field
              label="Логотип (путь)"
              value={settings.event.logoPath}
              onChange={logoPath => store.updateEvent({logoPath})}
            />
            <Field
              label="Рамка PNG (путь)"
              value={settings.framePath}
              onChange={store.setFramePath}
            />
            <Choice
              label="Язык"
              value={settings.locale}
              onChange={store.setLocale}
              options={[
                {value: 'ru', label: 'Русский'},
                {value: 'en', label: 'English'},
              ]}
            />
          </Section>

          <Section title={t.layouts!}>
            <MultiChoice<LayoutId>
              label="Доступные форматы"
              values={settings.flow.layouts}
              onChange={layouts => store.updateFlow({layouts})}
              options={LAYOUTS.map(l => ({
                value: l.id,
                label: layoutLabel(l.id, settings.locale),
              }))}
            />
            <Choice
              label="Камера"
              value={settings.capture.camera}
              onChange={camera => store.updateCapture({camera})}
              options={[
                {value: 'front', label: 'Фронтальная'},
                {value: 'back', label: 'Основная'},
              ]}
            />
            <Choice
              label="Обратный отсчёт"
              value={String(settings.capture.countdownSeconds)}
              onChange={value => store.updateCapture({countdownSeconds: Number(value)})}
              options={[
                {value: '3', label: '3 с'},
                {value: '5', label: '5 с'},
                {value: '10', label: '10 с'},
              ]}
            />
            <Toggle
              label="Зеркалить превью"
              value={settings.capture.mirrorPreview}
              onChange={mirrorPreview => store.updateCapture({mirrorPreview})}
            />
            <Toggle
              label="Печатать зеркально"
              value={settings.capture.mirrorPrint}
              onChange={mirrorPrint => store.updateCapture({mirrorPrint})}
            />
            <Toggle
              label="Разрешить пересъёмку"
              value={settings.flow.allowRetake}
              onChange={allowRetake => store.updateFlow({allowRetake})}
            />
            <Toggle
              label="Печатать при бездействии"
              value={settings.flow.autoPrintOnTimeout}
              onChange={autoPrintOnTimeout => store.updateFlow({autoPrintOnTimeout})}
            />
            <Choice
              label="Время на просмотр"
              value={String(settings.flow.reviewTimeoutMs)}
              onChange={value => store.updateFlow({reviewTimeoutMs: Number(value)})}
              options={[
                {value: '10000', label: '10 с'},
                {value: '20000', label: '20 с'},
                {value: '40000', label: '40 с'},
              ]}
            />
          </Section>

          <Section title={t.queue!}>
            <Row label="В очереди" value={String(queue.pending)} />
            {queue.paused ? (
              <Row
                label="Пауза"
                value={describePrinterState(queue.pausedReason, settings.locale)}
              />
            ) : null}
            {queue.jobs.slice(0, 8).map(job => (
              <View key={job.id} style={styles.jobRow}>
                <View style={styles.printerInfo}>
                  <Text style={styles.printerName}>{job.name}</Text>
                  <Text style={styles.printerMeta}>
                    {jobStateLabel(job.state)}
                    {job.attempts > 1 ? ` · попытка ${job.attempts}` : ''}
                    {job.error ? ` · ${job.error}` : ''}
                  </Text>
                </View>
                {job.state === 'failed' ? (
                  <AdminButton label="Повторить" onPress={() => void printQueue.retry(job.id)} />
                ) : job.state !== 'done' ? (
                  <AdminButton
                    label="Отменить"
                    tone="danger"
                    onPress={() => void printQueue.cancel(job.id)}
                  />
                ) : null}
              </View>
            ))}
          </Section>

          <Section title={t.stats!}>
            <Row label={t.printedTotal!} value={String(stats.stats.printed)} />
            <Row label="Сессий" value={String(stats.stats.sessions)} />
            <Row label="Пересъёмок" value={String(stats.stats.retakes)} />
            <Row label="Ошибок" value={String(stats.stats.failed)} />
            <Row label={t.storageUsed!} value={`${(disk / 1e6).toFixed(1)} МБ`} />
            <View style={styles.buttonRow}>
              <AdminButton label="Сбросить счётчики" onPress={stats.resetEvent} />
              <AdminButton label={t.purge!} tone="danger" onPress={confirmPurge} />
            </View>
          </Section>

          {/*
            Журнал ошибок. Нужен затем, чтобы не просить человека снимать
            logcat через компьютер: приложение записывает сбои само, а
            отправить их можно одной кнопкой.
          */}
          <Section title="Журнал ошибок">
            {crashLog ? (
              <>
                <Row label="Записей" value={`${countEntries(crashLog)}`} />
                <View style={styles.logBox}>
                  <ScrollView nestedScrollEnabled style={styles.logScroll}>
                    <Text style={styles.logText} selectable>
                      {lastEntries(crashLog, 3)}
                    </Text>
                  </ScrollView>
                </View>
                <View style={styles.buttonRow}>
                  <AdminButton
                    label="Поделиться"
                    tone="accent"
                    onPress={() => {
                      void Share.share({
                        title: 'Журнал ошибок «Фото на память»',
                        message: tailForSharing(crashLog),
                      });
                    }}
                  />
                  <AdminButton
                    label="Очистить"
                    onPress={() => {
                      void clearCrashLog().then(() => setCrashLog(''));
                    }}
                  />
                </View>
              </>
            ) : (
              <Row label="" value="Сбоев не записано" />
            )}
          </Section>

          <BluetoothScan />

          <Section title={t.diagnostics!}>
            <Row label="Транспорт" value={activeTransport().label} />
            <Row
              label="Отслеживание заданий"
              value={activeTransport().canTrackJobs ? 'да' : 'нет'}
            />
            {/*
              Подробная запись. На мероприятии она не нужна и только копит
              файл, а когда что-то не работает — это единственный способ
              увидеть, до какого шага дошло дело, не подключая компьютер.
            */}
            <Toggle
              label="Отладка: писать каждый шаг"
              value={settings.verboseLog}
              onChange={on => {
                store.setVerboseLog(on);
                setTraceEnabled(on);
                // Журнал перечитываем сразу: оператор включил отладку и
                // должен увидеть, что она заработала.
                void flushTrace().then(() => readCrashLog().then(setCrashLog));
              }}
            />
            <Toggle
              label="Хранить копии отпечатков"
              value={settings.privacy.keepArchive}
              onChange={keepArchive => store.updatePrivacy({keepArchive})}
            />
            <Toggle
              label="QR цифровой копии"
              value={settings.privacy.showDigitalCopyQr}
              onChange={showDigitalCopyQr => store.updatePrivacy({showDigitalCopyQr})}
            />
            <Field
              label="Адрес для QR"
              value={settings.privacy.digitalCopyBaseUrl}
              onChange={digitalCopyBaseUrl => store.updatePrivacy({digitalCopyBaseUrl})}
              placeholder="https://..."
            />
            <Field
              label={t.pin!}
              value={settings.adminPin}
              onChange={store.setAdminPin}
              keyboardType="number-pad"
            />
            {/*
              Киоск-режим включается только отсюда и только вручную.
              Раньше приложение закрепляло себя при запуске, и на личном
              телефоне это выглядело как «телефон заблокировался».
            */}
            <View style={styles.buttonRow}>
              <AdminButton
                label="Включить киоск-режим"
                tone="accent"
                onPress={() => {
                  void enterKioskMode().then(result => {
                    setKioskHint(
                      result.locked
                        ? 'Приложение закреплено на экране'
                        : result.hint === 'ios-guided-access-required'
                          ? 'Включите Гид-доступ: тройное нажатие боковой кнопки'
                          : 'Устройство не разрешило закрепление — см. docs/KIOSK-SETUP.md',
                    );
                  });
                }}
              />
              <AdminButton
                label={t.exitKiosk!}
                onPress={() => {
                  void exitKioskMode().then(() => setKioskHint(null));
                  onClose();
                }}
              />
            </View>
            {kioskHint ? <Row label="" value={kioskHint} /> : null}
            {!supportsLockTask ? (
              <Row
                label=""
                value="На iOS киоск включается «Гид-доступом»: тройное нажатие боковой кнопки"
              />
            ) : null}
          </Section>
        </ScrollView>
      </View>
    </Modal>
  );
}

/**
 * Адрес принтера — тот, который имеет смысл для выбранного канала.
 *
 * У Bluetooth это MAC-адрес, у сетевой печати — хост с портом. Показывать
 * пустой прочерк рядом с работающим принтером нельзя: оператор решит, что
 * тот не настроен, и пойдёт настраивать заново.
 */
export function endpointLabel(settings: {
  printer: {
    transport: string;
    bluetoothAddress: string;
    endpoint: {host: string; port: number; path: string} | null;
  };
}): string {
  if (settings.printer.transport === 'bluetooth') {
    return settings.printer.bluetoothAddress || '—';
  }
  const e = settings.printer.endpoint;
  return e ? `${e.host}:${e.port}${e.path}` : '—';
}


function jobStateLabel(state: string): string {
  switch (state) {
    case 'queued':
      return 'в очереди';
    case 'sending':
      return 'отправляется';
    case 'printing':
      return 'печатается';
    case 'done':
      return 'напечатано';
    case 'failed':
      return 'ошибка';
    default:
      return state;
  }
}

function layoutLabel(id: LayoutId, locale: 'ru' | 'en'): string {
  const t = stringsFor(locale).layout;
  switch (id) {
    case 'single':
      return t.single;
    case 'polaroid':
      return t.polaroid;
    case 'duo':
      return t.duo;
  }
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: palette.background},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.surfaceRaised,
  },
  headerTitle: {color: palette.text, fontSize: typography.heading, fontWeight: '700'},
  close: {padding: spacing.sm},
  closeLabel: {color: palette.accent, fontSize: typography.admin + 3, fontWeight: '600'},
  content: {padding: spacing.md, paddingBottom: spacing.xxl},
  buttonRow: {flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.sm},
  printerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    gap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.surfaceRaised,
  },
  printerInfo: {flex: 1, gap: 2},
  printerName: {color: palette.text, fontSize: typography.admin + 2, fontWeight: '600'},
  printerMeta: {color: palette.textMuted, fontSize: typography.admin - 1},
  printerPick: {
    color: palette.accent,
    fontSize: typography.admin,
    fontWeight: '700',
    paddingHorizontal: spacing.sm,
  },
  logBox: {
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceRaised,
    marginVertical: spacing.sm,
  },
  logScroll: {
    maxHeight: 220,
    padding: spacing.sm,
  },
  logText: {
    color: palette.textMuted,
    fontSize: typography.admin - 3,
    fontFamily: 'monospace',
  },
  jobRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.surfaceRaised,
    borderRadius: radius.sm,
  },
});
