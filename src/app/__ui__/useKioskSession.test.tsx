/**
 * Оркестровка сессии: автомат встречается с камерой, сборкой листа и очередью.
 *
 * Автомат проверен отдельно и без React. Здесь проверяется ровно стык — то,
 * что в реальных отказах и ломалось: камера не отвечает, сборка листа падает,
 * галерею закрыли, принтер не берёт JPEG. Ни один из этих случаев не должен
 * оставлять будку в состоянии, из которого гость не выберется сам.
 */

import React from 'react';
import {act, renderHook, waitFor} from '@testing-library/react-native';

import {useKioskSession} from '../useKioskSession';
import {DEFAULT_SETTINGS, type Settings} from '../../store/settings';
import type {CameraLayerHandle} from '../CameraLayer';

// ── Заглушки соседних слоёв ───────────────────────────────────────────────
const mockEnqueue = jest.fn(async (_job: {filePath: string; format: string}) => undefined);
const mockSnapshot = jest.fn(() => ({pending: 1}));
const mockTransport = {documentFormat: 'image/jpeg' as string | undefined};

jest.mock('../services', () => ({
  printQueue: {
    enqueue: (job: {filePath: string; format: string}) => mockEnqueue(job),
    snapshot: () => mockSnapshot(),
  },
  activeTransport: () => mockTransport,
}));

const mockComposeSheet = jest.fn(async (_options: Record<string, unknown>) => ({
  jpeg: Uint8Array.from([1, 2, 3]),
  toRaster: () => ({width: 4, height: 6, rgba: new Uint8Array(4 * 6 * 4)}),
}));

jest.mock('../../imaging/composer', () => ({
  composeSheet: (options: Record<string, unknown>) => mockComposeSheet(options),
  DEFAULT_COMPOSE: {
    mirror: false,
    bleedPercent: 2,
    backgroundColor: '#FFFFFF',
    jpegQuality: 92,
    showTearLine: true,
  },
}));

const mockEncodePwgRaster = jest.fn(() => Uint8Array.from([9, 9]));
jest.mock('../../printing/pwg/raster', () => ({
  encodePwgRaster: (...args: unknown[]) => mockEncodePwgRaster(...(args as [])),
}));

const mockWriteBytes = jest.fn(async () => undefined);
const mockRemoveFile = jest.fn(async () => undefined);
jest.mock('../../platform/files', () => ({
  Paths: {shots: '/к/кадры', sheets: '/к/листы', archive: '/к/архив'},
  newFilePath: (dir: string, ext: string) => `${dir}/лист.${ext}`,
  writeBytes: (...args: unknown[]) => mockWriteBytes(...(args as [])),
  removeFile: (...args: unknown[]) => mockRemoveFile(...(args as [])),
}));

const mockPickPhoto = jest.fn(async () => ({kind: 'cancelled'} as const));
jest.mock('../../platform/gallery', () => ({
  pickPhotoFromGallery: () => mockPickPhoto(),
}));

jest.mock('../../platform/feedback', () => ({
  haptic: jest.fn(),
  playCue: jest.fn(),
}));

const TYPEFACE = {__brand: 'lobster'};
const mockLoadTypeface = jest.fn(async () => TYPEFACE as unknown);
jest.mock('../../imaging/typefaces', () => ({
  loadTypeface: (...args: unknown[]) => mockLoadTypeface(...(args as [])),
}));

const mockRecordError = jest.fn(async () => undefined);
jest.mock('../../platform/crashlog', () => ({
  recordError: (...args: unknown[]) => mockRecordError(...(args as [])),
}));

// ── Фикстуры ──────────────────────────────────────────────────────────────
const settings = (patch: Partial<Settings> = {}): Settings => ({
  ...DEFAULT_SETTINGS,
  ...patch,
  flow: {...DEFAULT_SETTINGS.flow, layouts: ['single'], ...(patch.flow ?? {})},
  capture: {...DEFAULT_SETTINGS.capture, countdownSeconds: 1, ...(patch.capture ?? {})},
});

