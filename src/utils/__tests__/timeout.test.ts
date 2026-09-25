import {withTimeout} from '../timeout';

/** Обещание, которое никогда не завершится, — как `Data.fromURI` при сбое. */
const forever = <T>(): Promise<T> => new Promise<T>(() => {});

describe('withTimeout', () => {
  it('отдаёт результат, если он пришёл вовремя', async () => {
    expect(await withTimeout(Promise.resolve('готово'), 50)).toBe('готово');
  });

  it('не ждёт вечно молчащее обещание', async () => {
    // Ровно этот случай и рушил сборку листа: нативная часть Skia при
    // неудаче не отклоняет обещание, а молчит.
    expect(await withTimeout(forever<string>(), 20)).toBeNull();
  });

  it('отказ тоже даёт null, а не выброшенное исключение', async () => {
    await expect(
      withTimeout(Promise.reject(new Error('нет файла')), 50),
    ).resolves.toBeNull();
  });

  it('сообщает, почему сдались', async () => {
    const reasons: string[] = [];
    await withTimeout(forever(), 20, reason => reasons.push(reason));
    expect(reasons).toEqual(['timeout']);

    const errors: unknown[] = [];
    await withTimeout(Promise.reject(new Error('нет файла')), 50, (reason, error) => {
      errors.push([reason, (error as Error).message]);
    });
    expect(errors).toEqual([['error', 'нет файла']]);
  });

  it('успех не сообщает ничего', async () => {
    const calls: string[] = [];
    await withTimeout(Promise.resolve(1), 50, reason => calls.push(reason));
    expect(calls).toHaveLength(0);
  });

  it('поздний отказ не остаётся необработанным', async () => {
    // Обещание отклоняется уже после того, как мы сдались. Если его исход
    // не погасить, React Native покажет жёлтый экран на ровном месте.
    let fail: (error: Error) => void = () => {};
    const late = new Promise<string>((_, reject) => {
      fail = reject;
    });

    expect(await withTimeout(late, 10)).toBeNull();
    fail(new Error('опоздал'));
    await new Promise(resolve => setTimeout(resolve, 20));
    // Дойдя сюда без падения прогона, проверка и состоялась.
    expect(true).toBe(true);
  });

  it('не держит таймер после успеха — иначе прогон тестов не завершился бы', async () => {
    const before = Date.now();
    await withTimeout(Promise.resolve('быстро'), 10_000);
    expect(Date.now() - before).toBeLessThan(1_000);
  });
});
