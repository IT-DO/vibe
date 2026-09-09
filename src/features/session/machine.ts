/**
 * Конечный автомат фотосессии.
 *
 * Сценарий гостя целиком описан здесь, отдельно от экранов: касание —
 * выбор раскладки — обратный отсчёт — серия кадров — просмотр — печать —
 * благодарность — возврат к заставке. Экраны только рисуют состояние и шлют
 * события.
 *
 * Почему это вынесено в чистую функцию. Киоск стоит без присмотра, и почти
 * все его отказы — это залипание в промежуточном состоянии: гость ушёл, не
 * нажав «печатать», ребёнок потыкал в экран, кто-то закрыл камеру рукой.
 * Такие сюжеты дёшево проверять тестами и дорого — на живом мероприятии.
 *
 * Ключевое решение: из экрана просмотра выход есть всегда. Если гость не
 * нажал ничего, снимок уходит в печать сам (`autoPrintOnTimeout`) — лучше
 * лишний отпечаток, чем занятая будка и очередь за спиной.
 */

import type {LayoutId} from '../../imaging/layouts';

/** Один снятый кадр. */
export interface PhotoShot {
  /** Путь к файлу кадра на устройстве. */
  readonly path: string;
  readonly width: number;
  readonly height: number;
  readonly takenAt: number;
  /**
   * Зеркален ли кадр уже сейчас, в файле.
   *
   * Не «снят ли фронтальной камерой»: VisionCamera для фронтальной камеры
   * зеркалит вывод сама, и решать надо по факту, а не по догадке. Подробности
   * и ловушка двойного отражения — в `imaging/mirror.ts`.
   */
  readonly isMirrored: boolean;
  /** Откуда взялся кадр: чужой снимок из галереи не зеркалим никогда. */
  readonly origin: 'camera' | 'gallery';
}

export type SessionState =
  | {readonly name: 'attract'}
  | {readonly name: 'chooseLayout'; readonly expiresAt: number}
  | {readonly name: 'getReady'; readonly layoutId: LayoutId; readonly expiresAt: number}
  | {
      readonly name: 'countdown';
      readonly layoutId: LayoutId;
      readonly shotIndex: number;
      readonly secondsLeft: number;
      readonly nextTickAt: number;
      readonly shots: readonly PhotoShot[];
    }
  | {
      readonly name: 'capturing';
      readonly layoutId: LayoutId;
      readonly shotIndex: number;
      readonly shots: readonly PhotoShot[];
      /** Камера не ответила к этому моменту — считаем, что не ответит. */
      readonly expiresAt: number;
    }
  | {
      readonly name: 'betweenShots';
      readonly layoutId: LayoutId;
      readonly shotIndex: number;
      readonly resumeAt: number;
      readonly shots: readonly PhotoShot[];
    }
  | {
      readonly name: 'review';
      readonly layoutId: LayoutId;
      readonly shots: readonly PhotoShot[];
      readonly expiresAt: number;
      /**
       * Откуда взялись кадры. От этого зависит, что делает «переснять»:
       * вернуться к камере или снова открыть галерею.
       */
      readonly source: 'camera' | 'gallery';
    }
  | {
      readonly name: 'printing';
      readonly layoutId: LayoutId;
      readonly shots: readonly PhotoShot[];
      /** Срок на сборку листа и постановку в очередь. */
      readonly expiresAt: number;
    }
  | {readonly name: 'thanks'; readonly expiresAt: number; readonly queuePosition: number}
  | {readonly name: 'error'; readonly message: string; readonly expiresAt: number};