/** Камера, отдающая один и тот же кадр. */
function workingCamera(): React.RefObject<CameraLayerHandle | null> {
  return {
    current: {
      capture: jest.fn(async () => ({
        path: '/к/кадры/1.jpg',
        width: 3024,
        height: 4032,
        isMirrored: true,
      })),
    } as unknown as CameraLayerHandle,
  };
}

function mount(
  camera: React.RefObject<CameraLayerHandle | null>,
  patch: Partial<Settings> = {},
) {
  return renderHook(() => useKioskSession(settings(patch), camera));
}

/**
 * Гонит такты, пока автомат не дойдёт до нужного состояния.
 *
 * Часы поддельные: сценарий с отсчётом и таймаутами занимает в реальном
 * времени секунды, а прогонять его приходится в каждом тесте.
 */
async function reach(result: {current: {state: {name: string}}}, name: string) {
  await waitFor(
    () => {
      expect(result.current.state.name).toBe(name);
    },
    {timeout: 60_000, interval: 100},
  );
}

beforeEach(() => {
  jest.useFakeTimers();
  mockTransport.documentFormat = 'image/jpeg';
  mockSnapshot.mockReturnValue({pending: 1});
  mockComposeSheet.mockResolvedValue({
    jpeg: Uint8Array.from([1, 2, 3]),
    toRaster: () => ({width: 4, height: 6, rgba: new Uint8Array(4 * 6 * 4)}),
  });
  mockPickPhoto.mockResolvedValue({kind: 'cancelled'} as never);
  mockLoadTypeface.mockResolvedValue(TYPEFACE as never);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('сессия — обычный путь', () => {
  it('от заставки доходит до просмотра и печати', async () => {
    const camera = workingCamera();
    const {result} = mount(camera);

    expect(result.current.state.name).toBe('attract');

    act(() => result.current.start());
    await reach(result, 'review');

    await waitFor(() => expect(result.current.previewUri).toBeTruthy());

    act(() => result.current.print());
    await waitFor(() => expect(mockEnqueue).toHaveBeenCalled());
    await reach(result, 'thanks');
  });

  it('печатает ровно тот лист, который показала', async () => {
    // Гость видит одно, забирает другое — это худший исход просмотра.
    const camera = workingCamera();
    const {result} = mount(camera);

    act(() => result.current.start());
    await reach(result, 'review');
    await waitFor(() => expect(result.current.previewUri).toBeTruthy());

    const shownPath = result.current.previewUri!.replace('file://', '');
    mockComposeSheet.mockClear();

    act(() => result.current.print());
    await waitFor(() => expect(mockEnqueue).toHaveBeenCalled());

    expect(mockEnqueue.mock.calls[0]![0]).toMatchObject({filePath: shownPath});
    // И не пересобирает его второй раз: это удвоенное ожидание на самом
    // заметном месте сценария.
    expect(mockComposeSheet).not.toHaveBeenCalled();
  });

  it('не оставляет исходные кадры на диске', async () => {
    const camera = workingCamera();
    const {result} = mount(camera, {
      privacy: {...DEFAULT_SETTINGS.privacy, keepArchive: false},
    });

    act(() => result.current.start());
    await reach(result, 'review');
    act(() => result.current.print());
    await waitFor(() => expect(mockEnqueue).toHaveBeenCalled());

    expect(mockRemoveFile).toHaveBeenCalledWith('/к/кадры/1.jpg');
  });

  it('с включённым архивом кадры остаются', async () => {
    const camera = workingCamera();
    const {result} = mount(camera, {
      privacy: {...DEFAULT_SETTINGS.privacy, keepArchive: true},
    });

    act(() => result.current.start());
    await reach(result, 'review');
    mockRemoveFile.mockClear();
    act(() => result.current.print());
    await waitFor(() => expect(mockEnqueue).toHaveBeenCalled());

    expect(mockRemoveFile).not.toHaveBeenCalledWith('/к/кадры/1.jpg');
  });
});

describe('сессия — камера не отвечает', () => {
  it('не запирает гостя на экране съёмки', async () => {
    // Ровно это и видел владелец телефона: нажал — и ничего.
    const camera = {current: null};
    const {result} = mount(camera);

    act(() => result.current.start());
    await reach(result, 'error');
    expect(result.current.state.name).toBe('error');
  });

  it('падение снимка тоже приводит к понятному экрану', async () => {
    const camera = {
      current: {
        capture: jest.fn(async () => {
          throw new Error('Камера занята');
        }),
      } as unknown as CameraLayerHandle,
    };
    const {result} = mount(camera);

    act(() => result.current.start());
    await reach(result, 'error');
    expect((result.current.state as {message?: string}).message).toContain('Камера занята');
  });
});

describe('сессия — сборка листа', () => {
  it('превью не собралось — печать всё равно доступна', async () => {
    mockComposeSheet.mockRejectedValue(new Error('Skia недоступна'));
    const camera = workingCamera();
    const {result} = mount(camera);

    act(() => result.current.start());
    await reach(result, 'review');

    expect(result.current.previewUri).toBeNull();
    await waitFor(() => expect(mockRecordError).toHaveBeenCalled());

    // Кадр снят, и напечатать его гость должен мочь.
    mockComposeSheet.mockResolvedValue({
      jpeg: Uint8Array.from([7]),
      toRaster: () => ({width: 4, height: 6, rgba: new Uint8Array(96)}),
    });
    act(() => result.current.print());
    await waitFor(() => expect(mockEnqueue).toHaveBeenCalled());
  });

  it('падение сборки при печати показывает ошибку, а не зависает', async () => {
    const camera = workingCamera();
    const {result} = mount(camera);

    act(() => result.current.start());
    await reach(result, 'review');
    await waitFor(() => expect(result.current.previewUri).toBeTruthy());

    // Готовый лист есть, но принтеру нужен растр — значит пересборка.
    mockTransport.documentFormat = 'image/pwg-raster';
    mockComposeSheet.mockRejectedValue(new Error('Нет памяти'));

    act(() => result.current.print());
    await reach(result, 'error');
    expect(result.current.busy).toBe(false);
  });
});

describe('сессия — формат принтера', () => {
  it('принтеру без JPEG отправляет растр', async () => {
    mockTransport.documentFormat = 'image/pwg-raster';
    const camera = workingCamera();
    const {result} = mount(camera);

    act(() => result.current.start());
    await reach(result, 'review');
    act(() => result.current.print());
    await waitFor(() => expect(mockEnqueue).toHaveBeenCalled());

    expect(mockEncodePwgRaster).toHaveBeenCalled();
    expect(mockEnqueue.mock.calls[0]![0]).toMatchObject({format: 'image/pwg-raster'});
  });
});

describe('сессия — готовый снимок из галереи', () => {
  it('отмена выбора возвращает на заставку без ошибки', async () => {
    mockPickPhoto.mockResolvedValue({kind: 'cancelled'} as never);
    const camera = workingCamera();
    const {result} = mount(camera);

    act(() => result.current.pickPhoto());
    await waitFor(() => expect(mockPickPhoto).toHaveBeenCalled());
    await waitFor(() => expect(result.current.state.name).toBe('attract'));
  });

  it('выбранный снимок доходит до просмотра', async () => {
    mockPickPhoto.mockResolvedValue({
      kind: 'picked',
      photo: {path: '/галерея/фото.jpg', width: 4000, height: 3000},
    } as never);
    const camera = workingCamera();
    const {result} = mount(camera);

    act(() => result.current.pickPhoto());
    await reach(result, 'review');
    expect((result.current.state as {source?: string}).source).toBe('gallery');
  });

  it('чужой файл не удаляется после печати', async () => {
    // Удалить фотографию из галереи гостя — необратимо и непростительно.
    mockPickPhoto.mockResolvedValue({
      kind: 'picked',
      photo: {path: '/галерея/фото.jpg', width: 4000, height: 3000},
    } as never);
    const camera = workingCamera();
    const {result} = mount(camera, {
      privacy: {...DEFAULT_SETTINGS.privacy, keepArchive: false},
    });

    act(() => result.current.pickPhoto());
    await reach(result, 'review');
    mockRemoveFile.mockClear();

    act(() => result.current.print());
    await waitFor(() => expect(mockEnqueue).toHaveBeenCalled());
    await reach(result, 'thanks');

    expect(mockRemoveFile).not.toHaveBeenCalledWith('/галерея/фото.jpg');
  });

  it('ошибка галереи показывается гостю', async () => {
    mockPickPhoto.mockResolvedValue({
      kind: 'error',
      message: 'Нет доступа к галерее',
    } as never);
    const camera = workingCamera();
    const {result} = mount(camera);

    act(() => result.current.pickPhoto());
    await reach(result, 'error');
    expect((result.current.state as {message?: string}).message).toContain('галерее');
  });
});

describe('сессия — подпись на отпечатке', () => {
  it('лист собирается для каждой раскладки, а не только для одиночного кадра', async () => {
    // Отчёт с устройства: «превью на режимах два кадра, полароид, четыре
    // кадра, полоска на двоих не работает». Причина была не в раскладках, а
    // в подписи — её рисуют все они, кроме одиночного кадра.
    for (const layoutId of ['single', 'duo', 'polaroid'] as const) {
      mockComposeSheet.mockClear();
      const camera = workingCamera();
      const {result, unmount} = mount(camera, {
        flow: {...DEFAULT_SETTINGS.flow, layouts: [layoutId]},
      });

      act(() => result.current.start());
      await reach(result, 'review');
      await waitFor(() => expect(result.current.previewUri).toBeTruthy());

      expect(mockComposeSheet).toHaveBeenCalled();
      unmount();
    }
  });

  it('шрифт подписи запрашивается и уходит в сборку', async () => {
    const camera = workingCamera();
    const {result} = mount(camera, {
      event: {...DEFAULT_SETTINGS.event, title: 'Свадьба Ани и Пети'},
    });

    act(() => result.current.start());
    await reach(result, 'review');
    await waitFor(() => expect(mockComposeSheet).toHaveBeenCalled());

    const options = mockComposeSheet.mock.calls[0]![0] as {
      caption?: {title: string};
      typeface?: unknown;
    };
    expect(options.caption).toMatchObject({title: 'Свадьба Ани и Пети'});
    expect(options.typeface).toBe(TYPEFACE);
  });

  it('без шрифта подпись не уходит в сборку, а лист всё равно собирается', async () => {
    // `Skia.Font(undefined)` роняет лист целиком. Поэтому шрифта нет —
    // значит и поля `typeface` в опциях быть не должно.
    mockLoadTypeface.mockResolvedValue(null);
    const camera = workingCamera();
    const {result} = mount(camera, {
      event: {...DEFAULT_SETTINGS.event, title: 'Свадьба'},
    });

    act(() => result.current.start());
    await reach(result, 'review');
    await waitFor(() => expect(result.current.previewUri).toBeTruthy());

    const options = mockComposeSheet.mock.calls[0]![0] as {typeface?: unknown};
    expect('typeface' in options).toBe(false);
  });

  it('без названия мероприятия шрифт не читается вовсе', async () => {
    const camera = workingCamera();
    const {result} = mount(camera, {
      event: {...DEFAULT_SETTINGS.event, title: ''},
    });

    act(() => result.current.start());
    await reach(result, 'review');
    await waitFor(() => expect(mockComposeSheet).toHaveBeenCalled());

    expect(mockLoadTypeface).not.toHaveBeenCalled();
  });
});

describe('сессия — очередь печати', () => {
  it('отказ очереди не оставляет будку в «отправляем»', async () => {
    mockEnqueue.mockRejectedValueOnce(new Error('Принтер не отвечает'));
    const camera = workingCamera();
    const {result} = mount(camera);

    act(() => result.current.start());
    await reach(result, 'review');
    act(() => result.current.print());
    await reach(result, 'error');
    expect(result.current.busy).toBe(false);
  });
});
