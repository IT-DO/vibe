/**
 * Разговор с фотопринтером: команды, передача снимка, слежение за заданием.
 *
 * Слой намеренно не знает ни про Bluetooth, ни про React Native — ему дают
 * двусторонний канал байтов (`HanntoLink`), и этого хватает. Благодаря этому
 * весь протокол проверяется тестами на поддельном канале, а настоящий
 * Bluetooth подключается отдельно и остаётся тонким.
 *
 * Порядок разговора — ровно такой, как в перехвате настоящей печати:
 *
 *   1. рукопожатие на канале 255 (открытым текстом);
 *   2. `get_prop device_info` — узнаём модель и прошивку;
 *   3. `mixed_status` — принтер должен быть свободен, с бумагой и зарядом;
 *   4. `print_job` с размером файла — принтер выдаёт номер задания;
 *   5. JPEG уходит кусками по 988 байт на канале 4;
 *   6. `mixed_status` до конца печати, затем `job_info` — итог.
 */

import {decryptEcb, encryptEcb} from './aes';
import {
  Channel,
  Encoding,
  type Frame,
  Interactive,
  buildFrame,
  readFrames,
} from './frames';
import {
  buildConfirm,
  buildHello,
  computeConfirmation,
  parseServerHello,
} from './handshake';
import {decodeUtf8, encodeUtf8} from './text';

/** Двусторонний канал байтов до принтера. */
export interface HanntoLink {
  write(data: Uint8Array): Promise<void>;
  /** Подписка на входящие байты; возвращает отписку. */
  subscribe(listener: (data: Uint8Array) => void): () => void;
}

/** Сколько данных влезает в один кусок файла: 992 минус номер задания. */
export const CHUNK_DATA = 988;

/** Номер задания в начале каждого куска. */
const JOB_ID_SIZE = 4;

/**
 * Значение поля `channel` в `print_job`.
 *
 * Прошивка различает по нему источник задания. 528 — то, что шлёт
 * приложение Xiaomi Home; с другими значениями поведение не проверено,
 * поэтому повторяем известное рабочее.
 */
const PRINT_SOURCE = 528;

/** Обычная фотопечать. Других типов в приложении не используем. */
const JOB_TYPE_PHOTO = 0;

/**
 * Сколько кадров склеивать в одну запись в канал.
 *
 * Снимок уходит двумя с лишним сотнями кадров, и каждая запись — это
 * переход через мост в нативный модуль. По три за раз столько же байт
 * уезжает втрое меньшим числом переходов; ровно так поступает и
 * официальное приложение.
 */
const FRAMES_PER_WRITE = 3;

/** Ответ принтера уместился бы в 1023 байта, но длинный придёт частями. */
interface Pending {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

/** Сведения об устройстве. */
export interface DeviceInfo {
  readonly sku?: string;
  readonly fw_ver?: string;
  readonly hw_ver?: string;
  readonly mac?: string;
  readonly did?: string;
}

/** Текущее состояние принтера. */
export interface PrinterStatus {
  /** `idle`, `processing`, `error` и прочее, что шлёт прошивка. */
  readonly category: string;
  readonly sub_category?: string;
  /** 0 — всё в порядке. */
  readonly error: number;
  /** Заряд в процентах. */
  readonly 'battery-level'?: number;
  /** Сколько отпечатков осталось до чистки. */
  readonly clean_remain?: number;
  readonly job_id?: number;
  readonly prt_copies?: number;
}

/** Итог задания. */
export interface JobInfo {
  readonly job_id: number;
  /** `finished`, `printing`, `cancel`, `error`. */
  readonly job_state: string;
  readonly prt_copies?: number;
  readonly transfer_time?: number;
  readonly print_time?: number;
}

export interface SessionOptions {
  /** Сколько ждать ответа на команду. */
  readonly timeoutMs?: number;
  /** Куда писать ход разговора — в отладке очень выручает. */
  readonly log?: (message: string) => void;
}

const DEFAULT_TIMEOUT = 10_000;

export class HanntoError extends Error {}

export class HanntoSession {
  private readonly link: HanntoLink;
  private readonly timeoutMs: number;
  private readonly log: (message: string) => void;

  private unsubscribe: (() => void) | null = null;
  private buffer: Uint8Array = new Uint8Array(0);
  private sequence = 0;
  private key: Uint8Array | null = null;

  /** Ожидающие ответа команды: ключ — `id` из JSON. */
  private readonly pending = new Map<number, Pending>();
  /** Ожидание кадра рукопожатия: там `id` нет, сопоставляем по типу. */
  private handshakeWaiter: ((frame: Frame) => void) | null = null;
  /** Незавершённые многочастные ответы. */
  private readonly partial = new Map<number, Uint8Array[]>();

