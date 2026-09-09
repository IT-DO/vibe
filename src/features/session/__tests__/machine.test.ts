import {
  DEFAULT_SESSION_CONFIG,
  deadlineOf,
  initialState,
  needsTicks,
  reduce,
  type PhotoShot,
  type SessionConfig,
  type SessionEffect,
  type SessionEvent,
  type SessionState,
} from '../machine';

const SHOTS_PER_LAYOUT: Record<string, number> = {
  single: 1,
  twinStrip3: 3,
  grid4: 4,
  polaroid: 1,
};

function makeConfig(overrides: Partial<SessionConfig> = {}): SessionConfig {
  return {
    ...DEFAULT_SESSION_CONFIG,
    shotsFor: id => SHOTS_PER_LAYOUT[id] ?? 1,
    ...overrides,
  };
}

const shot = (n: number, at = 1000): PhotoShot => ({
  path: `/tmp/shot-${n}.jpg`,
  width: 4032,
  height: 3024,
  takenAt: at,
  mirrored: true,
});

/** Прогоняет цепочку событий, собирая все побочные действия. */
function run(
  events: SessionEvent[],
  config = makeConfig(),
  from: SessionState = initialState,
): {state: SessionState; effects: SessionEffect[]} {
  let state = from;
  const effects: SessionEffect[] = [];
  for (const event of events) {
    const transition = reduce(state, event, config);
    state = transition.state;
    effects.push(...transition.effects);
  }
  return {state, effects};
}

describe('заставка', () => {
  it('стартует с экрана заставки', () => {
    expect(initialState).toEqual({name: 'attract'});
  });

  it('касание ведёт к выбору раскладки, если их несколько', () => {
    const {state} = run([{type: 'start', now: 0}]);
    expect(state.name).toBe('chooseLayout');
  });

  it('с единственной раскладкой экран выбора пропускается', () => {
    const config = makeConfig({layouts: ['single']});
    const {state} = run([{type: 'start', now: 0}], config);
    expect(state).toMatchObject({name: 'getReady', layoutId: 'single'});
  });

  it('такты на заставке ничего не меняют', () => {
    const {state} = run([{type: 'tick', now: 999_999}]);
    expect(state.name).toBe('attract');
  });

  it('даёт тактильный отклик на касание', () => {
    const {effects} = run([{type: 'start', now: 0}]);
    expect(effects).toContainEqual({type: 'haptic'});
  });
});

describe('выбор раскладки', () => {
  it('переходит к подготовке после выбора', () => {
    const {state} = run([
      {type: 'start', now: 0},
      {type: 'chooseLayout', layoutId: 'twinStrip3', now: 100},
    ]);
    expect(state).toMatchObject({name: 'getReady', layoutId: 'twinStrip3'});
  });

  it('возвращается к заставке, если гость ушёл не выбрав', () => {
    const config = makeConfig({chooseTimeoutMs: 30_000});
    const {state} = run(
      [
        {type: 'start', now: 0},
        {type: 'tick', now: 30_000},
      ],
      config,
    );
    expect(state.name).toBe('attract');
  });

  it('до истечения времени остаётся на экране выбора', () => {
    const {state} = run([
      {type: 'start', now: 0},
      {type: 'tick', now: 29_999},
    ]);
    expect(state.name).toBe('chooseLayout');
  });
});

