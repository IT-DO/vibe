/**
 * Связка конечного автомата сессии с реальным миром.
 *
 * Автомат (`features/session/machine`) остаётся чистым и проверяемым; здесь
 * его побочные действия превращаются в снимки, собранные листы и задания
 * очереди. Всё, что может подвиснуть — камера, сборка листа, запись файла, —
 * живёт только тут.
 */

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';

import type {CameraLayerHandle} from './CameraLayer';
import {printQueue} from './services';
import {composeSheet, DEFAULT_COMPOSE} from '../imaging/composer';
import {loadTypeface} from '../imaging/typefaces';
import {layoutById, type LayoutId} from '../imaging/layouts';
import {shouldFlip} from '../imaging/mirror';
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
} from '../features/session/machine';
import {Paths, newFilePath, removeFile, writeBytes} from '../platform/files';
import {pickPhotoFromGallery} from '../platform/gallery';
import {recordError} from '../platform/crashlog';
import {saveSheetToAlbum} from '../platform/album';
import {trace, traceFailure} from '../platform/trace';
import {haptic, playCue} from '../platform/feedback';
import {mediaSizeOf, type Settings} from '../store/settings';
import {useStats} from '../store/stats';

/**
 * Разрешение печати.
 *
 * Не выбрано, а измерено. Перехват настоящей печати удалось расшифровать,
 * и в заголовке ушедшего в принтер JPEG стоит 1040 × 1560 пикселей. На
 * бумаге 50,8 × 76,2 мм это ровно 520 dpi — и ровно то, чего принтер ждёт.
 *
 * Отклоняться от этого размера нельзя: прошивка не масштабирует картинку
 * больше нужной, а обрезает её по центру, молча теряя края отпечатка.
 */
const PRINT_DPI = 520;

/** Как часто автомат получает такт. */
const TICK_MS = 100;

export interface KioskSession {
  readonly state: SessionState;
  /** URI собранного листа для экрана просмотра. */
  readonly previewUri: string | null;
  readonly busy: boolean;
  /** Сколько секунд осталось до истечения текущего состояния. */
  readonly secondsLeft: number;
  start(): void;
  /** Открыть галерею и напечатать готовый снимок. */
  pickPhoto(): void;
  chooseLayout(layoutId: LayoutId): void;
  print(): void;
  retake(): void;
  cancel(): void;
  dismiss(): void;
}