export type SessionEvent =
  /** Гость коснулся заставки. */
  | {readonly type: 'start'; readonly now: number}
  | {readonly type: 'chooseLayout'; readonly layoutId: LayoutId; readonly now: number}
  /** Такт часов; несёт текущее время. */
  | {readonly type: 'tick'; readonly now: number}
  | {readonly type: 'shotTaken'; readonly shot: PhotoShot; readonly now: number}
  /** Гость выбрал печать готового снимка вместо съёмки. */
  | {readonly type: 'pickPhoto'; readonly now: number}
  /** Снимок из галереи выбран и готов к просмотру. */
  | {readonly type: 'photoPicked'; readonly shot: PhotoShot; readonly now: number}
  | {readonly type: 'captureFailed'; readonly message: string; readonly now: number}
  | {readonly type: 'retake'; readonly now: number}
  | {readonly type: 'print'; readonly now: number}
  | {readonly type: 'printQueued'; readonly queuePosition: number; readonly now: number}
  | {readonly type: 'printFailed'; readonly message: string; readonly now: number}
  /** Отмена гостем или возврат по бездействию. */
  | {readonly type: 'cancel'; readonly now: number};

/** Побочные действия, которые должен выполнить внешний слой. */
export type SessionEffect =
  | {readonly type: 'capture'; readonly shotIndex: number}
  | {
      readonly type: 'enqueuePrint';
      readonly layoutId: LayoutId;
      readonly shots: readonly PhotoShot[];
    }
  /** Удалить временные файлы кадров, которые не пойдут в печать. */
  | {readonly type: 'discardShots'; readonly shots: readonly PhotoShot[]}
  /** Открыть системную галерею для выбора готового снимка. */
  | {readonly type: 'openGallery'}
  | {readonly type: 'sound'; readonly name: 'countdown' | 'shutter' | 'done' | 'error'}
  | {readonly type: 'haptic'};

export interface SessionConfig {
  /** Длительность обратного отсчёта, секунд. */
  readonly countdownSeconds: number;
  /** Сколько показывать «приготовьтесь» перед первым отсчётом, мс. */
  readonly getReadyMs: number;
  /** Пауза между кадрами серии, мс. */
  readonly interShotDelayMs: number;
  /** Сколько кадров снимает выбранная раскладка. */
  readonly shotsFor: (layoutId: LayoutId) => number;
  /** Сколько ждать решения гостя на экране просмотра, мс. */
  readonly reviewTimeoutMs: number;
  /** Отправлять снимок в печать, если гость ничего не нажал. */
  readonly autoPrintOnTimeout: boolean;
  /** Сколько ждать выбора раскладки, мс. */
  readonly chooseTimeoutMs: number;
  /** Сколько показывать экран благодарности, мс. */
  readonly thanksMs: number;
  /** Сколько показывать сообщение об ошибке, мс. */
  readonly errorMs: number;
  /** Сколько ждать ответа камеры, мс. */
  readonly captureTimeoutMs: number;
  /** Сколько ждать сборки листа и постановки в очередь, мс. */
  readonly submitTimeoutMs: number;
  /** Доступные раскладки. Если одна — экран выбора пропускается. */
  readonly layouts: readonly LayoutId[];
  /** Разрешить переснять кадр. */
  readonly allowRetake: boolean;
}

/** Значения по умолчанию — выверены под поток гостей на мероприятии. */
export const DEFAULT_SESSION_CONFIG: Omit<SessionConfig, 'shotsFor'> = {
  countdownSeconds: 3,
  getReadyMs: 1_500,
  interShotDelayMs: 1_200,
  // 20 секунд хватает, чтобы посмотреть на себя и решить, но не настолько
  // много, чтобы за спиной успела собраться очередь.
  reviewTimeoutMs: 20_000,
  autoPrintOnTimeout: true,
  chooseTimeoutMs: 30_000,
  thanksMs: 6_000,
  errorMs: 5_000,
  // Снимок обычно готов меньше чем за две секунды. Двадцать — это уже не
  // «медленно», а «не ответит»: без срока киоск вставал бы навсегда.
  captureTimeoutMs: 20_000,
  // Сборка листа 1200×1800 на слабом телефоне занимает секунды, поэтому срок
  // щедрый. Но он есть: экран отправки — единственный без кнопки выхода.
  submitTimeoutMs: 45_000,
  layouts: ['single', 'twinStrip3', 'grid4', 'polaroid'],
  allowRetake: true,
};

export interface Transition {
  readonly state: SessionState;
  readonly effects: readonly SessionEffect[];
}

/** Начальное состояние. */
export const initialState: SessionState = {name: 'attract'};

