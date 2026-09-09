/**
 * Шрифты для сборки отпечатка.
 *
 * Отдельный модуль, потому что именно здесь ломалась печать. `Skia.Font()`
 * формально принимает шрифт необязательным параметром, но нативная часть
 * ждёт объект и на `undefined` выбрасывает «Value is undefined, expected an
 * Object». Подпись рисуется у всех раскладок, кроме одиночного кадра, —
 * поэтому «не работали» ровно они: два кадра, полароид, четыре кадра и
 * полоска на двоих. Лист не собирался вообще, а гость видел пустой
 * прямоугольник вместо своей фотографии.
 *
 * Отсюда правило модуля: наружу отдаётся либо готовый шрифт, либо `null`, и
 * ни при каких обстоятельствах — `undefined` в конструктор. Не удалось
 * загрузить свой файл — берём системный. Нет и его — подпись не рисуется, но
 * отпечаток выходит: фотография без подписи лучше, чем ничего.
 */

import {FontStyle, Skia, type SkTypeface} from '@shopify/react-native-skia';

import {fontAssetUri, type FontRole} from '../theme/fonts';

/**
 * Загруженные шрифты. Файл читается один раз за запуск: он лежит в APK,
 * не меняется, а сборка листа идёт на глазах у гостя — лишнего чтения с
 * диска в этот момент быть не должно.
 */
const cache = new Map<FontRole, SkTypeface | null>();

/**
 * Шрифт для подписи отпечатка. `null` — шрифта нет, подпись рисовать нечем.
 *
 * Ошибки не выбрасываются: подпись — украшение, а отпечаток — то, ради чего
 * человек подошёл к будке.
 */
export async function loadTypeface(role: FontRole): Promise<SkTypeface | null> {
  const cached = cache.get(role);
  if (cached !== undefined) {
    return cached;
  }

  const typeface = (await fromAsset(role)) ?? fromSystem();
  cache.set(role, typeface);
  return typeface;
}

/** Читает встроенный в приложение файл шрифта. */
async function fromAsset(role: FontRole): Promise<SkTypeface | null> {
  try {
    const data = await Skia.Data.fromURI(fontAssetUri(role));
    if (!data) {
      return null;
    }
    return Skia.Typeface.MakeFreeTypeFaceFromData(data) ?? null;
  } catch {
    // Ассет не найден или повреждён — идём к системному шрифту.
    return null;
  }
}

/**
 * Системный шрифт как запасной вариант.
 *
 * Он не ретро и на разных прошивках выглядит по-разному, но подпись на
 * отпечатке будет — а это важнее её начертания.
 */
function fromSystem(): SkTypeface | null {
  try {
    // На Android «serif» — это Noto Serif: не ретро, но с засечками, то есть
    // ближе к антикве, чем гротеск по умолчанию.
    const manager = Skia.FontMgr.System();
    return manager.matchFamilyStyle('serif', FontStyle.Bold) ?? null;
  } catch {
    return null;
  }
}

/** Сбрасывает кэш — нужен тестам и перезагрузке оформления в админке. */
export function forgetTypefaces(): void {
  cache.clear();
}
