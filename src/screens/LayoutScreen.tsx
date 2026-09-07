/**
 * Выбор формата отпечатка.
 *
 * Единственный экран, где гость что-то решает, поэтому вариантов немного и
 * каждый показан схемой, а не описан словами: разглядывать текст в очереди
 * никто не будет. Экран пропускается, если в настройках оставлен один формат.
 */

import React from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';

import {KioskScreen} from '../components/KioskScreen';
import {stringsFor, type Locale} from '../i18n/strings';
import {layoutById, type LayoutId} from '../imaging/layouts';
import {palette, radius, spacing, typography} from '../theme/theme';

export interface LayoutScreenProps {
  readonly locale: Locale;
  readonly accent: string;
  readonly layouts: readonly LayoutId[];
  readonly secondsLeft: number;
  readonly onChoose: (layoutId: LayoutId) => void;
  readonly onCancel: () => void;
}

export function LayoutScreen({
  locale,
  accent,
  layouts,
  secondsLeft,
  onChoose,
  onCancel,
}: LayoutScreenProps) {
  const t = stringsFor(locale);

  return (
    <KioskScreen>
      <View style={styles.container}>
        <Text style={styles.title}>{t.layout.choose}</Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}>
          {layouts.map(id => {
            const layout = layoutById(id);
            return (
              <Pressable
                key={id}
                accessibilityRole="button"
                accessibilityLabel={labelFor(id, locale)}
                onPress={() => onChoose(id)}
                style={({pressed}) => [
                  styles.card,
                  {borderColor: pressed ? accent : palette.surfaceRaised},
                ]}>
                <LayoutThumbnail layoutId={id} accent={accent} />
                <Text style={styles.cardTitle}>{labelFor(id, locale)}</Text>
                <Text style={styles.cardMeta}>{t.layout.shots(layout.shots)}</Text>
                {id === 'twinStrip3' ? (
                  <Text style={styles.cardHint}>{t.layout.tearHint}</Text>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.footer}>
          <Text style={styles.timer}>{secondsLeft > 0 ? `${secondsLeft}` : ''}</Text>
          <Text accessibilityRole="button" onPress={onCancel} style={styles.cancel}>
            {t.getReady.cancel}
          </Text>
        </View>
      </View>
    </KioskScreen>
  );
}

/** Схема раскладки: рисуем прямоугольниками, без картинок в ассетах. */
function LayoutThumbnail({layoutId, accent}: {layoutId: LayoutId; accent: string}) {
  const cellStyle = [styles.thumbCell, {backgroundColor: accent}];

  switch (layoutId) {
    case 'twinStrip3':
      return (
        <View style={styles.thumb}>
          {[0, 1].map(half => (
            <View key={half} style={styles.thumbHalf}>
              {[0, 1, 2].map(i => (
                <View key={i} style={[cellStyle, styles.thumbStripCell]} />
              ))}
            </View>
          ))}
        </View>
      );
    case 'grid4':
      return (
        <View style={[styles.thumb, styles.thumbGrid]}>
          {[0, 1, 2, 3].map(i => (
            <View key={i} style={[cellStyle, styles.thumbGridCell]} />
          ))}
        </View>
      );
    case 'duo':
      return (
        <View style={styles.thumb}>
          <View style={styles.thumbColumn}>
            {[0, 1].map(i => (
              <View key={i} style={[cellStyle, styles.thumbDuoCell]} />
            ))}
          </View>
        </View>
      );
    case 'polaroid':
      return (
        <View style={styles.thumb}>
          <View style={[cellStyle, styles.thumbPolaroidCell]} />
          <View style={styles.thumbPolaroidCaption} />
        </View>
      );
    case 'single':
    default:
      return (
        <View style={styles.thumb}>
          <View style={[cellStyle, styles.thumbFull]} />
        </View>
      );
  }
}

function labelFor(id: LayoutId, locale: Locale): string {
  const t = stringsFor(locale).layout;
  switch (id) {
    case 'single':
      return t.single;
    case 'twinStrip3':
      return t.twinStrip3;
    case 'grid4':
      return t.grid4;
    case 'polaroid':
      return t.polaroid;
    case 'duo':
      return t.duo;
  }
}

const THUMB_WIDTH = 180;
const THUMB_HEIGHT = 270; // пропорция листа 10×15

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingVertical: spacing.xl,
    justifyContent: 'space-between',
  },
  title: {
    fontSize: typography.title,
    fontWeight: '800',
    color: palette.text,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  row: {
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
    alignItems: 'center',
  },
  card: {
    width: THUMB_WIDTH + spacing.lg * 2,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 3,
    backgroundColor: palette.surface,
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardTitle: {
    fontSize: typography.body,
    fontWeight: '700',
    color: palette.text,
    textAlign: 'center',
  },
  cardMeta: {
    fontSize: typography.caption,
    color: palette.textMuted,
  },
  cardHint: {
    fontSize: typography.caption - 3,
    color: palette.textMuted,
    textAlign: 'center',
  },
  thumb: {
    width: THUMB_WIDTH,
    height: THUMB_HEIGHT,
    backgroundColor: palette.surfaceRaised,
    borderRadius: radius.sm,
    padding: 8,
    flexDirection: 'row',
    gap: 6,
  },
  thumbHalf: {flex: 1, gap: 6},
  thumbColumn: {flex: 1, gap: 6},
  thumbGrid: {flexWrap: 'wrap'},
  thumbCell: {borderRadius: 4, opacity: 0.85},
  thumbStripCell: {flex: 1},
  thumbGridCell: {width: '48%', height: '48%'},
  thumbDuoCell: {flex: 1},
  thumbFull: {flex: 1},
  thumbPolaroidCell: {flex: 1, marginBottom: 4},
  thumbPolaroidCaption: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    height: 46,
    backgroundColor: palette.surface,
    borderRadius: 4,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
  },
  timer: {
    fontSize: typography.body,
    color: palette.textMuted,
    minWidth: 60,
  },
  cancel: {
    fontSize: typography.body,
    color: palette.textMuted,
    padding: spacing.md,
  },
});
