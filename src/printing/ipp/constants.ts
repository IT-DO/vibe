/**
 * Константы IPP (Internet Printing Protocol).
 *
 * Ссылки:
 *  - RFC 8010 — кодирование и транспорт (бинарный формат сообщения);
 *  - RFC 8011 — модель и семантика (операции, атрибуты, состояния);
 *  - PWG 5100.14 — IPP Everywhere (его подмножество реализуют Mopria и AirPrint).
 *
 * Xiaomi Instant/Portable Photo Printer 1S заявляет поддержку Mopria и AirPrint,
 * а обе технологии — это IPP поверх HTTP. Поэтому печатаем «нативно», без
 * системного диалога печати: для киоска это обязательное требование.
 */

/** Версия протокола в запросе: 2.0 достаточно для IPP Everywhere. */
export const IPP_VERSION = {major: 2, minor: 0} as const;

/** Коды операций (RFC 8011 §4.4.15). */
export const Operation = {
  PrintJob: 0x0002,
  ValidateJob: 0x0004,
  CreateJob: 0x0005,
  SendDocument: 0x0006,
  CancelJob: 0x0008,
  GetJobAttributes: 0x0009,
  GetJobs: 0x000a,
  GetPrinterAttributes: 0x000b,
} as const;
export type OperationCode = (typeof Operation)[keyof typeof Operation];

/** Теги-разделители групп атрибутов (RFC 8010 §3.5.1). */
export const DelimiterTag = {
  OperationAttributes: 0x01,
  JobAttributes: 0x02,
  EndOfAttributes: 0x03,
  PrinterAttributes: 0x04,
  UnsupportedAttributes: 0x05,
} as const;

/** Теги типов значений (RFC 8010 §3.5.2). */
export const ValueTag = {
  Unsupported: 0x10,
  Unknown: 0x12,
  NoValue: 0x13,
  Integer: 0x21,
  Boolean: 0x22,
  Enum: 0x23,
  OctetString: 0x30,
  DateTime: 0x31,
  Resolution: 0x32,
  RangeOfInteger: 0x33,
  BegCollection: 0x34,
  TextWithLanguage: 0x35,
  NameWithLanguage: 0x36,
  EndCollection: 0x37,
  TextWithoutLanguage: 0x41,
  NameWithoutLanguage: 0x42,
  Keyword: 0x44,
  Uri: 0x45,
  UriScheme: 0x46,
  Charset: 0x47,
  NaturalLanguage: 0x48,
  MimeMediaType: 0x49,
  MemberAttrName: 0x4a,
} as const;
export type ValueTagCode = (typeof ValueTag)[keyof typeof ValueTag];

/** Единицы измерения в значении типа `resolution`. */
export const ResolutionUnit = {
  DotsPerInch: 3,
  DotsPerCentimeter: 4,
} as const;

/** Коды статуса ответа (RFC 8011 §13.1). */
export const StatusCode = {
  SuccessfulOk: 0x0000,
  SuccessfulOkIgnoredOrSubstituted: 0x0001,
  SuccessfulOkConflicting: 0x0002,
  ClientErrorBadRequest: 0x0400,
  ClientErrorForbidden: 0x0401,
  ClientErrorNotAuthenticated: 0x0402,
  ClientErrorNotAuthorized: 0x0403,
  ClientErrorNotPossible: 0x0404,
  ClientErrorTimeout: 0x0405,
  ClientErrorNotFound: 0x0406,
  ClientErrorGone: 0x0407,
  ClientErrorRequestEntityTooLarge: 0x0408,
  ClientErrorDocumentFormatNotSupported: 0x040a,
  ClientErrorAttributesOrValuesNotSupported: 0x040b,
  ServerErrorInternalError: 0x0500,
  ServerErrorOperationNotSupported: 0x0501,
  ServerErrorDeviceError: 0x0503,
  ServerErrorTemporaryError: 0x0504,
  ServerErrorNotAcceptingJobs: 0x0505,
  ServerErrorBusy: 0x0506,
  ServerErrorJobCanceled: 0x0507,
} as const;

/** Успешным считается любой код из диапазона `successful-*` (0x0000–0x00ff). */
export function isSuccess(status: number): boolean {
  return status >= 0x0000 && status <= 0x00ff;
}

/** Состояние принтера, `printer-state` (RFC 8011 §5.4.11). */
export const PrinterState = {
  Idle: 3,
  Processing: 4,
  Stopped: 5,
} as const;

/** Состояние задания, `job-state` (RFC 8011 §5.3.7). */
export const JobState = {
  Pending: 3,
  PendingHeld: 4,
  Processing: 5,
  ProcessingStopped: 6,
  Canceled: 7,
  Aborted: 8,
  Completed: 9,
} as const;
export type JobStateCode = (typeof JobState)[keyof typeof JobState];

/** Задание больше не изменится — можно снимать с очереди. */
export function isTerminalJobState(state: number): boolean {
  return (
    state === JobState.Canceled || state === JobState.Aborted || state === JobState.Completed
  );
}

/**
 * Значения `printer-state-reasons`, из-за которых печатать бессмысленно, пока
 * человек не вмешается. Суффиксы `-warning` / `-report` отбрасываются до
 * сравнения: `media-empty-warning` — это то же `media-empty`, но мягче.
 */
export const BLOCKING_PRINTER_REASONS: readonly string[] = [
  'media-empty',
  'media-jam',
  'media-needed',
  'cover-open',
  'door-open',
  'input-tray-missing',
  'marker-supply-empty',
  'output-area-almost-full',
  'output-tray-missing',
  'paused',
  'shutdown',
  'stopped-partly',
  'toner-empty',
];

/** Причины, о которых стоит предупредить оператора, но печать продолжается. */
export const WARNING_PRINTER_REASONS: readonly string[] = [
  'media-low',
  'marker-supply-low',
  'toner-low',
  'developer-low',
  'output-area-full',
];

/** Порт IPP по умолчанию. */
export const DEFAULT_IPP_PORT = 631;

/** Типовые пути к очереди печати — перебираем при автоопределении принтера. */
export const COMMON_IPP_PATHS: readonly string[] = [
  '/ipp/print',
  '/ipp/printer',
  '/ipp',
  '/printers/Printer',
  '/',
];