describe('обратный отсчёт и съёмка', () => {
  const config = makeConfig({layouts: ['single'], countdownSeconds: 3, getReadyMs: 1_500});

  const toCountdown = (): SessionState =>
    run(
      [
        {type: 'start', now: 0},
        {type: 'tick', now: 1_500},
      ],
      config,
    ).state;

  it('после подготовки начинается отсчёт с заданного числа', () => {
    expect(toCountdown()).toMatchObject({name: 'countdown', secondsLeft: 3, shotIndex: 0});
  });

  it('отсчёт идёт по одной секунде', () => {
    let state = toCountdown();
    state = reduce(state, {type: 'tick', now: 2_500}, config).state;
    expect(state).toMatchObject({name: 'countdown', secondsLeft: 2});
    state = reduce(state, {type: 'tick', now: 3_500}, config).state;
    expect(state).toMatchObject({name: 'countdown', secondsLeft: 1});
  });

  it('частые такты не ускоряют отсчёт', () => {
    let state = toCountdown();
    for (let now = 1_600; now < 2_500; now += 50) {
      state = reduce(state, {type: 'tick', now}, config).state;
    }
    expect(state).toMatchObject({name: 'countdown', secondsLeft: 3});
  });

  it('на нуле выдаёт команду снимать', () => {
    let state = toCountdown();
    const effects: SessionEffect[] = [];
    for (const now of [2_500, 3_500, 4_500]) {
      const t = reduce(state, {type: 'tick', now}, config);
      state = t.state;
      effects.push(...t.effects);
    }
    expect(state).toMatchObject({name: 'capturing', shotIndex: 0});
    expect(effects).toContainEqual({type: 'capture', shotIndex: 0});
    expect(effects).toContainEqual({type: 'sound', name: 'shutter'});
  });

  it('каждая секунда отсчёта озвучивается', () => {
    let state = toCountdown();
    let sounds = 0;
    for (const now of [2_500, 3_500]) {
      const t = reduce(state, {type: 'tick', now}, config);
      state = t.state;
      sounds += t.effects.filter(e => e.type === 'sound' && e.name === 'countdown').length;
    }
    expect(sounds).toBe(2);
  });
});

describe('серия кадров', () => {
  const config = makeConfig({layouts: ['twinStrip3'], interShotDelayMs: 1_200});

  function captureAll(shotsToTake: number): SessionState {
    let state: SessionState = {
      name: 'capturing',
      layoutId: 'twinStrip3',
      shotIndex: 0,
      shots: [],
    };
    for (let i = 0; i < shotsToTake; i++) {
      state = reduce(state, {type: 'shotTaken', shot: shot(i), now: i * 5_000}, config).state;
      if (state.name === 'betweenShots') {
        state = reduce(state, {type: 'tick', now: state.resumeAt}, config).state;
        // Отсчёт до следующего кадра.
        while (state.name === 'countdown') {
          state = reduce(state, {type: 'tick', now: state.nextTickAt}, config).state;
        }
      }
    }
    return state;
  }

  it('после кадра делает паузу перед следующим', () => {
    const state = reduce(
      {name: 'capturing', layoutId: 'twinStrip3', shotIndex: 0, shots: []},
      {type: 'shotTaken', shot: shot(0), now: 5_000},
      config,
    ).state;
    expect(state).toMatchObject({name: 'betweenShots', shotIndex: 1, resumeAt: 6_200});
  });

  it('снимает ровно столько кадров, сколько требует раскладка', () => {
    const state = captureAll(3);
    expect(state.name).toBe('review');
    expect('shots' in state && state.shots).toHaveLength(3);
  });

  it('копит кадры, не теряя предыдущие', () => {
    let state: SessionState = {
      name: 'capturing',
      layoutId: 'twinStrip3',
      shotIndex: 0,
      shots: [shot(0), shot(1)],
    };
    state = reduce(state, {type: 'shotTaken', shot: shot(2), now: 9_000}, config).state;
    expect(state.name).toBe('review');
    expect('shots' in state && state.shots.map(s => s.path)).toEqual([
      '/tmp/shot-0.jpg',
      '/tmp/shot-1.jpg',
      '/tmp/shot-2.jpg',
    ]);
  });

  it('одиночная раскладка сразу ведёт к просмотру', () => {
    const single = makeConfig({layouts: ['single']});
    const state = reduce(
      {name: 'capturing', layoutId: 'single', shotIndex: 0, shots: []},
      {type: 'shotTaken', shot: shot(0), now: 5_000},
      single,
    ).state;
    expect(state.name).toBe('review');
  });

  it('сбой камеры показывает ошибку и удаляет снятое', () => {
    const {state, effects} = run(
      [{type: 'captureFailed', message: 'Камера занята', now: 5_000}],
      config,
      {name: 'capturing', layoutId: 'twinStrip3', shotIndex: 1, shots: [shot(0)]},
    );
    expect(state).toMatchObject({name: 'error', message: 'Камера занята'});
    expect(effects).toContainEqual({type: 'discardShots', shots: [shot(0)]});
  });
});

