/**
 * Файлы на устройстве: кадры, готовые отпечатки, очередь.
 *
 * Отдельная тема — приватность. На мероприятии камера снимает чужих людей,
 * и планшет не должен превращаться в архив лиц. Поэтому:
 *  - кадры лежат во внутренней папке приложения, а не в галерее;
 *  - напечатанное удаляется сразу после печати;
 *  - есть явная уборка «всё, что старше N часов» и кнопка «стереть съёмку»
 *    в админке, чтобы очистить планшет по окончании мероприятия.
 */

import RNFS from 'react-native-fs';

import {decodeBase64, encodeBase64} from '../utils/base64';
import type {DocumentLoader} from '../printing/queue';

/** Корень рабочих файлов приложения. */
const ROOT = `${RNFS.DocumentDirectoryPath}/photo-na-pamyat`;

export const Paths = {
  root: ROOT,
  /** Кадры прямо с камеры. */
  shots: `${ROOT}/shots`,
  /** Собранные листы, ожидающие печати. */
  sheets: `${ROOT}/sheets`,
  /** Копии отпечатков для раздачи гостям, если включено сохранение. */
  archive: `${ROOT}/archive`,
  /** Сохранённая очередь печати. */
  queueFile: `${ROOT}/queue.json`,
} as const;

/** Создаёт рабочие папки. Вызывать при старте приложения. */
export async function ensureDirectories(): Promise<void> {
  for (const dir of [Paths.root, Paths.shots, Paths.sheets, Paths.archive]) {
    if (!(await RNFS.exists(dir))) {
      await RNFS.mkdir(dir);
    }
  }
}

/** Уникальное имя файла в указанной папке. */
export function newFilePath(directory: string, extension: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const salt = Math.random().toString(36).slice(2, 8);
  return `${directory}/${stamp}-${salt}.${extension}`;
}

/** Пишет байты в файл (RNFS работает с base64). */
export async function writeBytes(path: string, data: Uint8Array): Promise<void> {
  await RNFS.writeFile(path, encodeBase64(data), 'base64');
}

/** Читает файл в байты. */
export async function readBytes(path: string): Promise<Uint8Array> {
  return decodeBase64(await RNFS.readFile(path, 'base64'));
}

/** Удаляет файл, не падая, если его уже нет. */
export async function removeFile(path: string): Promise<void> {
  try {
    if (await RNFS.exists(path)) {
      await RNFS.unlink(path);
    }
  } catch {
    // Файла нет — цель достигнута.
  }
}

/** Доступ к файлам заданий для очереди печати. */
export const fileDocuments: DocumentLoader = {
  read: readBytes,
  remove: removeFile,
};

/**
 * Удаляет рабочие файлы старше указанного возраста.
 * Запускается при старте и по расписанию: планшет часто живёт от мероприятия
 * к мероприятию, и чужие лица на нём копиться не должны.
 */
export async function purgeOlderThan(maxAgeMs: number): Promise<number> {
  const cutoff = Date.now() - maxAgeMs;
  let removed = 0;

  for (const dir of [Paths.shots, Paths.sheets, Paths.archive]) {
    let entries: RNFS.ReadDirItem[] = [];
    try {
      entries = await RNFS.readDir(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const modified = entry.mtime?.getTime() ?? 0;
      if (entry.isFile() && modified < cutoff) {
        await removeFile(entry.path);
        removed++;
      }
    }
  }
  return removed;
}

/** Полностью стирает съёмку — кнопка «очистить планшет» в админке. */
export async function purgeAll(): Promise<void> {
  for (const dir of [Paths.shots, Paths.sheets, Paths.archive]) {
    try {
      await RNFS.unlink(dir);
    } catch {
      // Папки могло не быть.
    }
  }
  await ensureDirectories();
}

/** Сколько места занимают рабочие файлы — показываем в админке. */
export async function usedBytes(): Promise<number> {
  let total = 0;
  for (const dir of [Paths.shots, Paths.sheets, Paths.archive]) {
    try {
      for (const entry of await RNFS.readDir(dir)) {
        total += Number(entry.size) || 0;
      }
    } catch {
      // Папка недоступна — пропускаем.
    }
  }
  return total;
}

export {encodeBase64, decodeBase64};
