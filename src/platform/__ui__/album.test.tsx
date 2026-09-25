/**
 * Сохранение отпечатка в галерею.
 *
 * Проверяется не сама запись — её делает система, — а обещания вокруг неё:
 * отпечаток ложится в свой альбом, разрешение спрашивается только там, где
 * оно нужно, и ни одна неудача не выходит наружу. Сохранение приятно, но
 * гость пришёл за отпечатком, и ронять печать из-за галереи нельзя.
 */

import {PermissionsAndroid, Platform} from 'react-native';

import {ALBUM_NAME, requestAlbumPermission, saveSheetToAlbum} from '../album';

function onAndroid(version: number) {
  Object.defineProperty(Platform, 'Version', {value: version, configurable: true});
}

beforeEach(() => {
  onAndroid(33);
  jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue('granted' as never);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('разрешение', () => {
  it('на Android 10 и новее не спрашивается вовсе', async () => {
    // Запись идёт через MediaStore в собственный альбом. Просить доступ ко
    // всем файлам там, где он не нужен, — пугать владельца на ровном месте.
    expect(await requestAlbumPermission()).toBe(true);
    expect(PermissionsAndroid.request).not.toHaveBeenCalled();
  });

  it('на Android 9 спрашивается — иначе записать некуда', async () => {
    onAndroid(28);
    expect(await requestAlbumPermission()).toBe(true);
    expect(PermissionsAndroid.request).toHaveBeenCalledWith(
      'android.permission.WRITE_EXTERNAL_STORAGE',
    );
  });

  it('отказ не ломает приложение', async () => {
    onAndroid(28);
    (PermissionsAndroid.request as jest.Mock).mockResolvedValue('denied' as never);
    expect(await requestAlbumPermission()).toBe(false);
  });
});

describe('сохранение', () => {
  it('кладёт отпечаток в свой альбом', async () => {
    await saveSheetToAlbum('/к/листы/лист.jpg');
    expect(globalThis.__albumMock.save).toHaveBeenCalledWith('file:///к/листы/лист.jpg', {
      type: 'photo',
      album: ALBUM_NAME,
    });
  });

  it('готовый адрес не портится вторым префиксом', async () => {
    await saveSheetToAlbum('file:///к/листы/лист.jpg');
    expect(globalThis.__albumMock.save).toHaveBeenCalledWith('file:///к/листы/лист.jpg', {
      type: 'photo',
      album: ALBUM_NAME,
    });
  });

  it('возвращает адрес в галерее', async () => {
    globalThis.__albumMock.save.mockResolvedValue('content://медиа/7');
    await expect(saveSheetToAlbum('/к/листы/лист.jpg')).resolves.toBe('content://медиа/7');
  });

  it('неудача не выходит наружу — печать важнее', async () => {
    globalThis.__albumMock.save.mockRejectedValue(new Error('нет места'));
    await expect(saveSheetToAlbum('/к/листы/лист.jpg')).resolves.toBeNull();
  });

  it('без разрешения не пытается писать', async () => {
    onAndroid(28);
    (PermissionsAndroid.request as jest.Mock).mockResolvedValue('denied' as never);
    await expect(saveSheetToAlbum('/к/листы/лист.jpg')).resolves.toBeNull();
    expect(globalThis.__albumMock.save).not.toHaveBeenCalled();
  });
});
