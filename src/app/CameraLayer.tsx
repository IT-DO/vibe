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

import React, {forwardRef, useImperativeHandle, useRef} from 'react';
import {StyleSheet, Text, View} from 'react-native';
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
    const {hasPermission} = useCameraPermission();

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

    if (!hasPermission || !device) {
      return (
        <View style={[StyleSheet.absoluteFill, styles.placeholder]}>
          <Text style={styles.placeholderText}>
            {hasPermission ? 'Камера не найдена' : 'Нет доступа к камере'}
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
  },
  placeholderText: {
    color: palette.textMuted,
    fontSize: typography.body,
    textAlign: 'center',
  },
});
