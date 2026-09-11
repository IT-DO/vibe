/**
 * Шрифты сборки отпечатка.
 *
 * Именно здесь ломалась печать: `Skia.Font()` формально принимает шрифт
 * необязательным параметром, но нативная часть на `undefined` выбрасывает
 * «Value is undefined, expected an Object», и лист не собирался вообще —
 * у всех раскладок с подписью, то есть у всех, кроме одиночного кадра.
 */

import {Skia} from '@shopify/react-native-skia';

import {forgetTypefaces, loadTypeface} from '../typefaces';
import {fontAssetUri} from '../../theme/fonts';

const skia = Skia as unknown as {
  Data: {fromURI: jest.Mock};
  Typeface: {MakeFreeTypeFaceFromData: jest.Mock};
  FontMgr: {System: jest.Mock};
};

const SYSTEM_FACE = {__brand: 'system'};
const OWN_FACE = {__brand: 'lobster'};

beforeEach(() => {
  forgetTypefaces();
  skia.Data.fromURI.mockResolvedValue({size: 392208});
  skia.Typeface.MakeFreeTypeFaceFromData.mockReturnValue(OWN_FACE);
  skia.FontMgr.System.mockReturnValue({matchFamilyStyle: () => SYSTEM_FACE});
});

describe('шрифт подписи', () => {
  it('берётся из встроенного файла, а не из системы', () => {
    // Набор системных шрифтов на разных прошивках разный: один и тот же
    // отпечаток вышел бы на двух планшетах непохожим.
    expect(fontAssetUri('script')).toBe('file:///android_asset/fonts/Lobster-Regular.ttf');
  });

  it('загружается и возвращается', async () => {
    expect(await loadTypeface('script')).toBe(OWN_FACE);
    expect(skia.Data.fromURI).toHaveBeenCalledWith(
      'file:///android_asset/fonts/Lobster-Regular.ttf',
    );
  });

  it('читается с диска один раз за запуск', async () => {
    // Сборка листа идёт на глазах у гостя — лишнего чтения из APK в этот
    // момент быть не должно.
    await loadTypeface('script');
    await loadTypeface('script');
    await loadTypeface('script');
    expect(skia.Data.fromURI).toHaveBeenCalledTimes(1);
  });

  it('разные роли — разные файлы', async () => {
    await loadTypeface('script');
    await loadTypeface('display');
    expect(skia.Data.fromURI).toHaveBeenCalledTimes(2);
    expect(skia.Data.fromURI).toHaveBeenLastCalledWith(
      'file:///android_asset/fonts/PlayfairDisplay-Bold.ttf',
    );
  });
});

describe('когда своего шрифта нет', () => {
  it('пропавший файл заменяется системным', async () => {
    skia.Data.fromURI.mockResolvedValue(null);
    expect(await loadTypeface('script')).toBe(SYSTEM_FACE);
  });

  it('повреждённый файл заменяется системным', async () => {
    skia.Typeface.MakeFreeTypeFaceFromData.mockReturnValue(null);
    expect(await loadTypeface('script')).toBe(SYSTEM_FACE);
  });

  it('исключение при чтении не выходит наружу', async () => {
    skia.Data.fromURI.mockRejectedValue(new Error('Ассет не найден'));
    expect(await loadTypeface('script')).toBe(SYSTEM_FACE);
  });

  it('когда нет и системного — возвращается null, а не undefined', async () => {
    // Разница принципиальная: `null` композитор проверяет и подпись
    // пропускает, а `undefined` уходит в Skia.Font и роняет лист.
    skia.Data.fromURI.mockResolvedValue(null);
    skia.FontMgr.System.mockImplementation(() => {
      throw new Error('Нет менеджера шрифтов');
    });
    expect(await loadTypeface('script')).toBeNull();
  });

  it('отсутствие шрифта тоже запоминается — файла не появится', async () => {
    skia.Data.fromURI.mockResolvedValue(null);
    skia.FontMgr.System.mockReturnValue({matchFamilyStyle: () => null});
    await loadTypeface('script');
    await loadTypeface('script');
    expect(skia.Data.fromURI).toHaveBeenCalledTimes(1);
  });
});