describe('просмотр и печать', () => {
  const config = makeConfig({layouts: ['single'], reviewTimeoutMs: 20_000});
  const reviewState: SessionState = {
    name: 'review',
    layoutId: 'single',
    shots: [shot(0)],
    expiresAt: 20_000,
    source: 'camera',
  };

  it('кнопка «печатать» ставит снимок в очередь', () => {
    const {state, effects} = run([{type: 'print', now: 1_000}], config, reviewState);
    expect(state.name).toBe('printing');
    expect(effects).toContainEqual({
      type: 'enqueuePrint',
      layoutId: 'single',
      shots: [shot(0)],
    });
  });

  it('кнопка «переснять» возвращает к подготовке и удаляет кадры', () => {
    const {state, effects} = run([{type: 'retake', now: 1_000}], config, reviewState);
    expect(state).toMatchObject({name: 'getReady', layoutId: 'single'});
    expect(effects).toContainEqual({type: 'discardShots', shots: [shot(0)]});
  });

  it('если пересъёмка запрещена, кнопка ничего не делает', () => {
    const strict = makeConfig({allowRetake: false});
    const {state} = run([{type: 'retake', now: 1_000}], strict, reviewState);
    expect(state.name).toBe('review');
  });

  it('по истечении времени печатает сама, чтобы будка не встала', () => {
    const {state, effects} = run([{type: 'tick', now: 20_000}], config, reviewState);
    expect(state.name).toBe('printing');
    expect(effects.some(e => e.type === 'enqueuePrint')).toBe(true);
  });

  it('с выключенной автопечатью по таймауту снимок удаляется', () => {
    const noAuto = makeConfig({autoPrintOnTimeout: false});
    const {state, effects} = run([{type: 'tick', now: 20_000}], noAuto, reviewState);
    expect(state.name).toBe('attract');
    expect(effects).toContainEqual({type: 'discardShots', shots: [shot(0)]});
  });

  it('до таймаута остаётся на просмотре', () => {
    const {state} = run([{type: 'tick', now: 19_999}], config, reviewState);
    expect(state.name).toBe('review');
  });
});

describe('после постановки в очередь', () => {
  const config = makeConfig();
  const printingState: SessionState = {
    name: 'printing',
    layoutId: 'single',
    shots: [shot(0)],
  };

  it('показывает благодарность с местом в очереди', () => {
    const {state, effects} = run(
      [{type: 'printQueued', queuePosition: 2, now: 1_000}],
      config,
      printingState,
    );
    expect(state).toMatchObject({name: 'thanks', queuePosition: 2});
    expect(effects).toContainEqual({type: 'sound', name: 'done'});
  });

  it('ошибка постановки показывает сообщение и чистит кадры', () => {
    const {state, effects} = run(
      [{type: 'printFailed', message: 'Нет связи с принтером', now: 1_000}],
      config,
      printingState,
    );
    expect(state).toMatchObject({name: 'error', message: 'Нет связи с принтером'});
    expect(effects).toContainEqual({type: 'discardShots', shots: [shot(0)]});
  });

  it('экран благодарности сам возвращается к заставке', () => {
    const {state} = run([{type: 'tick', now: 7_000}], config, {
      name: 'thanks',
      expiresAt: 6_000,
      queuePosition: 1,
    });
    expect(state.name).toBe('attract');
  });

  it('касание ускоряет возврат — следующий гость не ждёт', () => {
    const {state} = run([{type: 'start', now: 100}], config, {
      name: 'thanks',
      expiresAt: 6_000,
      queuePosition: 1,
    });
    expect(state.name).toBe('attract');
  });

  it('экран ошибки тоже сам закрывается', () => {
    const {state} = run([{type: 'tick', now: 5_001}], config, {
      name: 'error',
      message: 'что-то не так',
      expiresAt: 5_000,
    });
    expect(state.name).toBe('attract');
  });
});

