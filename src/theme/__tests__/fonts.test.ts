/**
 * Шрифты приложения.
 *
 * Файлы шрифтов легко потерять: их не видит проверка типов, о них молчит
 * линтер, а без них Android молча подставляет системный гротеск — заметить
 * это можно только глазами на устройстве. Поэтому наличие файлов, их
 * кириллица и совпадение имён проверяются здесь.
 */

import {readFileSync, existsSync} from 'fs';
import {join} from 'path';

import {fontAssetUri, fontAssets, fontFamily} from '../fonts';

const ASSETS = join(__dirname, '..', '..', '..', 'assets', 'fonts');
const ANDROID = join(
  __dirname, '..', '..', '..',
  'android', 'app', 'src', 'main', 'assets', 'fonts',
);

/** Символы, без которых русский интерфейс превратится в прямоугольники. */
const CYRILLIC =
  'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя';

/** Разбирает таблицу cmap шрифта и возвращает коды символов формата 4. */
function glyphCodes(file: string): Set<number> {
  const b = readFileSync(file);
  const tables = b.readUInt16BE(4);
  let cmapOffset = 0;
  for (let i = 0; i < tables; i++) {
    const record = 12 + i * 16;
    if (b.subarray(record, record + 4).toString('latin1') === 'cmap') {
      cmapOffset = b.readUInt32BE(record + 8);
    }
  }
  if (!cmapOffset) {
    return new Set();
  }

  const subtables = b.readUInt16BE(cmapOffset + 2);
  let best = 0;
  for (let i = 0; i < subtables; i++) {
    const offset = cmapOffset + b.readUInt32BE(cmapOffset + 4 + i * 8 + 4);
    if (b.readUInt16BE(offset) === 4) {
      best = offset;
    }
  }
  if (!best) {
    return new Set();
  }

  const segCountX2 = b.readUInt16BE(best + 6);
  const segments = segCountX2 / 2;
  const codes = new Set<number>();
  for (let i = 0; i < segments; i++) {
    const end = b.readUInt16BE(best + 14 + i * 2);
    const start = b.readUInt16BE(best + 14 + segCountX2 + 2 + i * 2);
    if (end === 0xffff) {
      continue;
    }
    for (let c = start; c <= end; c++) {
      codes.add(c);
    }
  }
  return codes;
}

describe('файлы шрифтов', () => {
  it.each(Object.values(fontAssets))('%s лежит в ассетах проекта', file => {
    expect(existsSync(join(ASSETS, file))).toBe(true);
  });

  it.each(Object.values(fontAssets))('%s попадает в сборку Android', file => {
    // Android читает шрифты только из своей папки ассетов. Файл, забытый
    // при копировании, оборачивается системным гротеском на устройстве —
    // и заметить это можно лишь глазами.
    expect(existsSync(join(ANDROID, file))).toBe(true);
  });

  it.each(Object.values(fontAssets))('%s содержит кириллицу целиком', file => {
    // Интерфейс русский. Шрифт без кириллицы даёт либо прямоугольники,
    // либо подмену системным — и то и другое видно только на устройстве.
    const codes = glyphCodes(join(ASSETS, file));
    const missing = [...CYRILLIC].filter(c => !codes.has(c.codePointAt(0)!));
    expect(missing.join('')).toBe('');
  });

  it.each(Object.values(fontAssets))('%s содержит цифры и типографику', file => {
    const codes = glyphCodes(join(ASSETS, file));
    const missing = [...'0123456789«»—·'].filter(c => !codes.has(c.codePointAt(0)!));
    expect(missing.join('')).toBe('');
  });

  it('лицензия шрифтов лежит рядом с ними', () => {
    // Оба шрифта под SIL OFL: она требует распространять текст лицензии.
    expect(existsSync(join(ASSETS, 'OFL.txt'))).toBe(true);
  });
});

describe('имена семейств', () => {
  it('совпадают с именами файлов — так их видит Android', () => {
    for (const [role, file] of Object.entries(fontAssets)) {
      const expected = file.replace(/\.ttf$/, '');
      expect(fontFamily[role as keyof typeof fontAssets]).toBe(expected);
    }
  });

  it('служебный текст остаётся системным', () => {
    // Админку читают быстро и вблизи; декоративная антиква там мешает.
    expect(fontFamily.system).not.toBe(fontFamily.display);
  });
});

describe('путь к шрифту внутри приложения', () => {
  it('ведёт в ассеты Android', () => {
    // У ассетов в APK нет обычного пути в файловой системе — только эта
    // схема, и Skia понимает именно её.
    expect(fontAssetUri('script')).toBe(
      'file:///android_asset/fonts/Lobster-Regular.ttf',
    );
  });

  it('строится для каждой роли', () => {
    for (const role of Object.keys(fontAssets) as (keyof typeof fontAssets)[]) {
      expect(fontAssetUri(role)).toMatch(/^file:\/\/\/android_asset\/fonts\/.+\.ttf$/);
    }
  });
});
