/**
 * Классификация ошибок печати.
 *
 * От неё зависит поведение очереди на мероприятии: временную ошибку надо
 * молча повторить, фатальную — показать оператору и не жечь бумагу, а
 * «принтеру нужен человек» — поставить очередь на паузу, ничего не потеряв.
 */

import {IppError} from './ipp/client';
import {StatusCode} from './ipp/constants';
import {NetworkError} from './net';
import type {ErrorDisposition} from './types';

/** Ошибки принтера, требующие вмешательства человека. */
const BLOCKED_STATUSES: readonly number[] = [
  StatusCode.ServerErrorNotAcceptingJobs,
  StatusCode.ServerErrorDeviceError,
];

/** Ошибки, которые не исправятся повтором того же задания. */
const FATAL_STATUSES: readonly number[] = [
  StatusCode.ClientErrorBadRequest,
  StatusCode.ClientErrorDocumentFormatNotSupported,
  StatusCode.ClientErrorAttributesOrValuesNotSupported,
  StatusCode.ClientErrorRequestEntityTooLarge,
  StatusCode.ClientErrorNotFound,
  StatusCode.ServerErrorOperationNotSupported,
];

/** Определяет, что делать с ошибкой. */
export function classifyError(error: unknown): ErrorDisposition {
  // Сеть отвалилась — планшет мог потерять точку доступа принтера. Повторяем:
  // на мероприятии Wi-Fi проседает регулярно, но обычно восстанавливается.
  if (error instanceof NetworkError) {
    return 'retry';
  }

  if (error instanceof IppError) {
    if (BLOCKED_STATUSES.includes(error.statusCode)) {
      return 'blocked';
    }
    if (FATAL_STATUSES.includes(error.statusCode)) {
      return 'fatal';
    }
    return 'retry';
  }

  // Незнакомая ошибка — считаем временной: лучше повторить, чем потерять кадр.
  return 'retry';
}

/** Текст ошибки для оператора (админка и журнал). */
export function describeError(error: unknown): string {
  if (error instanceof IppError || error instanceof NetworkError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Задержка перед повтором: экспоненциальный рост со «дрожанием».
 * Дрожание нужно, чтобы после восстановления Wi-Fi несколько отложенных
 * заданий не ломились в принтер одновременно.
 */
export function retryDelayMs(
  attempt: number,
  baseMs = 2_000,
  maxMs = 60_000,
  jitter: () => number = Math.random,
): number {
  const exponential = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1));
  // ±20 % от полученной задержки.
  const spread = exponential * 0.2;
  return Math.round(exponential - spread + jitter() * spread * 2);
}