/** Чистый переход: состояние + событие -> новое состояние + побочные действия. */
export function reduce(
  state: SessionState,
  event: SessionEvent,
  config: SessionConfig,
): Transition {
  // Отмена работает почти отовсюду и всегда возвращает к заставке. Снятые,
  // но не напечатанные кадры при этом удаляются: чужие лица не должны
  // копиться на планшете дольше, чем нужно.
  if (event.type === 'cancel') {
    return {
      state: {name: 'attract'},
      effects: discardEffects(ownShotsOf(state)),
    };
  }

  switch (state.name) {
    case 'attract':
      return reduceAttract(state, event, config);
    case 'chooseLayout':
      return reduceChooseLayout(state, event, config);
    case 'getReady':
      return reduceGetReady(state, event, config);
    case 'countdown':
      return reduceCountdown(state, event, config);
    case 'capturing':
      return reduceCapturing(state, event, config);
    case 'betweenShots':
      return reduceBetweenShots(state, event, config);
    case 'review':
      return reduceReview(state, event, config);
    case 'printing':
      return reducePrinting(state, event, config);
    case 'thanks':
    case 'error':
      return reduceTimedScreen(state, event);
  }
}

function reduceAttract(
  state: SessionState,
  event: SessionEvent,
  config: SessionConfig,
): Transition {
  // Печать готового снимка минует выбор формата и отсчёт: кадр уже есть,
  // спрашивать «на сколько кадров» и считать до трёх незачем.
  if (event.type === 'pickPhoto') {
    return {state, effects: [{type: 'haptic'}, {type: 'openGallery'}]};
  }

  if (event.type === 'photoPicked') {
    return {
      state: {
        name: 'review',
        layoutId: 'single',
        shots: [event.shot],
        expiresAt: event.now + config.reviewTimeoutMs,
        source: 'gallery',
      },
      effects: [],
    };
  }

  // Галерея не открылась (нет доступа, системный сбой). Молча остаться на
  // заставке нельзя: гость нажал кнопку и должен увидеть ответ, иначе это
  // ровно то «нажал — и ничего не происходит», из-за которого будку считают
  // сломанной и уходят.
  if (event.type === 'printFailed') {
    return {
      state: {
        name: 'error',
        message: event.message,
        expiresAt: event.now + config.errorMs,
      },
      effects: [{type: 'sound', name: 'error'}],
    };
  }

  if (event.type !== 'start') {
    return stay(state);
  }
  // Одна раскладка — не спрашиваем, сразу к съёмке. Лишний экран на входе
  // отпугивает: гость должен видеть максимум одно решение.
  if (config.layouts.length <= 1) {
    const layoutId = config.layouts[0] ?? 'single';
    return {
      state: {
        name: 'getReady',
        layoutId,
        expiresAt: event.now + config.getReadyMs,
      },
      effects: [{type: 'haptic'}],
    };
  }
  return {
    state: {name: 'chooseLayout', expiresAt: event.now + config.chooseTimeoutMs},
    effects: [{type: 'haptic'}],
  };
}

function reduceChooseLayout(
  state: Extract<SessionState, {name: 'chooseLayout'}>,
  event: SessionEvent,
  config: SessionConfig,
): Transition {
  if (event.type === 'chooseLayout') {
    return {
      state: {
        name: 'getReady',
        layoutId: event.layoutId,
        expiresAt: event.now + config.getReadyMs,
      },
      effects: [{type: 'haptic'}],
    };
  }
  if (event.type === 'tick' && event.now >= state.expiresAt) {
    // Гость ушёл, не выбрав, — возвращаемся к заставке.
    return {state: {name: 'attract'}, effects: []};
  }
  return stay(state);
}

function reduceGetReady(
  state: Extract<SessionState, {name: 'getReady'}>,
  event: SessionEvent,
  config: SessionConfig,
): Transition {
  if (event.type === 'tick' && event.now >= state.expiresAt) {
    return {
      state: {
        name: 'countdown',
        layoutId: state.layoutId,
        shotIndex: 0,
        secondsLeft: config.countdownSeconds,
        nextTickAt: event.now + 1_000,
        shots: [],
      },
      effects: [{type: 'sound', name: 'countdown'}],
    };
  }
  return stay(state);
}

