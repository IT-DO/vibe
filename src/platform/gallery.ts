/**
 * Выбор готового снимка из галереи.
 *
 * Второй сценарий печати, помимо съёмки: человек хочет напечатать фотографию,
 * которая уже есть на устройстве. На мероприятии это пригождается постоянно —
 * гость просит распечатать кадр со своего телефона, организатор снимает
 * общее фото «нормальной» камерой, а печатать удобно отсюда.
 *
 * Разрешение на доступ к галерее спрашивает сама системная галерея — своё
 * запрашивать не нужно, поэтому в манифесте READ_MEDIA_IMAGES нет.
 */

import {launchImageLibrary} from 'react-native-image-picker';

export interface PickedPhoto {
  readonly path: string;
  readonly width: number;
  readonly height: number;
}

/** Причина, по которой снимок не выбран. */
export type PickFailure =
  | {readonly kind: 'cancelled'}
  | {readonly kind: 'error'; readonly message: string};

export type PickResult =
  | {readonly kind: 'picked'; readonly photo: PickedPhoto}
  | PickFailure;

/**
 * Открывает системную галерею и ждёт выбора одного снимка.
 *
 * Изображение не масштабируем: лист собирается из оригинала, а обрезкой и
 * подгонкой занимается `imaging/composer`. Уменьшать здесь означало бы
 * потерять разрешение до того, как станет известен размер ячейки.
 */
export async function pickPhotoFromGallery(): Promise<PickResult> {
  try {
    const response = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
      // Нужен путь к файлу: композитор читает его напрямую, а base64 на
      // снимке в 12 Мп — это лишние десятки мегабайт в памяти.
      includeBase64: false,
    });

    if (response.didCancel) {
      return {kind: 'cancelled'};
    }
    if (response.errorCode) {
      return {
        kind: 'error',
        message: response.errorMessage ?? 'Не удалось открыть галерею',
      };
    }

    const asset = response.assets?.[0];
    if (!asset?.uri) {
      return {kind: 'cancelled'};
    }

    return {
      kind: 'picked',
      photo: {
        path: asset.uri,
        // Размеры нужны композитору для кадрирования. Если галерея их не
        // отдала, ставим ноль — композитор возьмёт реальные из файла.
        width: asset.width ?? 0,
        height: asset.height ?? 0,
      },
    };
  } catch (error) {
    return {
      kind: 'error',
      message: error instanceof Error ? error.message : 'Не удалось открыть галерею',
    };
  }
}
