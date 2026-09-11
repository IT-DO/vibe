/**
 * Высокоуровневый IPP-клиент: операции, которые нужны фотобудке.
 *
 * Печатаем через Print-Job (одна операция = один снимок), состояние тянем
 * через Get-Job-Attributes. Create-Job/Send-Document не используем: у нас
 * всегда однодокументное задание, а лишний раунд-трип на медленном Wi-Fi
 * принтера — это лишняя точка отказа.
 */

import type {TcpConnector} from '../net';
import {httpPost} from './http';
import {
  COMMON_IPP_PATHS,
  DEFAULT_IPP_PORT,
  JobState,
  Operation,
  DelimiterTag,
  StatusCode,
  ValueTag,
  isSuccess,
} from './constants';
import {
  parseCapabilities,
  type MediaSize,
  type PrinterCapabilities,
} from './capabilities';
import {
  attrNumber,
  attrStrings,
  decodeResponse,
  encodeRequest,
  type IppOutAttribute,
  type IppResolution,
  type IppResponse,
} from './message';

/** Ошибка уровня протокола: принтер ответил, но отказал. */
export class IppError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'IppError';
  }
}

/** Куда и как ходить к принтеру. */
export interface IppEndpoint {
  readonly host: string;
  readonly port: number;
  /** Путь к очереди печати, например `/ipp/print`. */
  readonly path: string;
}

export interface IppClientOptions {
  readonly endpoint: IppEndpoint;
  readonly connector: TcpConnector;
  /** Таймаут коротких запросов (опрос состояния, возможности). */
  readonly queryTimeoutMs?: number;
  /** Таймаут отправки задания — сюда входит заливка нескольких мегабайт. */
  readonly printTimeoutMs?: number;
  /** Имя, которое принтер покажет в своём журнале заданий. */
  readonly userName?: string;
}

/** Параметры одного задания печати. */
export interface PrintJobOptions {
  readonly data: Uint8Array;
  readonly documentFormat: string;
  readonly jobName: string;
  readonly copies?: number;
  /** PWG-имя носителя, например `na_index-4x6_4x6in`. */
  readonly media?: string;
  readonly resolution?: IppResolution;
  readonly colorMode?: string;
  /** Как вписывать изображение в лист: `fill` печатает без полей. */
  readonly scaling?: 'fill' | 'fit' | 'none';
}

/** Состояние задания на принтере. */
export interface JobStatus {
  readonly jobId: number;
  readonly state: number;
  readonly stateReasons: readonly string[];
  readonly isTerminal: boolean;
}

const DEFAULT_QUERY_TIMEOUT_MS = 8_000;
// Заливка JPEG на 2,4 МБ по 2,4 ГГц Wi-Fi точки доступа принтера — небыстрая
// операция, плюс сама печать листа занимает около 57 секунд.
const DEFAULT_PRINT_TIMEOUT_MS = 120_000;

export class IppClient {
  private requestId = 1;
  private readonly queryTimeoutMs: number;
  private readonly printTimeoutMs: number;
  private readonly userName: string;

  constructor(private readonly options: IppClientOptions) {
    this.queryTimeoutMs = options.queryTimeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS;
    this.printTimeoutMs = options.printTimeoutMs ?? DEFAULT_PRINT_TIMEOUT_MS;
    this.userName = options.userName ?? 'photo-kiosk';
  }

  get endpoint(): IppEndpoint {
    return this.options.endpoint;
  }

  /** `ipp://host:port/path` — обязательный атрибут почти каждой операции. */
  private printerUri(): string {
    const {host, port, path} = this.options.endpoint;
    return `ipp://${host}:${port}${path}`;
  }

  /** Атрибуты, обязательные в начале любой операции (порядок важен). */
  private baseAttributes(): IppOutAttribute[] {
    return [
      {name: 'attributes-charset', values: ['utf-8'], tag: ValueTag.Charset},
      {
        name: 'attributes-natural-language',
        values: ['en'],
        tag: ValueTag.NaturalLanguage,
      },
      {name: 'printer-uri', values: [this.printerUri()], tag: ValueTag.Uri},
      {
        name: 'requesting-user-name',
        values: [this.userName],
        tag: ValueTag.NameWithoutLanguage,
      },
    ];
  }

  private nextRequestId(): number {
    // Обнуляемся до 1, чтобы не выйти за 32 бита за долгое мероприятие.
    this.requestId = this.requestId >= 0x7fffffff ? 1 : this.requestId + 1;
    return this.requestId;
  }

