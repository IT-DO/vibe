import {countEntries, lastEntries, tailForSharing} from '../crashlog-format';

const entry = (n: number, body = 'java.lang.SecurityException: no VIBRATE') =>
  `=== Падение 09.09.2026 14:3${n}:02 (поток main) ===\n${body}\n\tat com.photonapamyat.X\n`;

describe('countEntries', () => {
  it('считает записи по разделителям', () => {
    expect(countEntries(entry(1) + entry(2) + entry(3))).toBe(3);
  });

  it('пустой журнал — ноль записей', () => {
    expect(countEntries('')).toBe(0);
  });

  it('не считает знаки равенства внутри стека', () => {
    const log = '=== Падение ===\nassert a === b\n\tat X\n';
    expect(countEntries(log)).toBe(1);
  });
});

describe('lastEntries', () => {
  it('возвращает последние записи, а не первые', () => {
    const result = lastEntries(entry(1) + entry(2) + entry(3), 2);
    expect(result).toContain('14:32:02');
    expect(result).toContain('14:33:02');
    expect(result).not.toContain('14:31:02');
  });

  it('когда записей меньше запрошенного, отдаёт все', () => {
    expect(countEntries(lastEntries(entry(1), 5))).toBe(1);
  });

  it('пустой журнал даёт пустую строку', () => {
    expect(lastEntries('', 3)).toBe('');
  });

  it('нулевое и отрицательное количество не ломают разбор', () => {
    expect(lastEntries(entry(1), 0)).toBe('');
    expect(lastEntries(entry(1), -2)).toBe('');
  });

  it('сохраняет содержимое записи целиком', () => {
    const result = lastEntries(entry(1, 'СБОЙ ТУТ'), 1);
    expect(result).toContain('СБОЙ ТУТ');
    expect(result).toContain('at com.photonapamyat.X');
  });

  it('переживает журнал без разделителей вовсе', () => {
    expect(lastEntries('просто текст без записей', 2)).toBe('просто текст без записей');
  });
});

describe('tailForSharing', () => {
  it('короткий журнал отдаёт целиком', () => {
    const log = entry(1);
    expect(tailForSharing(log)).toBe(log);
  });

  it('длинный обрезает с начала, сохраняя свежее', () => {
    const log = 'A'.repeat(100) + 'ХВОСТ';
    const result = tailForSharing(log, 10);
    expect(result).toHaveLength(10);
    expect(result.endsWith('ХВОСТ')).toBe(true);
  });

  it('граничный размер не обрезается', () => {
    expect(tailForSharing('12345', 5)).toBe('12345');
  });
});