  constructor(link: HanntoLink, options: SessionOptions = {}) {
    this.link = link;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT;
    this.log = options.log ?? (() => {});
  }

  /** Установлен ли общий ключ. */
  get ready(): boolean {
    return this.key !== null;
  }

  /**
   * Рукопожатие. После него канал зашифрован и можно слать команды.
   *
   * Ключ вырабатывается заново при каждом подключении и нигде не хранится,
   * поэтому ни токена, ни учётной записи Xiaomi не требуется.
   */
  async connect(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = this.link.subscribe(data => this.receive(data));
    this.buffer = new Uint8Array(0);
    this.sequence = 0;
    this.key = null;

    const hello = this.waitHandshake(Interactive.serverHello);
    await this.link.write(buildHello(this.nextSequence()));
    const server = parseServerHello((await hello).body);
    this.log(`принтер предложил модуль ${server.p.toString(16).toUpperCase()}`);

    const confirmed = this.waitHandshake(Interactive.serverConfirm);
    const confirmation = computeConfirmation(server);
    await this.link.write(buildConfirm(this.nextSequence(), confirmation));

    // Принтер отвечает «ok», дополняя тело нулями до трёх байт. Сверяем
    // началом строки: на длину и регистр ответа полагаться незачем.
    const answer = decodeUtf8((await confirmed).body).trim().toLowerCase();
    if (!answer.startsWith('ok')) {
      throw new HanntoError(`Принтер отверг рукопожатие: «${answer}»`);
    }
    this.key = confirmation.key;
    this.log('ключ сеанса установлен');
  }

  /** Закрывает приём данных. Сам канал не трогаем — им владеет транспорт. */
  close(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.key = null;
    for (const [id, waiter] of this.pending) {
      clearTimeout(waiter.timer);
      waiter.reject(new HanntoError(`Связь с принтером прервана (команда ${id})`));
    }
    this.pending.clear();
    this.partial.clear();
  }

  /** Сведения об устройстве: модель, прошивка, серийный номер. */
  async deviceInfo(): Promise<DeviceInfo> {
    const result = await this.call<DeviceInfo[]>('get_prop', ['device_info']);
    const info = Array.isArray(result) ? result[0] : undefined;
    if (!info) {
      throw new HanntoError('Принтер не сообщил сведения о себе');
    }
    return info;
  }

  /** Текущее состояние: занят ли, заряд, остаток бумаги. */
  status(): Promise<PrinterStatus> {
    return this.call<PrinterStatus>('mixed_status', {});
  }

  /** Ставит задание и возвращает его номер. */
  async createJob(fileSize: number, copies = 1): Promise<number> {
    const result = await this.call<{job_id: number}>('print_job', {
      file_size: fileSize,
      copies,
      job_type: JOB_TYPE_PHOTO,
      channel: PRINT_SOURCE,
    });
    if (typeof result?.job_id !== 'number') {
      throw new HanntoError('Принтер принял задание, но не выдал его номер');
    }
    return result.job_id;
  }

  /** Итог задания: напечаталось ли и сколько это заняло. */
  async jobInfo(jobId: number): Promise<JobInfo> {
    const result = await this.call<JobInfo[]>('job_info', [jobId]);
    const info = Array.isArray(result) ? result[0] : undefined;
    if (!info) {
      throw new HanntoError(`Принтер не знает задания ${jobId}`);
    }
    return info;
  }

  /**
   * Отправляет файл кусками.
   *
   * Принтер не подтверждает куски по одному — он просто читает поток, —
   * поэтому шлём подряд, сообщая наверх о продвижении.
   */
  async sendFile(
    data: Uint8Array,
    jobId: number,
    onProgress?: (sent: number, total: number) => void,
  ): Promise<void> {
    const key = this.requireKey();
    const parts = Math.ceil(data.length / CHUNK_DATA);
    if (parts === 0) {
      throw new HanntoError('Нечего печатать: файл пуст');
    }

    let batch: Uint8Array[] = [];
    const flush = async () => {
      if (batch.length === 0) {
        return;
      }
      await this.link.write(concat(batch));
      batch = [];
    };

    for (let index = 0; index < parts; index++) {
      const slice = data.subarray(index * CHUNK_DATA, (index + 1) * CHUNK_DATA);
      const chunk = new Uint8Array(JOB_ID_SIZE + slice.length);
      new DataView(chunk.buffer).setUint32(0, jobId, true);
      chunk.set(slice, JOB_ID_SIZE);

      batch.push(
        buildFrame({
          channel: Channel.fileEncrypted,
          interactive: Interactive.request,
          encoding: Encoding.hex,
          sequence: this.nextSequence(),
          message: this.sequence,
          body: encryptEcb(key, chunk),
          encrypted: true,
          parts,
          part: index + 1,
        }),
      );
      if (batch.length >= FRAMES_PER_WRITE) {
        await flush();
      }
      onProgress?.(Math.min(data.length, (index + 1) * CHUNK_DATA), data.length);
    }
    await flush();

    this.log(`файл отправлен: ${data.length} байт в ${parts} частях`);
  }

