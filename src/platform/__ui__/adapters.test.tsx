/**
 * Переходники к платформе. Каждый из них работает с тем, что может
 * отсутствовать, отказать или вернуть не то: галерея, вибромотор, нативный
 * журнал. Правило одно — никакой отказ здесь не должен ронять приложение.
 */

import {NativeModules, Vibration} from 'react-native';

import {pickPhotoFromGallery} from '../gallery';
import {haptic, playCue} from '../feedback';
import {clearCrashLog, readCrashLog, recordError} from '../crashlog';

describe('галерея', () => {
  it('возвращает выбранный снимок с размерами', async () => {
    globalThis.__galleryMock.launch = jest.fn(async () => ({
      assets: [{uri: 'file:///фото.jpg', width: 4000, height: 3000}],
    }));
    const result = await pickPhotoFromGallery();
    expect(result).toEqual({
      kind: 'picked',
      photo: {path: 'file:///фото.jpg', width: 4000, height: 3000},
    });
  });

  it('не запрашивает base64 — снимок на 12 Мп не должен лежать в памяти строкой', () => {
    const launch = jest.fn(async () => ({didCancel: true}));
    globalThis.__galleryMock.launch = launch;
    void pickPhotoFromGallery();
    expect(launch).toHaveBeenCalledWith(expect.objectContaining({includeBase64: false}));
  });

  it('отмена — это не ошибка', async () => {
    globalThis.__galleryMock.launch = jest.fn(async () => ({didCancel: true}));
    expect(await pickPhotoFromGallery()).toEqual({kind: 'cancelled'});
  });

  it('отказ галереи объясняется словами', async () => {
    globalThis.__galleryMock.launch = jest.fn(async () => ({
      errorCode: 'permission',
      errorMessage: 'Нет доступа к фотографиям',
    }));
    expect(await pickPhotoFromGallery()).toEqual({
      kind: 'error',
      message: 'Нет доступа к фотографиям',
    });
  });

  it('отказ без текста всё равно объясняется', async () => {
    globalThis.__galleryMock.launch = jest.fn(async () => ({errorCode: 'others'}));
    expect(await pickPhotoFromGallery()).toMatchObject({kind: 'error'});
  });

  it('пустой ответ считается отменой, а не сбоем', async () => {
    globalThis.__galleryMock.launch = jest.fn(async () => ({assets: []}));
    expect(await pickPhotoFromGallery()).toEqual({kind: 'cancelled'});
  });

  it('исключение внутри галереи не выходит наружу', async () => {
    globalThis.__galleryMock.launch = jest.fn(async () => {
      throw new Error('Галерея недоступна');
    });
    expect(await pickPhotoFromGallery()).toEqual({
      kind: 'error',
      message: 'Галерея недоступна',
    });
  });

  it('снимок без размеров не отбрасывается — их возьмёт композитор', async () => {
    globalThis.__galleryMock.launch = jest.fn(async () => ({
      assets: [{uri: 'file:///без-размеров.jpg'}],
    }));
    expect(await pickPhotoFromGallery()).toEqual({
      kind: 'picked',
      photo: {path: 'file:///без-размеров.jpg', width: 0, height: 0},
    });
  });
});

describe('отклик устройства', () => {
  it('вибрация не роняет приложение без разрешения VIBRATE', () => {
    // Ровно на этом приложение и сворачивалось на телефоне владельца:
    // Vibration.vibrate() без разрешения бросает SecurityException.
    const spy = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {
      throw new Error('SecurityException: VIBRATE permission required');
    });
    expect(() => haptic()).not.toThrow();
    spy.mockRestore();
  });

  it('звук без нативного модуля тоже не роняет', () => {
    const original = NativeModules.PhotoKiosk.playCue;
    NativeModules.PhotoKiosk.playCue = () => {
      throw new Error('Модуль не подключён');
    };
    expect(() => playCue('shutter')).not.toThrow();
    NativeModules.PhotoKiosk.playCue = original;
  });

  it('в обычном случае сигнал доходит до платформы', () => {
    playCue('countdown');
    expect(NativeModules.PhotoKiosk.playCue).toHaveBeenCalledWith('countdown');
  });
});

describe('журнал сбоев', () => {
  it('пишет контекст и текст ошибки', async () => {
    await recordError('Сборка превью', new Error('Skia недоступна'));
    const written = NativeModules.PhotoCrashLog.append.mock.calls[0]![0] as string;
    expect(written).toContain('Сборка превью');
    expect(written).toContain('Skia недоступна');
  });

  it('переживает не-ошибку в качестве причины', async () => {
    await recordError('Странность', 'просто строка');
    const written = NativeModules.PhotoCrashLog.append.mock.calls[0]![0] as string;
    expect(written).toContain('просто строка');
  });

  it('отказ самой записи не роняет приложение', async () => {
    NativeModules.PhotoCrashLog.append.mockRejectedValueOnce(new Error('Диск полон'));
    await expect(recordError('Что-то', new Error('и ещё'))).resolves.toBeUndefined();
  });

  it('нечитаемый журнал показывается как пустой', async () => {
    NativeModules.PhotoCrashLog.read.mockRejectedValueOnce(new Error('Нет файла'));
    expect(await readCrashLog()).toBe('');
  });

  it('очистка не падает, когда чистить нечего', async () => {
    NativeModules.PhotoCrashLog.clear.mockRejectedValueOnce(new Error('Нет файла'));
    await expect(clearCrashLog()).resolves.toBeUndefined();
  });
});