export function useKioskSession(
  settings: Settings,
  camera: React.RefObject<CameraLayerHandle | null>,
): KioskSession {
  const [state, setState] = useState<SessionState>(initialState);
  /**
   * Собранное превью вместе с приметой серии, из которой оно собрано.
   *
   * Одного адреса мало. Он оставался от прошлого гостя, и следующий видел
   * на экране просмотра чужой снимок: сборка не запускалась, потому что
   * превью «уже есть». Примета делает принадлежность явной — превью от
   * другой серии просто не считается превью.
   */
  const [preview, setPreview] = useState<{uri: string; key: string} | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const stats = useStats();
  // Держим состояние и в ссылке: обработчики эффектов асинхронные и не должны
  // зависеть от того, успел ли перерисоваться компонент.
  const stateRef = useRef(state);
  stateRef.current = state;

  /**
   * Уже собранный лист: путь к файлу и кадры, из которых он собран.
   *
   * Раньше лист собирался дважды — отдельно для просмотра и отдельно для
   * печати. Это удваивало ожидание гостя на самом заметном месте сценария, а
   * файл превью не удалялся никогда и за мероприятие занимал сотни мегабайт.
   * Теперь он собирается один раз и уходит в печать тем же файлом.
   */
  const composedSheet = useRef<{path: string; key: string} | null>(null);

  /** Забывает собранный лист и убирает файл, если он не ушёл в печать. */
  const dropComposedSheet = useCallback(async () => {
    const sheet = composedSheet.current;
    composedSheet.current = null;
    if (sheet) {
      await removeFile(sheet.path);
    }
  }, []);

  const config: SessionConfig = useMemo(
    () => ({
      ...DEFAULT_SESSION_CONFIG,
      countdownSeconds: settings.capture.countdownSeconds,
      reviewTimeoutMs: settings.flow.reviewTimeoutMs,
      autoPrintOnTimeout: settings.flow.autoPrintOnTimeout,
      allowRetake: settings.flow.allowRetake,
      thanksMs: settings.flow.thanksMs,
      layouts: settings.flow.layouts,
      shotsFor: id => layoutById(id).shots,
      interShotDelayMs: layoutById(settings.flow.layouts[0] ?? 'single').interShotDelayMs,
    }),
    [settings],
  );

  /**
   * Выполняет побочные действия, порождённые переходом.
   *
   * Каждое действие изолировано. Иначе сбой второстепенного отменял бы
   * главное: на нуле отсчёта список — [звук, снимок], и упавший звук унёс бы
   * с собой сам кадр. Ровно так и вело себя приложение, когда вибрация
   * падала без разрешения VIBRATE.
   */
  const runEffects = useCallback(
    async (effects: readonly SessionEffect[]) => {
      for (const effect of effects) {
        try {
          await runEffect(effect);
        } catch (error) {
          // Действие не удалось — сценарий продолжается. Те действия, чей
          // провал важен для гостя (съёмка, печать), сообщают о себе сами,
          // отправляя событие в автомат.
          console.warn('Побочное действие не выполнено:', effect.type, error);
          void recordError(`Побочное действие «${effect.type}»`, error);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings],
  );

  /** Одно побочное действие. */
  const runEffect = useCallback(
    async (effect: SessionEffect) => {
      switch (effect.type) {
        case 'haptic':
          haptic();
          break;
        case 'sound':
          playCue(effect.name);
          break;
        case 'discardShots':
          await Promise.all(effect.shots.map(shot => removeFile(shot.path)));
          await dropComposedSheet();
          setPreview(null);
          break;
        case 'capture':
          await handleCapture();
          break;
        case 'enqueuePrint':
          await handleEnqueue(effect.layoutId, effect.shots);
          break;
        case 'openGallery':
          await handlePickPhoto();
          break;
      }
    },
    // handleCapture/handleEnqueue объявлены ниже и стабильны в пределах
    // жизни компонента.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings],
  );

  // Настройки и обработчик эффектов держим в ссылках, чтобы `send` был
  // стабильным навсегда. Иначе обработчики, запомнившие его при первом
  // отрисовывании (например, выбор снимка из галереи), продолжали бы работать
  // со старыми настройками после любого изменения в админке.
  const configRef = useRef(config);
  configRef.current = config;
  const runEffectsRef = useRef(runEffects);
  runEffectsRef.current = runEffects;

  /** Отправляет событие в автомат и выполняет его эффекты. */
  const send = useCallback((event: SessionEvent) => {
    const transition = reduce(stateRef.current, event, configRef.current);
    if (transition.state.name !== stateRef.current.name) {
      trace('сессия', 'переход', {
        из: stateRef.current.name,
        в: transition.state.name,
        по: event.type,
      });
    }
    stateRef.current = transition.state;
    setState(transition.state);
    if (transition.effects.length > 0) {
      void runEffectsRef.current(transition.effects);
    }
  }, []);

  /** Делает снимок и возвращает его в автомат. */
  const handleCapture = useCallback(async () => {
    try {
      const handle = camera.current;
      if (!handle) {
        throw new Error('Камера недоступна');
      }
      const photo = await handle.capture();
      const shot: PhotoShot = {
        path: photo.path,
        width: photo.width,
        height: photo.height,
        takenAt: Date.now(),
        isMirrored: photo.isMirrored,
        origin: 'camera',
      };
      send({type: 'shotTaken', shot, now: Date.now()});
    } catch (error) {
      send({
        type: 'captureFailed',
        message: error instanceof Error ? error.message : 'Не удалось сделать снимок',
        now: Date.now(),
      });
    }
  }, [camera, send]);

  /**
   * Параметры сборки листа. Одни и те же для просмотра и для печати: гость
   * должен получить ровно то, что видел на экране.
   */
  const composeOptionsFor = useCallback(
    async (shots: readonly PhotoShot[], layoutId: LayoutId) => {
      // Рукописная антиква подписи лежит в ассетах приложения и читается
      // один раз за запуск. Если файла не окажется, `loadTypeface` вернёт
      // системный шрифт или `null` — лист соберётся в любом случае.
      trace('сборка', 'готовим настройки листа', {
        кадров: shots.length,
        раскладка: layoutId,
      });
      const typeface = settings.event.title ? await loadTypeface('script') : null;
      return {
        shotPaths: shots.map(shot => shot.path),
        layout: layoutById(layoutId),
        media: mediaSizeOf(settings.printer.media),
        dpi: PRINT_DPI,
        ...(settings.framePath ? {framePath: settings.framePath} : {}),
        caption: settings.event.title
          ? {
              title: settings.event.title,
              ...(settings.event.subtitle ? {subtitle: settings.event.subtitle} : {}),
              color: '#2A2A32',
            }
          : undefined,
        ...(typeface ? {typeface} : {}),
        ...DEFAULT_COMPOSE,
        mirror: mirrorFor(shots, settings.capture.mirrorPrint),
      };
    },
    [settings],
  );

  /** Открывает галерею и возвращает выбранный снимок в автомат. */
  const handlePickPhoto = useCallback(async () => {
    const result = await pickPhotoFromGallery();
    if (result.kind === 'picked') {
      send({
        type: 'photoPicked',
        shot: {
          path: result.photo.path,
          width: result.photo.width,
          height: result.photo.height,
          takenAt: Date.now(),
          isMirrored: false,
          origin: 'gallery',
        },
        now: Date.now(),
      });
      return;
    }
    if (result.kind === 'error') {
      send({type: 'pickFailed', message: result.message, now: Date.now()});
    }
    // Отмена выбора — молча остаёмся на заставке.
  }, [send]);

  /** Ставит собранный лист в очередь печати. */
  const handleEnqueue = useCallback(
    async (layoutId: LayoutId, shots: readonly PhotoShot[]) => {
      setBusy(true);
      try {
        const ready = composedSheet.current;

        let sheetPath: string;
        // Принтер принимает только JPEG — другого формата в приложении нет.
        const format = 'image/jpeg';

        if (ready && ready.key === sheetKey(shots)) {
          // Лист уже собран для просмотра — печатаем ровно тот же файл.
          // Дальше им владеет очередь: она удалит его после печати.
          sheetPath = ready.path;
          composedSheet.current = null;
        } else {
          // Просмотра не было — собираем лист сейчас.
          const sheet = await composeSheet(await composeOptionsFor(shots, layoutId));
          sheetPath = newFilePath(Paths.sheets, 'jpg');
          await writeBytes(sheetPath, sheet.jpeg);
          await dropComposedSheet();
        }

        // В галерею — до постановки в очередь: дальше файлом владеет
        // очередь и удалит его сразу после печати.
        if (settings.privacy.saveToAlbum) {
          // Гарантия «не мешать печати» должна быть здесь, а не только
          // внутри модуля галереи: гость пришёл за отпечатком, и терять
          // его из-за неудачной записи в альбом недопустимо.
          await saveSheetToAlbum(sheetPath).catch(error =>
            traceFailure('галерея', 'сохранение отпечатка', error),
          );
        }

        trace('печать', 'ставим в очередь', {файл: sheetPath, копий: settings.printer.copies});
        await printQueue.enqueue({
          filePath: sheetPath,
          format,
          name: jobNameFor(settings.event.title),
          copies: settings.printer.copies,
        });

        // Исходные кадры больше не нужны: в лист они уже вошли, а он при
        // необходимости сохранён в галерею. Удаляем только свои: путь,
        // пришедший из галереи, указывает на собственную фотографию
        // гостя, и восстановить её будет нечем.
        const own = shots.filter(shot => shot.origin === 'camera');
        await Promise.all(own.map(shot => removeFile(shot.path)));

        stats.countSession();
        stats.countPrinted(settings.printer.copies);
        send({
          type: 'printQueued',
          queuePosition: printQueue.snapshot().pending,
          now: Date.now(),
        });
      } catch (error) {
        // Гость видит короткое сообщение и уходит, а разбираться приходится
        // потом и без него. Поэтому подробности — в журнал: он остаётся на
        // устройстве и отправляется из админки одной кнопкой.
        traceFailure('печать', 'постановка в очередь', error);
        void recordError('Печать', error);
        stats.countFailed();
        send({
          type: 'printFailed',
          message: error instanceof Error ? error.message : 'Не удалось напечатать',
          now: Date.now(),
        });
      } finally {
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings],
  );

  // Такты: заводим таймер только там, где автомат их ждёт. На заставке
  // приложение ничего не считает и не будит процессор впустую.
  useEffect(() => {
    if (!needsTicks(state)) {
      return;
    }
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      send({type: 'tick', now: current});
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [state, send]);

  /** Примета текущей серии; вне просмотра её нет. */
  const currentKey = state.name === 'review' ? sheetKey(state.shots) : null;

  /**
   * Превью показывается, только если собрано из тех кадров, что на экране.
   * Пока собирается новое, экран показывает заглушку, а не чужой снимок.
   */
  const previewUri = currentKey && preview?.key === currentKey ? preview.uri : null;

  // Превью листа собираем, как только набралась вся серия.
  useEffect(() => {
    if (state.name !== 'review') {
      return;
    }
    const key = sheetKey(state.shots);
    if (preview?.key === key) {
      return; // уже собрано для этой серии
    }

    let cancelled = false;
    void (async () => {
      try {
        // Качество печатное, а не пониженное: этот же файл уйдёт в принтер.
        // Показывать гостю одно, а печатать другое — источник претензий.
        const sheet = await composeSheet(
          await composeOptionsFor(state.shots, state.layoutId),
        );
        if (cancelled) {
          return;
        }
        const path = newFilePath(Paths.sheets, 'jpg');
        await writeBytes(path, sheet.jpeg);
        if (cancelled) {
          await removeFile(path);
          return;
        }
        // Прежний лист больше не нужен: он от другой серии, и на диске
        // ему оставаться незачем.
        await dropComposedSheet();
        composedSheet.current = {path, key};
        setPreview({uri: `file://${path}`, key});
      } catch (error) {
        // Без превью экран покажет заглушку — сценарий не рвётся.
        traceFailure('сборка', 'превью листа', error);
        void recordError('Сборка превью', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state, preview, composeOptionsFor, dropComposedSheet]);

  const secondsLeft = useMemo(() => {
    const deadline = deadlineOf(state);
    if (deadline === null || state.name === 'countdown') {
      return 0;
    }
    return Math.max(0, Math.ceil((deadline - now) / 1000));
  }, [state, now]);

  return {
    state,
    previewUri,
    busy,
    secondsLeft,
    start: () => send({type: 'start', now: Date.now()}),
    pickPhoto: () => send({type: 'pickPhoto', now: Date.now()}),
    chooseLayout: layoutId => send({type: 'chooseLayout', layoutId, now: Date.now()}),
    print: () => send({type: 'print', now: Date.now()}),
    retake: () => {
      stats.countRetake();
      send({type: 'retake', now: Date.now()});
    },
    cancel: () => send({type: 'cancel', now: Date.now()}),
    dismiss: () => send({type: 'start', now: Date.now()}),
  };
}

/**
 * Ключ набора кадров: по нему видно, что собранный лист ещё актуален.
 * Пути кадров уникальны и не переиспользуются, поэтому их достаточно.
 */
function sheetKey(shots: readonly PhotoShot[]): string {
  return shots.map(shot => shot.path).join('|');
}

/**
 * Отражать ли кадры серии при сборке листа.
 *
 * Решение принимается по первому кадру: вся серия снята одной камерой в
 * одном сценарии, поэтому их фактическая зеркальность одинакова.
 */
function mirrorFor(shots: readonly PhotoShot[], wantMirrored: boolean): boolean {
  const first = shots[0];
  if (!first) {
    return false;
  }
  return shouldFlip({
    fromCamera: first.origin === 'camera',
    fileIsMirrored: first.isMirrored,
    wantMirrored,
  });
}

/**
 * Имя задания в журнале принтера — помогает разбирать спорные случаи
 * («а моё фото вообще ушло на печать?»).
 *
 * Время собираем вручную, а не через `toLocaleTimeString`: поддержка Intl в
 * Hermes зависит от сборки и платформы, а падать на формировании имени
 * задания посреди мероприятия — недопустимо.
 */
function jobNameFor(eventTitle: string, now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  return eventTitle ? `${eventTitle} · ${stamp}` : `Фото на память · ${stamp}`;
}
