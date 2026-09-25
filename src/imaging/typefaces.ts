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

import {trace} from '../platform/trace';
import {fontAssetUri, type FontRole} from '../theme/fonts';
import {withTimeout} from '../utils/timeout';

/**
 * Сколько ждать файл шрифта.
 *
 * Файл лежит в самом приложении, и три секунды на его чтение — срок с
 * огромным запасом. Смысл не в том, чтобы уложиться, а в том, чтобы не
 * ждать вечно: `Data.fromURI` при неудаче не отклоняет обещание, а молчит,
 * и без срока вся сборка листа встаёт навсегда.
 */
const FONT_TIMEOUT_MS = 3_000;

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

  const own = await fromAsset(role);
  const typeface = own ?? fromSystem();
  trace('шрифт', own ? 'свой' : typeface ? 'системный' : 'нет', {роль: role});
  cache.set(role, typeface);
  return typeface;
}

/** Читает встроенный в приложение файл шрифта. */
async function fromAsset(role: FontRole): Promise<SkTypeface | null> {
  const uri = fontAssetUri(role);
  const data = await withTimeout(Skia.Data.fromURI(uri), FONT_TIMEOUT_MS, reason =>
    trace('шрифт', reason === 'timeout' ? 'файл не дождались' : 'файл не прочитался', {
      адрес: uri,
    }),
  );
  if (!data) {
    return null;
  }
  try {
    return Skia.Typeface.MakeFreeTypeFaceFromData(data) ?? null;
  } catch {
    // Файл прочитан, но это не шрифт — идём к системному.
    trace('шрифт', 'файл не разобран как шрифт', {адрес: uri});
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