describe('отмена', () => {
  it('возвращает к заставке из любого состояния', () => {
    const config = makeConfig();
    const states: SessionState[] = [
      {name: 'chooseLayout', expiresAt: 1},
      {name: 'getReady', layoutId: 'single', expiresAt: 1},
      {name: 'countdown', layoutId: 'single', shotIndex: 0, secondsLeft: 2, nextTickAt: 1, shots: []},
      {name: 'capturing', layoutId: 'single', shotIndex: 0, shots: []},
      {name: 'review', layoutId: 'single', shots: [shot(0)], expiresAt: 1, source: 'camera'},
      {name: 'printing', layoutId: 'single', shots: [shot(0)]},
    ];
    for (const state of states) {
      expect(reduce(state, {type: 'cancel', now: 0}, config).state.name).toBe('attract');
    }
  });

  it('удаляет уже снятые кадры', () => {
    const config = makeConfig();
    const {effects} = run([{type: 'cancel', now: 0}], config, {
      name: 'review',
      layoutId: 'twinStrip3',
      shots: [shot(0), shot(1)],
      expiresAt: 1,
    source: 'camera',
    });
    expect(effects).toContainEqual({type: 'discardShots', shots: [shot(0), shot(1)]});
  });

  it('без снятых кадров ничего не удаляет', () => {
    const {effects} = run([{type: 'cancel', now: 0}], makeConfig(), {
      name: 'chooseLayout',
      expiresAt: 1,
    });
    expect(effects).toEqual([]);
  });
});

describe('печать готового снимка из галереи', () => {
  const config = makeConfig();
  const picked = (): PhotoShot => ({
    path: 'content://media/external/images/1042',
    width: 4032,
    height: 3024,
    takenAt: 1_000,
    // Снимок сделан не нашей фронтальной камерой — зеркалить его нельзя.
    mirrored: false,
  });

  it('кнопка на заставке открывает галерею, не начиная съёмку', () => {
    const {state, effects} = run([{type: 'pickPhoto', now: 0}], config);
    expect(state.name).toBe('attract');
    expect(effects).toContainEqual({type: 'openGallery'});
  });

  it('выбранный снимок сразу попадает на просмотр, минуя отсчёт', () => {
    const {state, effects} = run(
      [
        {type: 'pickPhoto', now: 0},
        {type: 'photoPicked', shot: picked(), now: 500},
      ],
      config,
    );
    expect(state).toMatchObject({name: 'review', layoutId: 'single', source: 'gallery'});
    expect('shots' in state && state.shots).toEqual([picked()]);
    // Ни отсчёта, ни команды снимать.
    expect(effects.filter(e => e.type === 'capture')).toHaveLength(0);
  });

  it('печатается как обычный снимок', () => {
    const {state, effects} = run([{type: 'print', now: 1_000}], config, {
      name: 'review',
      layoutId: 'single',
      shots: [picked()],
      expiresAt: 20_000,
      source: 'gallery',
    });
    expect(state.name).toBe('printing');
    expect(effects).toContainEqual({
      type: 'enqueuePrint',
      layoutId: 'single',
      shots: [picked()],
    });
  });

  it('«переснять» открывает галерею заново, а не камеру', () => {
    const {state, effects} = run([{type: 'retake', now: 1_000}], config, {
      name: 'review',
      layoutId: 'single',
      shots: [picked()],
      expiresAt: 20_000,
      source: 'gallery',
    });
    expect(state.name).toBe('attract');
    expect(effects).toContainEqual({type: 'openGallery'});
  });

  it('НЕ удаляет выбранный файл при отмене — он принадлежит человеку', () => {
    const {effects} = run([{type: 'cancel', now: 1_000}], config, {
      name: 'review',
      layoutId: 'single',
      shots: [picked()],
      expiresAt: 20_000,
      source: 'gallery',
    });
    expect(effects.filter(e => e.type === 'discardShots')).toHaveLength(0);
  });

  it('НЕ удаляет выбранный файл при «переснять»', () => {
    const {effects} = run([{type: 'retake', now: 1_000}], config, {
      name: 'review',
      layoutId: 'single',
      shots: [picked()],
      expiresAt: 20_000,
      source: 'gallery',
    });
    expect(effects.filter(e => e.type === 'discardShots')).toHaveLength(0);
  });

  it('НЕ удаляет выбранный файл по таймауту без автопечати', () => {
    const noAuto = makeConfig({autoPrintOnTimeout: false});
    const {state, effects} = run([{type: 'tick', now: 20_000}], noAuto, {
      name: 'review',
      layoutId: 'single',
      shots: [picked()],
      expiresAt: 20_000,
      source: 'gallery',
    });
    expect(state.name).toBe('attract');
    expect(effects.filter(e => e.type === 'discardShots')).toHaveLength(0);
  });

  it('а снятый камерой кадр по-прежнему удаляется', () => {
    const {effects} = run([{type: 'cancel', now: 1_000}], config, {
      name: 'review',
      layoutId: 'single',
      shots: [shot(0)],
      expiresAt: 20_000,
      source: 'camera',
    });
    expect(effects).toContainEqual({type: 'discardShots', shots: [shot(0)]});
  });

  it('выбор снимка посреди съёмки игнорируется', () => {
    const {state} = run([{type: 'photoPicked', shot: picked(), now: 100}], config, {
      name: 'countdown',
      layoutId: 'single',
      shotIndex: 0,
      secondsLeft: 2,
      nextTickAt: 500,
      shots: [],
    });
    expect(state.name).toBe('countdown');
  });
});