  /** Отправляет запрос и разбирает ответ; кидает IppError на отказ. */
  private async execute(
    operation: number,
    groups: {tag: number; attributes: IppOutAttribute[]}[],
    data: Uint8Array | undefined,
    timeoutMs: number,
  ): Promise<IppResponse> {
    const requestId = this.nextRequestId();
    const body = encodeRequest({
      operation,
      requestId,
      groups,
      ...(data ? {data} : {}),
    });

    const http = await httpPost({
      host: this.options.endpoint.host,
      port: this.options.endpoint.port,
      path: this.options.endpoint.path,
      contentType: 'application/ipp',
      body,
      timeoutMs,
      connector: this.options.connector,
    });

    if (http.status !== 200) {
      throw new IppError(
        `HTTP ${http.status} от принтера (ожидался 200)`,
        StatusCode.ServerErrorInternalError,
      );
    }

    const response = decodeResponse(http.body);
    if (!isSuccess(response.statusCode)) {
      const detail = attrStrings(response, 'status-message')[0];
      throw new IppError(
        detail ?? describeStatus(response.statusCode),
        response.statusCode,
        detail,
      );
    }
    return response;
  }

  /** Get-Printer-Attributes: форматы, носители, состояние, расходники. */
  async getCapabilities(): Promise<PrinterCapabilities> {
    const response = await this.execute(
      Operation.GetPrinterAttributes,
      [
        {
          tag: DelimiterTag.OperationAttributes,
          attributes: [
            ...this.baseAttributes(),
            {
              name: 'requested-attributes',
              values: [
                'printer-name',
                'printer-make-and-model',
                'printer-state',
                'printer-state-reasons',
                'document-format-supported',
                'document-format-default',
                'media-supported',
                'media-default',
                'media-ready',
                'printer-resolution-supported',
                'printer-resolution-default',
                'print-color-mode-supported',
                'operations-supported',
                'marker-names',
                'marker-levels',
                'marker-types',
                'ipp-versions-supported',
                'queued-job-count',
              ],
              tag: ValueTag.Keyword,
            },
          ],
        },
      ],
      undefined,
      this.queryTimeoutMs,
    );
    return parseCapabilities(response);
  }

  /**
   * Validate-Job: проверяет, что задание будет принято, не расходуя бумагу.
   * Используется при настройке принтера в админке.
   */
  async validateJob(options: PrintJobOptions): Promise<void> {
    await this.execute(
      Operation.ValidateJob,
      this.buildJobGroups(options),
      undefined,
      this.queryTimeoutMs,
    );
  }

  /** Print-Job: отправляет снимок на печать, возвращает id задания. */
  async printJob(options: PrintJobOptions): Promise<number> {
    const response = await this.execute(
      Operation.PrintJob,
      this.buildJobGroups(options),
      options.data,
      this.printTimeoutMs,
    );
    const jobId = attrNumber(response, 'job-id');
    if (jobId === undefined) {
      throw new IppError(
        'Принтер принял задание, но не вернул job-id',
        response.statusCode,
      );
    }
    return jobId;
  }

  /** Get-Job-Attributes: текущее состояние задания. */
  async getJobStatus(jobId: number): Promise<JobStatus> {
    const response = await this.execute(
      Operation.GetJobAttributes,
      [
        {
          tag: DelimiterTag.OperationAttributes,
          attributes: [
            ...this.baseAttributes(),
            {name: 'job-id', values: [jobId], tag: ValueTag.Integer},
            {
              name: 'requested-attributes',
              values: ['job-id', 'job-state', 'job-state-reasons', 'job-impressions-completed'],
              tag: ValueTag.Keyword,
            },
          ],
        },
      ],
      undefined,
      this.queryTimeoutMs,
    );

    const state = attrNumber(response, 'job-state') ?? JobState.Pending;
    return {
      jobId,
      state,
      stateReasons: attrStrings(response, 'job-state-reasons'),
      isTerminal:
        state === JobState.Completed ||
        state === JobState.Canceled ||
        state === JobState.Aborted,
    };
  }

  /** Cancel-Job: снимает задание (кнопка «отменить» в админке). */
  async cancelJob(jobId: number): Promise<void> {
    await this.execute(
      Operation.CancelJob,
      [
        {
          tag: DelimiterTag.OperationAttributes,
          attributes: [
            ...this.baseAttributes(),
            {name: 'job-id', values: [jobId], tag: ValueTag.Integer},
          ],
        },
      ],
      undefined,
      this.queryTimeoutMs,
    );
  }