function reduceCountdown(
  state: Extract<SessionState, {name: 'countdown'}>,
  event: SessionEvent,
  config: SessionConfig,
): Transition {
  if (event.type !== 'tick' || event.now < state.nextTickAt) {
    return stay(state);
  }

  const secondsLeft = state.secondsLeft - 1;
  if (secondsLeft > 0) {
    return {
      state: {...state, secondsLeft, nextTickAt: event.now + 1_000},
      effects: [{type: 'sound', name: 'countdown'}],
    };
  }

  // Ноль — снимаем.
  return {
    state: {
      name: 'capturing',
      layoutId: state.layoutId,
      shotIndex: state.shotIndex,
      shots: state.shots,
      expiresAt: event.now + config.captureTimeoutMs,
    },
    effects: [
      {type: 'sound', name: 'shutter'},
      {type: 'capture', shotIndex: state.shotIndex},
    ],
  };
}

function reduceCapturing(
  state: Extract<SessionState, {name: 'capturing'}>,
  event: SessionEvent,
  config: SessionConfig,
): Transition {
  if (event.type === 'captureFailed') {
    return {
      state: {
        name: 'error',
        message: event.message,
        expiresAt: event.now + config.errorMs,
      },
      effects: [{type: 'sound', name: 'error'}, ...discardEffects(state.shots)],
    };
  }
  if (event.type === 'tick' && event.now >= state.expiresAt) {
    // Камера не ответила. Без этой ветки экран отсчёта застывал бы навсегда:
    // тактов в состоянии съёмки не было, а значит и выхода по времени тоже.
    return {
      state: {
        name: 'error',
        message: 'Камера не ответила',
        expiresAt: event.now + config.errorMs,
      },
      effects: [{type: 'sound', name: 'error'}, ...discardEffects(state.shots)],
    };
  }

  if (event.type !== 'shotTaken') {
    return stay(state);
  }

  const shots = [...state.shots, event.shot];
  const total = config.shotsFor(state.layoutId);

  if (shots.length >= total) {
    return {
      state: {
        name: 'review',
        layoutId: state.layoutId,
        shots,
        expiresAt: event.now + config.reviewTimeoutMs,
        source: 'camera',
      },
      effects: [],
    };
  }

  return {
    state: {
      name: 'betweenShots',
      layoutId: state.layoutId,
      shotIndex: shots.length,
      resumeAt: event.now + config.interShotDelayMs,
      shots,
    },
    effects: [],
  };
}

function reduceBetweenShots(
  state: Extract<SessionState, {name: 'betweenShots'}>,
  event: SessionEvent,
  config: SessionConfig,
): Transition {
  if (event.type === 'tick' && event.now >= state.resumeAt) {
    return {
      state: {
        name: 'countdown',
        layoutId: state.layoutId,
        shotIndex: state.shotIndex,
        secondsLeft: config.countdownSeconds,
        nextTickAt: event.now + 1_000,
        shots: state.shots,
      },
      effects: [{type: 'sound', name: 'countdown'}],
    };
  }
  return stay(state);
}

function reduceReview(
  state: Extract<SessionState, {name: 'review'}>,
  event: SessionEvent,
  config: SessionConfig,
): Transition {
  if (event.type === 'print') {
    return startPrinting(state, config, event.now);
  }

  if (event.type === 'retake' && config.allowRetake) {
    // Снимок из галереи «переснять» нельзя — можно выбрать другой.
    if (state.source === 'gallery') {
      return {
        state: {name: 'attract'},
        effects: [{type: 'haptic'}, {type: 'openGallery'}],
      };
    }
    return {
      state: {
        name: 'getReady',
        layoutId: state.layoutId,
        expiresAt: event.now + config.getReadyMs,
      },
      effects: [{type: 'haptic'}, ...discardEffects(state.shots)],
    };
  }

  if (event.type === 'tick' && event.now >= state.expiresAt) {
    // Гость не нажал ничего. Печатаем сами — иначе будка встанет.
    return config.autoPrintOnTimeout
      ? startPrinting(state, config, event.now)
      : {state: {name: 'attract'}, effects: discardEffects(ownShotsOf(state))};
  }

  return stay(state);
}

