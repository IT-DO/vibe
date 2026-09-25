/**
 * Сохранение отпечатка в галерею телефона.
 *
 * Зачем именно галерея. Прежний флажок «хранить копии» оставлял файлы во
 * внутренней памяти приложения, куда без компьютера и прав root не
 * добраться: ни галерея, ни файловый менеджер их не видят. Обещание в
 * подписи было, толку не было. Отпечаток в галерее — другое дело: его
 * видно сразу и можно отправить гостю в мессенджер прямо с планшета.
 *
 * Сохраняется готовый лист — тот самый, что ушёл в принтер, с раскладкой,
 * подписью и рамкой. Исходные кадры не сохраняются: гостю нужен отпечаток,
 * а не сырьё.
 *
 * Запись идёт через MediaStore, поэтому начиная с Android 10 никаких
 * разрешений не требуется — приложение кладёт файл в собственный альбом.
 * На Android 9 и старше нужно разрешение на запись, оно спрашивается.
 */

import {PermissionsAndroid, Platform} from 'react-native';
import {CameraRoll} from '@react-native-camera-roll/camera-roll';

import {trace, traceFailure} from './trace';

/** Альбом, в котором гость и оператор найдут отпечатки. */
export const ALBUM_NAME = 'Фото на память';

/**
 * Спрашивает разрешение на запись, если версия Android этого требует.
 *
 * С Android 10 запись в собственный альбом идёт через MediaStore и
 * разрешения не требует вовсе — спрашивать его там значило бы пугать
 * владельца устройства без нужды.
 */
export async function requestAlbumPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }
  const version =
    typeof Platform.Version === 'number' ? Platform.Version : Number(Platform.Version);
  if (version >= 29) {
    return true;
  }

  try {
    // Имя строкой: в типах React Native это разрешение объявлено
    // необязательным, потому что на новых версиях Android его нет.
    const granted = await PermissionsAndroid.request(
      'android.permission.WRITE_EXTERNAL_STORAGE' as Parameters<
        typeof PermissionsAndroid.request
      >[0],
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

/**
 * Кладёт готовый лист в галерею.
 *
 * Не бросает: сохранение — приятное дополнение, а не условие печати.
 * Отпечаток уже уходит в принтер, и ронять из-за галереи сценарий гостя
 * нельзя. Неудача попадает в журнал.
 *
 * @returns адрес в галерее или `null`, если сохранить не удалось
 */
export async function saveSheetToAlbum(path: string): Promise<string | null> {
  try {
    if (!(await requestAlbumPermission())) {
      trace('галерея', 'нет разрешения на запись');
      return null;
    }
    const uri = path.startsWith('file://') ? path : `file://${path}`;
    const saved = await CameraRoll.save(uri, {type: 'photo', album: ALBUM_NAME});
    trace('галерея', 'отпечаток сохранён', {альбом: ALBUM_NAME});
    return saved;
  } catch (error) {
    traceFailure('галерея', 'сохранение отпечатка', error);
    return null;
  }
}