  /** Вызов команды: JSON туда, JSON обратно. */
  async call<T>(method: string, params: unknown): Promise<T> {
    const key = this.requireKey();
    const id = this.nextSequence();
    const text = JSON.stringify({method, id, params});

    const answer = new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new HanntoError(`Принтер не ответил на «${method}» за ${this.timeoutMs} мс`));
      }, this.timeoutMs);
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });
    });

    await this.link.write(
      buildFrame({
        channel: Channel.dataEncrypted,
        interactive: Interactive.request,
        encoding: Encoding.json,
        sequence: id,
        message: id,
        body: encryptEcb(key, encodeUtf8(text)),
        encrypted: true,
      }),
    );
    return answer;
  }

  private requireKey(): Uint8Array {
    if (!this.key) {
      throw new HanntoError('Нет ключа: сначала нужно рукопожатие');
    }
    return this.key;
  }

  private nextSequence(): number {
    this.sequence += 1;
    return this.sequence;
  }

  private waitHandshake(interactive: number): Promise<Frame> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.handshakeWaiter = null;
        reject(new HanntoError('Принтер не ответил на рукопожатие'));
      }, this.timeoutMs);
      this.handshakeWaiter = frame => {
        if (frame.interactive !== interactive) {
          return;
        }
        clearTimeout(timer);
        this.handshakeWaiter = null;
        resolve(frame);
      };
    });
  }

  /** Разбирает пришедшие байты и раздаёт готовые ответы ожидающим. */
  private receive(data: Uint8Array): void {
    const merged = new Uint8Array(this.buffer.length + data.length);
    merged.set(this.buffer);
    merged.set(data, this.buffer.length);

    const {frames, rest} = readFrames(merged);
    this.buffer = rest;

    for (const frame of frames) {
      try {
        this.dispatch(frame);
      } catch (error) {
        this.log(`кадр не разобран: ${(error as Error).message}`);
      }
    }
  }

  private dispatch(frame: Frame): void {
    if (frame.channel === Channel.auth) {
      this.handshakeWaiter?.(frame);
      return;
    }
    if (frame.channel !== Channel.dataEncrypted) {
      return; // канал файла в обратную сторону не используется
    }

    const body = this.assemble(frame);
    if (!body) {
      return; // ответ ещё не собран целиком
    }

    const key = this.key;
    const plain = key ? decryptEcb(key, body) : body;
    const text = decodeUtf8(plain);
    let message: {id?: number; result?: unknown; error?: unknown; method?: string};
    try {
      message = JSON.parse(text);
    } catch {
      this.log(`ответ не разобран как JSON: ${text.slice(0, 80)}`);
      return;
    }

    if (typeof message.id !== 'number') {
      // Принтер шлёт и незапрошенные события — они нам не нужны.
      this.log(`событие принтера: ${message.method ?? text.slice(0, 60)}`);
      return;
    }

    const waiter = this.pending.get(message.id);
    if (!waiter) {
      return; // ответ на команду, которую мы уже перестали ждать
    }
    this.pending.delete(message.id);
    clearTimeout(waiter.timer);

    if (message.error !== undefined) {
      waiter.reject(new HanntoError(`Принтер вернул ошибку: ${JSON.stringify(message.error)}`));
      return;
    }
    waiter.resolve(message.result);
  }

  /** Склеивает многочастный ответ; для обычного отдаёт тело как есть. */
  private assemble(frame: Frame): Uint8Array | null {
    if (frame.parts <= 1) {
      return frame.body;
    }
    const collected = this.partial.get(frame.message) ?? [];
    collected[frame.part - 1] = frame.body;
    this.partial.set(frame.message, collected);

    const ready =
      collected.length === frame.parts && collected.every(part => part !== undefined);
    if (!ready) {
      return null;
    }
    this.partial.delete(frame.message);

    const total = collected.reduce((sum, part) => sum + part.length, 0);
    const body = new Uint8Array(total);
    let offset = 0;
    for (const part of collected) {
      body.set(part, offset);
      offset += part.length;
    }
    return body;
  }
}

/** Склеивает кадры в одну запись. */
function concat(parts: readonly Uint8Array[]): Uint8Array {
  if (parts.length === 1) {
    return parts[0]!;
  }
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