function startPrinting(
  state: Extract<SessionState, {name: 'review'}>,
  config: SessionConfig,
  now: number,
): Transition {
  return {
    state: {
      name: 'printing',
      layoutId: state.layoutId,
      shots: state.shots,
      expiresAt: now + config.submitTimeoutMs,
    },
    effects: [
      {type: 'haptic'},
      {type: 'enqueuePrint', layoutId: state.layoutId, shots: state.shots},
    ],
  };
}

function reducePrinting(
  state: Extract<SessionState, {name: 'printing'}>,
  event: SessionEvent,
  config: SessionConfig,
): Transition {
  if (event.type === 'printQueued') {
    return {
      state: {
        name: 'thanks',
        expiresAt: event.now + config.thanksMs,
        queuePosition: event.queuePosition,
      },
      effects: [{type: 'sound', name: 'done'}],
    };
  }
  if (event.type === 'printFailed') {
    return {
      state: {
        name: 'error',
        message: event.message,
        expiresAt: event.now + config.errorMs,
      },
      effects: [{type: 'sound', name: 'error'}, ...discardEffects(state.shots)],
    };
  }

  if (event.type === 'tick' && event.now >= state.expiresAt) {
    // Экран отправки — единственный без кнопки выхода, и тактов у него не
    // было. Зависшая сборка листа оставляла киоск мёртвым до перезапуска.
    return {
      state: {
        name: 'error',
        message: 'Не удалось отправить на печать',
        expiresAt: event.now + config.errorMs,
      },
      effects: [{type: 'sound', name: 'error'}, ...discardEffects(state.shots)],
    };
  }

  return stay(state);
}

function reduceTimedScreen(
  state: Extract<SessionState, {name: 'thanks' | 'error'}>,
  event: SessionEvent,
): Transition {
  // Экран сам возвращается к заставке; касание ускоряет возврат — следующий
  // гость не должен ждать таймаута.
  if (
    (event.type === 'tick' && event.now >= state.expiresAt) ||
    event.type === 'start'
  ) {
    return {state: {name: 'attract'}, effects: []};
  }
  return stay(state);
}

function stay(state: SessionState): Transition {
  return {state, effects: []};
}

/**
 * Кадры, которые приложение создало само и вправе удалить.
 *
 * Выбранный в галерее снимок сюда не попадает. Формально это копия в кеше
 * приложения (её делает сам выбор файла), но различить копию и оригинал по
 * пути нельзя, а цена ошибки несимметрична: лишний файл в кеше Android
 * уберёт сам, а удалённая чужая фотография не восстановится.
 */
function ownShotsOf(state: SessionState): readonly PhotoShot[] {
  if (state.name === 'review' && state.source === 'gallery') {
    return [];
  }
  return 'shots' in state ? state.shots : [];
}

function discardEffects(shots: readonly PhotoShot[]): SessionEffect[] {
  return shots.length > 0 ? [{type: 'discardShots', shots}] : [];
}

/** Ждёт ли состояние такта часов — экрану решать, заводить ли таймер. */
export function needsTicks(state: SessionState): boolean {
  return (
    state.name === 'chooseLayout' ||
    state.name === 'getReady' ||
    state.name === 'countdown' ||
    state.name === 'capturing' ||
    state.name === 'betweenShots' ||
    state.name === 'printing' ||
    state.name === 'review' ||
    state.name === 'thanks' ||
    state.name === 'error'
  );
}

/** Момент, когда состояние истекает; null — ждёт действия гостя. */
export function deadlineOf(state: SessionState): number | null {
  switch (state.name) {
    case 'chooseLayout':
    case 'getReady':
    case 'review':
    case 'thanks':
    case 'error':
    case 'capturing':
    case 'printing':
      return state.expiresAt;
    case 'countdown':
      return state.nextTickAt;
    case 'betweenShots':
      return state.resumeAt;
    default:
      return null;
  }
}
