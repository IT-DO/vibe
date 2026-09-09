/**
 * Работа с файлами на устройстве.
 *
 * Здесь важна не сама запись, а приватность: на мероприятии камера снимает
 * чужих людей, и планшет не должен превращаться в архив лиц. Проверяем, что
 * уборка действительно убирает, а сбои файловой системы не роняют
 * приложение посреди съёмки.
 */

import RNFS from 'react-native-fs';

import {
  Paths,
  ensureDirectories,
  newFilePath,
  purgeAll,
  purgeOlderThan,
  readBytes,
  removeFile,
  usedBytes,
  writeBytes,
} from '../files';

const fs = RNFS as unknown as {
  exists: jest.Mock;
  mkdir: jest.Mock;
  writeFile: jest.Mock;
  readFile: jest.Mock;
  unlink: jest.Mock;
  readDir: jest.Mock;
};

/** Запись каталога, как её отдаёт RNFS. */
const entry = (name: string, ageMs: number, size = 1_000) => ({
  path: `${Paths.shots}/${name}`,
  name,
  size,
  mtime: new Date(Date.now() - ageMs),
  isFile: () => true,
  isDirectory: () => false,
});

beforeEach(() => {
  fs.exists.mockResolvedValue(true);
  fs.readDir.mockResolvedValue([]);
  fs.unlink.mockResolvedValue(undefined);
  fs.readFile.mockResolvedValue('');
  fs.writeFile.mockResolvedValue(undefined);
});

describe('имена файлов', () => {
  it('никогда не совпадают', () => {
    // Совпавшее имя — это перезапись чужого кадра прямо во время съёмки.
    const names = new Set(
      Array.from({length: 500}, () => newFilePath(Paths.shots, 'jpg')),
    );
    expect(names.size).toBe(500);
  });

  it('лежат в запрошенной папке и с нужным расширением', () => {
    const path = newFilePath(Paths.sheets, 'pwg');
    expect(path.startsWith(`${Paths.sheets}/`)).toBe(true);
    expect(path.endsWith('.pwg')).toBe(true);
  });

  it('не содержат двоеточий — их не любят файловые системы', () => {
    expect(newFilePath(Paths.shots, 'jpg')).not.toContain(':');
  });
});

describe('чтение и запись', () => {
  it('байты переживают путь через base64', async () => {
    const data = Uint8Array.from([0, 1, 127, 128, 255, 42]);
    await writeBytes('/файл.bin', data);

    const written = fs.writeFile.mock.calls[0]![1] as string;
    expect(fs.writeFile.mock.calls[0]![2]).toBe('base64');

    fs.readFile.mockResolvedValue(written);
    expect(Array.from(await readBytes('/файл.bin'))).toEqual(Array.from(data));
  });

  it('пустой файл читается как пустые байты', async () => {
    fs.readFile.mockResolvedValue('');
    expect((await readBytes('/пусто.bin')).length).toBe(0);
  });
});

describe('удаление', () => {
  it('удаляет существующий файл', async () => {
    fs.exists.mockResolvedValue(true);
    await removeFile('/есть.jpg');
    expect(fs.unlink).toHaveBeenCalledWith('/есть.jpg');
  });

  it('отсутствие файла — не ошибка: цель достигнута', async () => {
    fs.exists.mockResolvedValue(false);
    await expect(removeFile('/нет.jpg')).resolves.toBeUndefined();
    expect(fs.unlink).not.toHaveBeenCalled();
  });

  it('отказ файловой системы не выходит наружу', async () => {
    // Удаление кадра идёт по ходу сценария; упасть на нём — значит
    // оборвать съёмку из-за уборки.
    fs.exists.mockResolvedValue(true);
    fs.unlink.mockRejectedValue(new Error('Permission denied'));
    await expect(removeFile('/занят.jpg')).resolves.toBeUndefined();
  });
});

describe('уборка по возрасту', () => {
  it('удаляет старое и не трогает свежее', async () => {
    const hour = 3_600_000;
    fs.readDir.mockImplementation(async (dir: string) =>
      dir === Paths.shots ? [entry('старый.jpg', 30 * hour), entry('свежий.jpg', hour)] : [],
    );

    const removed = await purgeOlderThan(24 * hour);

    expect(removed).toBe(1);
    expect(fs.unlink).toHaveBeenCalledWith(`${Paths.shots}/старый.jpg`);
    expect(fs.unlink).not.toHaveBeenCalledWith(`${Paths.shots}/свежий.jpg`);
  });

  it('файл без времени изменения считается старым', async () => {
    // Лучше убрать лишнее, чем оставить чужое лицо на планшете навсегда.
    fs.readDir.mockImplementation(async (dir: string) =>
      dir === Paths.shots
        ? [{...entry('без-времени.jpg', 0), mtime: undefined}]
        : [],
    );
    expect(await purgeOlderThan(3_600_000)).toBe(1);
  });

  it('каталоги не удаляются', async () => {
    fs.readDir.mockImplementation(async (dir: string) =>
      dir === Paths.shots
        ? [{...entry('папка', 99 * 3_600_000), isFile: () => false, isDirectory: () => true}]
        : [],
    );
    expect(await purgeOlderThan(3_600_000)).toBe(0);
  });

  it('недоступная папка не срывает уборку остальных', async () => {
    fs.readDir.mockImplementation(async (dir: string) => {
      if (dir === Paths.shots) {
        throw new Error('Нет доступа');
      }
      return dir === Paths.archive ? [entry('старый.jpg', 99 * 3_600_000)] : [];
    });
    expect(await purgeOlderThan(3_600_000)).toBe(1);
  });

  it('обходит все три рабочих папки', async () => {
    await purgeOlderThan(1);
    const visited = fs.readDir.mock.calls.map(call => call[0]);
    expect(visited).toEqual([Paths.shots, Paths.sheets, Paths.archive]);
  });
});

describe('полная очистка', () => {
  it('сносит папки и создаёт их заново', async () => {
    // После мероприятия оператор должен уметь стереть всё одной кнопкой.
    fs.exists.mockResolvedValue(false);
    await purgeAll();

    expect(fs.unlink).toHaveBeenCalledWith(Paths.shots);
    expect(fs.unlink).toHaveBeenCalledWith(Paths.sheets);
    expect(fs.unlink).toHaveBeenCalledWith(Paths.archive);
    expect(fs.mkdir).toHaveBeenCalledWith(Paths.shots);
  });

  it('отсутствие папок не мешает очистке', async () => {
    fs.unlink.mockRejectedValue(new Error('ENOENT'));
    await expect(purgeAll()).resolves.toBeUndefined();
  });
});

describe('занятое место', () => {
  it('складывает размеры по всем папкам', async () => {
    fs.readDir.mockResolvedValue([entry('a.jpg', 0, 1_500), entry('b.jpg', 0, 2_500)]);
    expect(await usedBytes()).toBe((1_500 + 2_500) * 3);
  });

  it('недоступная папка считается пустой, а не ломает подсчёт', async () => {
    fs.readDir.mockRejectedValue(new Error('Нет доступа'));
    expect(await usedBytes()).toBe(0);
  });
});

describe('подготовка папок', () => {
  it('создаёт только недостающие', async () => {
    fs.exists.mockImplementation(async (dir: string) => dir !== Paths.archive);
    await ensureDirectories();
    expect(fs.mkdir).toHaveBeenCalledTimes(1);
    expect(fs.mkdir).toHaveBeenCalledWith(Paths.archive);
  });
});
