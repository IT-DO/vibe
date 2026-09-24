/**
 * Журнал ошибок для диагностики на чужом устройстве.
 *
 * Приложение стоит на телефоне человека, у которого нет ни компьютера с
 * Android SDK, ни желания снимать logcat. Просить его об этом — значит
 * заменить одну задачу («хочу фотобудку») на другую, к которой он не
 * подписывался. Поэтому приложение записывает сбои само и показывает их в
 * админке, откуда журнал можно отправить одной кнопкой.
 *
 * Ловим два уровня:
 *  - нативный (Java) — перехватчик стоит в MainApplication и работает даже
 *    там, где JavaScript уже не выполняется;
 *  - JavaScript — глобальный обработчик React Native.
 */

import {NativeModules} from 'react-native';

interface CrashLogNativeModule {
  append(text: string): Promise<void>;
  read(): Promise<string>;
  clear(): Promise<void>;
}

const native = NativeModules.PhotoCrashLog as CrashLogNativeModule | undefined;

/** Глобальный обработчик ошибок React Native. */
declare const ErrorUtils:
  | {
      getGlobalHandler(): (error: Error, isFatal?: boolean) => void;
      setGlobalHandler(handler: (error: Error, isFatal?: boolean) => void): void;
    }
  | undefined;

/** Записывает произвольное событие в журнал. */
export async function recordError(context: string, error: unknown): Promise<void> {
  if (!native) {
    return;
  }
  const when = new Date().toLocaleString('ru-RU');
  const details =
    error instanceof Error
      ? `${error.name}: ${error.message}\n${error.stack ?? ''}`
      : String(error);
  try {
    await native.append(`\n=== ${context} ${when} ===\n${details}\n`);
  } catch {
    // Журнал — вспомогательная вещь, ронять из-за него ничего нельзя.
  }
}

/** Весь журнал. Пустая строка — сбоев не было. */
export async function readCrashLog(): Promise<string> {
  try {
    return (await native?.read()) ?? '';
  } catch {
    return '';
  }
}

export async function clearCrashLog(): Promise<void> {
  try {
    await native?.clear();
  } catch {
    // Нечего очищать.
  }
}

/**
 * Ставит обработчик ошибок JavaScript поверх штатного.
 *
 * Штатный обработчик вызывается следом: без этого в отладочной сборке
 * пропал бы красный экран, а в релизной — стандартное поведение при
 * фатальной ошибке.
 */
export function installJsErrorHandler(): void {
  if (typeof ErrorUtils === 'undefined') {
    return;
  }
  const previous = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    void recordError(isFatal ? 'Фатальная ошибка JS' : 'Ошибка JS', error);
    previous(error, isFatal);
  });
}
