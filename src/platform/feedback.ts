/**
 * Звук и вибрация.
 *
 * На мероприятии шумно, и звук отсчёта нужен не для красоты: он говорит
 * гостю, когда смотреть в объектив, если тот отвернулся к друзьям. Поэтому
 * сигналы короткие и различимые — щелчок отсчёта, затвор, «готово».
 *
 * Пользуемся системными звуками через нативный модуль, а не своими файлами:
 * так не нужен аудио-движок и не растёт размер приложения.
 */

import {NativeModules, Platform, Vibration} from 'react-native';

export type Cue = 'countdown' | 'shutter' | 'done' | 'error';

interface FeedbackNativeModule {
  playCue(cue: Cue): void;
}

const native = NativeModules.PhotoKiosk as Partial<FeedbackNativeModule> | undefined;

/** Проигрывает системный звук. Молча ничего не делает, если модуля нет. */
export function playCue(cue: Cue): void {
  try {
    native?.playCue?.(cue);
  } catch {
    // Звук — не критичная функция: без него сценарий работает.
  }
}

/** Короткая вибрация подтверждения нажатия. */
export function haptic(): void {
  try {
    // iOS игнорирует длительность и даёт стандартный отклик; Android — 12 мс,
    // ощутимо, но не раздражает при частых касаниях.
    Vibration.vibrate(Platform.OS === 'android' ? 12 : 10);
  } catch {
    // Вибромотор может отсутствовать, быть занят или запрещён политикой
    // устройства. Отклик на касание — не та функция, ради которой стоит
    // прерывать съёмку.
  }
}