  /** Общая часть Print-Job и Validate-Job. */
  private buildJobGroups(
    options: PrintJobOptions,
  ): {tag: number; attributes: IppOutAttribute[]}[] {
    const operationAttributes: IppOutAttribute[] = [
      ...this.baseAttributes(),
      {name: 'job-name', values: [options.jobName], tag: ValueTag.NameWithoutLanguage},
      {
        name: 'document-format',
        values: [options.documentFormat],
        tag: ValueTag.MimeMediaType,
      },
      // false => принтер подставит свои значения вместо отказа. На мероприятии
      // напечатать «почти как просили» лучше, чем не напечатать вообще.
      {name: 'ipp-attribute-fidelity', values: [false], tag: ValueTag.Boolean},
    ];

    const jobAttributes: IppOutAttribute[] = [
      {name: 'copies', values: [Math.max(1, options.copies ?? 1)], tag: ValueTag.Integer},
    ];

    if (options.media) {
      jobAttributes.push({name: 'media', values: [options.media], tag: ValueTag.Keyword});
    }
    if (options.resolution) {
      jobAttributes.push({
        name: 'printer-resolution',
        values: [options.resolution],
      });
    }
    if (options.colorMode) {
      jobAttributes.push({
        name: 'print-color-mode',
        values: [options.colorMode],
        tag: ValueTag.Keyword,
      });
    }
    if (options.scaling) {
      // PWG 5100.16: как вписывать растр в лист. `fill` = печать в край.
      jobAttributes.push({
        name: 'print-scaling',
        values: [options.scaling],
        tag: ValueTag.Keyword,
      });
    }

    return [
      {tag: DelimiterTag.OperationAttributes, attributes: operationAttributes},
      {tag: DelimiterTag.JobAttributes, attributes: jobAttributes},
    ];
  }
}

/** Человекочитаемое описание кода статуса IPP. */
export function describeStatus(status: number): string {
  switch (status) {
    case StatusCode.ClientErrorDocumentFormatNotSupported:
      return 'Принтер не понимает формат документа';
    case StatusCode.ClientErrorAttributesOrValuesNotSupported:
      return 'Принтер не поддерживает запрошенные параметры печати';
    case StatusCode.ClientErrorNotFound:
      return 'Очередь печати не найдена по указанному пути';
    case StatusCode.ClientErrorNotAuthorized:
    case StatusCode.ClientErrorNotAuthenticated:
      return 'Принтер требует авторизации';
    case StatusCode.ClientErrorRequestEntityTooLarge:
      return 'Файл слишком большой для принтера';
    case StatusCode.ServerErrorNotAcceptingJobs:
      return 'Принтер не принимает задания';
    case StatusCode.ServerErrorBusy:
      return 'Принтер занят';
    case StatusCode.ServerErrorDeviceError:
      return 'Аппаратная ошибка принтера';
    case StatusCode.ServerErrorTemporaryError:
      return 'Временная ошибка принтера';
    case StatusCode.ServerErrorOperationNotSupported:
      return 'Принтер не поддерживает эту операцию';
    default:
      return `Принтер вернул код 0x${status.toString(16).padStart(4, '0')}`;
  }
}

/**
 * Перебирает типовые пути очереди печати и возвращает первый рабочий.
 *
 * Xiaomi отдаёт `/ipp/print`, но у разных прошивок путь отличается, а
 * mDNS-запись `rp=` доступна не всегда — поэтому пробуем по списку.
 */
export async function probeIppEndpoint(
  host: string,
  connector: TcpConnector,
  port: number = DEFAULT_IPP_PORT,
  paths: readonly string[] = COMMON_IPP_PATHS,
  timeoutMs = 4_000,
): Promise<{endpoint: IppEndpoint; capabilities: PrinterCapabilities} | null> {
  for (const path of paths) {
    const client = new IppClient({
      endpoint: {host, port, path},
      connector,
      queryTimeoutMs: timeoutMs,
    });
    try {
      const capabilities = await client.getCapabilities();
      return {endpoint: {host, port, path}, capabilities};
    } catch {
      // Неверный путь — пробуем следующий.
    }
  }
  return null;
}

/** Размер листа 4×6 дюймов (10×15 см) — основной формат Xiaomi 1S. */
export const MEDIA_4X6: MediaSize = {widthMm: 101.6, heightMm: 152.4};

/** Размер листа 3×3 дюйма — квадратный формат. */
export const MEDIA_3X3: MediaSize = {widthMm: 76.2, heightMm: 76.2};

/**
 * Карманный формат 2×3 дюйма — 50,8 × 76,2 мм.
 *
 * На такой бумаге работают компактные Xiaomi: и ZINK-модели, где краситель
 * запечён в саму бумагу, и сублимационные картриджи того же размера.
 * Пропорция та же, что у 10×15 (2:3), поэтому все раскладки переносятся
 * без изменений — кадры просто выходят мельче.
 */
export const MEDIA_2X3: MediaSize = {widthMm: 50.8, heightMm: 76.2};
