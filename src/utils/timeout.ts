/**
 * Срок ожидания для обещаний, которые могут не завершиться никогда.
 *
 * Обычное `try/catch` защищает от отказа, но не от молчания. А молчание
 * встречается: например, нативная часть Skia в `Data.fromURI` умеет только
 * `resolve` — функции `reject` там нет вовсе, и файл, который не открылся,
 * оставляет обещание висеть навсегда. Снаружи это выглядит как зависшее
 * приложение без единой строки в журнале.
 *
 * Поэтому всё, что уходит в нативный код за файлом, оборачивается сюда.
 */

/**
 * Ждёт обещание не дольше указанного срока.
 *
 * По истечении возвращает `null` — вызывающий решает, что это значит.
 * Отказ самого обещания тоже даёт `null`: для вызывающего «не дождались» и
 * «не получилось» — одно и то же, а разбираться с этим он не должен.
 *
 * Зависшее обещание остаётся висеть — прервать его нельзя, — но его исход
 * гасится, чтобы React Native не показал необработанный отказ спустя время,
 * когда результата уже никто не ждёт.
 */
export async function withTimeout<T>(
  work: Promise<T>,
  ms: number,
  onGiveUp?: (reason: 'timeout' | 'error', error?: unknown) => void,
): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const expiry = new Promise<null>(resolve => {
    timer = setTimeout(() => {
      onGiveUp?.('timeout');
      resolve(null);
    }, ms);
  });

  const settled = work.catch(error => {
    onGiveUp?.('error', error);
    return null;
  });

  try {
    return await Promise.race([settled, expiry]);
  } finally {
    clearTimeout(timer);
  }
}
