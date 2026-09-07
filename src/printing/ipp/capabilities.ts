/**
 * Разбор ответа Get-Printer-Attributes в модель возможностей принтера.
 *
 * Приложение ничего не «знает» про конкретную модель заранее: набор форматов,
 * размеров бумаги и разрешений выясняется у принтера в рантайме. Так один и
 * тот же код работает и с Xiaomi 1S на 6-дюймовой бумаге, и с любым другим
 * AirPrint/Mopria-принтером, который окажется на мероприятии под рукой.
 */

import {
  BLOCKING_PRINTER_REASONS,
  PrinterState,
  WARNING_PRINTER_REASONS,
} from './constants';
import {
  attrNumber,
  attrString,
  attrStrings,
  findAttribute,
  type IppResolution,
  type IppResponse,
} from './message';

/** Физический размер листа в миллиметрах. */
export interface MediaSize {
  readonly widthMm: number;
  readonly heightMm: number;
}

/** Поддерживаемый размер носителя: PWG-имя + разобранные габариты. */
export interface MediaOption extends MediaSize {
  /** Самоописывающее имя PWG, например `na_index-4x6_4x6in`. */
  readonly name: string;
}

/** Уровень расходника (для 1S — остаток ленты, `marker-levels`). */
export interface MarkerLevel {
  readonly name: string;
  /** 0–100 %, либо -1/-2, если принтер не умеет измерять точно. */
  readonly level: number;
}

/** Состояние принтера с точки зрения оператора киоска. */
export type PrinterHealth = 'ready' | 'busy' | 'warning' | 'blocked' | 'unknown';

/** Всё, что мы узнали о принтере. */
export interface PrinterCapabilities {
  readonly name?: string;
  readonly makeAndModel?: string;
  readonly documentFormats: readonly string[];
  readonly documentFormatDefault?: string;
  readonly media: readonly MediaOption[];
  readonly mediaDefault?: string;
  readonly resolutions: readonly IppResolution[];
  readonly colorModes: readonly string[];
  readonly operations: readonly number[];
  readonly state: number;
  readonly stateReasons: readonly string[];
  readonly markers: readonly MarkerLevel[];
  readonly health: PrinterHealth;
  /** Человекочитаемая причина, если печатать сейчас нельзя. */
  readonly blockingReason?: string;
}

/** Дюймы в миллиметры. */
const MM_PER_INCH = 25.4;

/**
 * Разбирает самоописывающее имя носителя PWG 5101.1.
 *
 * Формат: `<класс>_<название>_<ширина>x<высота><единицы>`, где единицы —
 * `in` или `mm`, а числа могут быть дробными. Примеры:
 *   `na_index-4x6_4x6in`        -> 101.6 x 152.4 мм
 *   `om_photo-3x3_76.2x76.2mm`  -> 76.2 x 76.2 мм
 *
 * Возвращает null, если имя не разбирается (кастомные имена вендоров).
 */
