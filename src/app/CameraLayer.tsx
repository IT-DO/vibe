/**
 * Постоянный слой камеры.
 *
 * Живёт под всеми экранами и не перемонтируется: инициализация камеры
 * занимает около секунды, и делать её на каждом шаге сценария нельзя — гость
 * увидел бы чёрный экран ровно в момент, когда позирует.
 *
 * Превью зеркалим по умолчанию: планшет работает как зеркало, человек видит
 * себя привычным и сам поправляет причёску. Что уйдёт в печать — отдельная
 * настройка, потому что надписи на одежде в зеркале читаются наоборот.
 */

import React, {forwardRef, useEffect, useImperativeHandle, useRef, useState} from 'react';
import {Linking, Pressable, StyleSheet, Text, View} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  type CameraDevice,
} from 'react-native-vision-camera';

import {palette, spacing, typography} from '../theme/theme';

export interface CapturedPhoto {
  readonly path: string;
  readonly width: number;
  readonly height: number;
}

export interface CameraLayerHandle {
  /** Делает снимок; бросает исключение, если камера не готова. */
  capture(): Promise<CapturedPhoto>;
  isReady(): boolean;
}

export interface CameraLayerProps {
  readonly facing: 'front' | 'back';
  readonly mirrorPreview: boolean;
  /** Активна ли камера. На заставке — да: гость видит себя ещё на подходе. */
  readonly active: boolean;
  /** Затемнение поверх превью — чтобы текст экранов читался. */
  readonly dim: number;
}

export const CameraLayer = forwardRef<CameraLayerHandle, CameraLayerProps>(
  function CameraLayer({facing, mirrorPreview, active, dim}, ref) {
    const camera = useRef<Camera>(null);
    const device: CameraDevice | undefined = useCameraDevice(facing);
    const {hasPermission, requestPermission} = useCameraPermission();
    const [denied, setDenied] = useState(false);

    // Разрешение обязательно запрашивать в рантайме: на Android объявления
    // в манифесте недостаточно, а без запроса камера молча не включается —
    // приложение выглядит сломанным, хотя всё цело.
    useEffect(() => {
      if (hasPermission) {
        setDenied(false);
        return;
      }
      let cancelled = false;
      void requestPermission().then(granted => {
        if (!cancelled) {
          setDenied(!granted);
        }
      });
      return () => {
        cancelled = true;
      };
    }, [hasPermission, requestPermission]);

    useImperativeHandle(
      ref,
      () => ({
        isReady: () => Boolean(camera.current && device && hasPermission),
        async capture() {
          if (!camera.current) {
            throw new Error('Камера не готова');
          }
          const photo = await camera.current.takePhoto({
            // Вспышка бессмысленна: планшет стоит близко и пересветит лица.
            flash: 'off',
            enableShutterSound: false,
          });
          return {
            path: photo.path,
            width: photo.width,
            height: photo.height,
          };
        },
      }),
      [device, hasPermission],
    );

    if (!hasPermission) {
      return (
        <View style={[StyleSheet.absoluteFill, styles.placeholder]}>
          <Text style={styles.placeholderTitle}>Нужен доступ к камере</Text>
          <Text style={styles.placeholderText}>
            Без него фотобудка не сможет снимать гостей. Другие данные
            приложение не запрашивает.
          </Text>
          {denied ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void Linking.openSettings()}
              style={styles.placeholderButton}>
              <Text style={styles.placeholderButtonText}>Открыть настройки</Text>
            </Pressable>
          ) : null}
        </View>
      );
    }

    if (!device) {
      return (
        <View style={[StyleSheet.absoluteFill, styles.placeholder]}>
          <Text style={styles.placeholderTitle}>Камера не найдена</Text>
          <Text style={styles.placeholderText}>
            {facing === 'front'
              ? 'На устройстве нет фронтальной камеры. Переключите её в настройках приложения.'
              : 'На устройстве нет основной камеры. Переключите её в настройках приложения.'}
          </Text>
        </View>
      );
    }

    return (
      <View style={StyleSheet.absoluteFill}>
        <Camera
          ref={camera}
          style={[
            StyleSheet.absoluteFill,
            // Зеркалим превью средствами трансформации: `takePhoto` отдаёт
            // неотражённый кадр, и зеркалить печать мы решаем отдельно.
            mirrorPreview ? styles.mirrored : null,
          ]}
          device={device}
          isActive={active}
          photo
          photoQualityBalance="quality"
        />
        {dim > 0 ? (
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, {backgroundColor: `rgba(11,11,16,${dim})`}]}
          />
        ) : null}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  mirrored: {
    transform: [{scaleX: -1}],
  },
  placeholder: {
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  placeholderTitle: {
    color: palette.text,
    fontSize: typography.heading,
    fontWeight: '700',
    textAlign: 'center',
  },
  placeholderText: {
    color: palette.textMuted,
    fontSize: typography.body,
    textAlign: 'center',
  },
  placeholderButton: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 999,
    backgroundColor: palette.accent,
  },
  placeholderButtonText: {
    color: palette.accentText,
    fontSize: typography.button,
    fontWeight: '700',
  },
});