describe('полный сценарий гостя', () => {
  it('проходит от касания до благодарности', () => {
    const config = makeConfig({layouts: ['single'], countdownSeconds: 3});
    let state = initialState;
    const effects: SessionEffect[] = [];
    const step = (event: SessionEvent) => {
      const t = reduce(state, event, config);
      state = t.state;
      effects.push(...t.effects);
    };

    step({type: 'start', now: 0});
    step({type: 'tick', now: 1_500}); // конец «приготовьтесь»
    step({type: 'tick', now: 2_500}); // 3 -> 2
    step({type: 'tick', now: 3_500}); // 2 -> 1
    step({type: 'tick', now: 4_500}); // 1 -> снимок
    step({type: 'shotTaken', shot: shot(0, 4_600), now: 4_600});
    step({type: 'print', now: 6_000});
    step({type: 'printQueued', queuePosition: 1, now: 6_200});

    expect(state).toMatchObject({name: 'thanks', queuePosition: 1});
    expect(effects.filter(e => e.type === 'capture')).toHaveLength(1);
    expect(effects.filter(e => e.type === 'enqueuePrint')).toHaveLength(1);
    // Напечатанные кадры не удаляются — их забирает очередь печати.
    expect(effects.filter(e => e.type === 'discardShots')).toHaveLength(0);
  });

  it('серия из трёх кадров доходит до очереди печати целиком', () => {
    const config = makeConfig({layouts: ['twinStrip3'], countdownSeconds: 1});
    let state = initialState;
    let now = 0;
    const effects: SessionEffect[] = [];
    const step = (event: SessionEvent) => {
      const t = reduce(state, event, config);
      state = t.state;
      effects.push(...t.effects);
    };

    step({type: 'start', now});
    step({type: 'chooseLayout', layoutId: 'twinStrip3', now});

    for (let i = 0; i < 3; i++) {
      // Ждём все таймеры текущего состояния, пока не сработает затвор.
      for (let guard = 0; guard < 10 && state.name !== 'capturing'; guard++) {
        const deadline = deadlineOf(state);
        now = deadline === null ? now + 1_000 : deadline;
        step({type: 'tick', now});
      }
      expect(state.name).toBe('capturing');
      now += 100;
      step({type: 'shotTaken', shot: shot(i, now), now});
    }

    expect(state.name).toBe('review');
    step({type: 'print', now});
    const enqueue = effects.find(e => e.type === 'enqueuePrint');
    expect(enqueue).toMatchObject({layoutId: 'twinStrip3'});
    expect(enqueue && 'shots' in enqueue && enqueue.shots).toHaveLength(3);
  });
});

describe('вспомогательные функции', () => {
  it('needsTicks помечает состояния с таймерами', () => {
    expect(needsTicks({name: 'attract'})).toBe(false);
    expect(needsTicks({name: 'capturing', layoutId: 'single', shotIndex: 0, shots: []})).toBe(
      false,
    );
    expect(needsTicks({name: 'review', layoutId: 'single', shots: [], expiresAt: 1, source: 'camera'})).toBe(true);
    expect(needsTicks({name: 'thanks', expiresAt: 1, queuePosition: 1})).toBe(true);
  });

  it('deadlineOf возвращает момент истечения состояния', () => {
    expect(deadlineOf({name: 'review', layoutId: 'single', shots: [], expiresAt: 4_242, source: 'camera'})).toBe(
      4_242,
    );
    expect(
      deadlineOf({
        name: 'countdown',
        layoutId: 'single',
        shotIndex: 0,
        secondsLeft: 3,
        nextTickAt: 900,
        shots: [],
      }),
    ).toBe(900);
    expect(deadlineOf({name: 'attract'})).toBeNull();
  });
});