export function parsePwgMediaSize(name: string): MediaSize | null {
  const match = /_(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)(in|mm)$/.exec(name);
  if (!match) {
    return null;
  }
  const width = Number.parseFloat(match[1]!);
  const height = Number.parseFloat(match[2]!);
  const factor = match[3] === 'in' ? MM_PER_INCH : 1;
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }
  return {
    widthMm: round2(width * factor),
    heightMm: round2(height * factor),
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Отбрасывает суффиксы уровня серьёзности из `printer-state-reasons`. */
export function normalizeStateReason(reason: string): string {
  return reason.replace(/-(?:report|warning|error)$/, '');
}

/** Сводит состояние и причины к одному понятному статусу. */
export function evaluateHealth(
  state: number,
  reasons: readonly string[],
): {health: PrinterHealth; blockingReason?: string} {
  const normalized = reasons
    .map(normalizeStateReason)
    .filter(r => r.length > 0 && r !== 'none');

  const blocking = normalized.find(r => BLOCKING_PRINTER_REASONS.includes(r));
  if (blocking) {
    return {health: 'blocked', blockingReason: blocking};
  }
  if (state === PrinterState.Stopped) {
    return {health: 'blocked', blockingReason: normalized[0] ?? 'stopped'};
  }
  if (normalized.some(r => WARNING_PRINTER_REASONS.includes(r))) {
    return {health: 'warning'};
  }
  if (state === PrinterState.Processing) {
    return {health: 'busy'};
  }
  if (state === PrinterState.Idle) {
    return {health: 'ready'};
  }
  return {health: 'unknown'};
}

/** Собирает модель возможностей из ответа Get-Printer-Attributes. */
export function parseCapabilities(response: IppResponse): PrinterCapabilities {
  const mediaNames = attrStrings(response, 'media-supported');
  const media: MediaOption[] = [];
  for (const name of mediaNames) {
    const size = parsePwgMediaSize(name);
    if (size) {
      media.push({name, ...size});
    }
  }

  const resolutions = findAttribute(response, 'printer-resolution-supported').filter(
    (v): v is IppResolution => typeof v === 'object' && 'kind' in v && v.kind === 'resolution',
  );

  const operations = findAttribute(response, 'operations-supported').filter(
    (v): v is number => typeof v === 'number',
  );

  const markerNames = attrStrings(response, 'marker-names');
  const markerLevels = findAttribute(response, 'marker-levels').filter(
    (v): v is number => typeof v === 'number',
  );
  const markers: MarkerLevel[] = markerLevels.map((level, i) => ({
    name: markerNames[i] ?? `marker-${i}`,
    level,
  }));

  const state = attrNumber(response, 'printer-state') ?? 0;
  const stateReasons = attrStrings(response, 'printer-state-reasons');
  const {health, blockingReason} = evaluateHealth(state, stateReasons);

  return {
    name: attrString(response, 'printer-name'),
    makeAndModel: attrString(response, 'printer-make-and-model'),
    documentFormats: attrStrings(response, 'document-format-supported'),
    documentFormatDefault: attrString(response, 'document-format-default'),
    media,
    mediaDefault: attrString(response, 'media-default'),
    resolutions,
    colorModes: attrStrings(response, 'print-color-mode-supported'),
    operations,
    state,
    stateReasons,
    markers,
    health,
    ...(blockingReason ? {blockingReason} : {}),
  };
}

/**
 * Выбирает формат документа для отправки.
 *
 * Порядок предпочтения:
 *  1. `image/jpeg` — принтер сам масштабирует и сжимает, трафик минимален,
 *     фотопринтеры почти всегда его принимают;
 *  2. `image/pwg-raster` — обязателен для Mopria, кодируем сами;
 *  3. `image/urf` — обязателен для AirPrint (по структуре близок к PWG);
 *  4. `application/octet-stream` — последний шанс: принтер определит сам.
 */
export function chooseDocumentFormat(
  supported: readonly string[],
  preferred: readonly string[] = [
    'image/jpeg',
    'image/pwg-raster',
    'image/urf',
    'application/octet-stream',
  ],
): string | null {
  const normalized = supported.map(f => f.toLowerCase().trim());
  for (const candidate of preferred) {
    if (normalized.includes(candidate)) {
      return candidate;
    }
  }
  // Принтер не перечислил форматы (бывает у урезанных прошивок) — шлём JPEG.
  return supported.length === 0 ? 'image/jpeg' : null;
}

/**
 * Подбирает ближайший поддерживаемый носитель к запрошенному размеру.
 * Сравниваем по сумме отклонений сторон, допуск — `toleranceMm`.
 */
export function chooseMedia(
  media: readonly MediaOption[],
  target: MediaSize,
  toleranceMm = 6,
): MediaOption | null {
  let best: MediaOption | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;

  for (const option of media) {
    // Носитель может быть описан в любой ориентации — проверяем обе.
    const direct =
      Math.abs(option.widthMm - target.widthMm) + Math.abs(option.heightMm - target.heightMm);
    const rotated =
      Math.abs(option.heightMm - target.widthMm) + Math.abs(option.widthMm - target.heightMm);
    const delta = Math.min(direct, rotated);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = option;
    }
  }

  return best && bestDelta <= toleranceMm * 2 ? best : null;
}

/** Наибольшее поддерживаемое разрешение (по площади точек). */
export function chooseResolution(
  resolutions: readonly IppResolution[],
): IppResolution | null {
  let best: IppResolution | null = null;
  for (const r of resolutions) {
    if (!best || r.x * r.y > best.x * best.y) {
      best = r;
    }
  }
  return best;
}
