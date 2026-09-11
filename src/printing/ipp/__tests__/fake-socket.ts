/**
 * Поддельный TCP-сокет для тестов: собирает исходящий HTTP-запрос, а как
 * только он получен целиком — отдаёт заранее подготовленный ответ.
 * Позволяет прогонять весь стек IPP без принтера и без эмулятора.
 */

import {concatBytes, decodeUtf8, encodeUtf8, indexOfBytes} from '../../../utils/bytes';
import type {TcpConnector, TcpSocket} from '../../net';

/** Что делает сокет, получив полный запрос. */
export type Responder = (request: ParsedRequest) => Uint8Array | Error | 'silence';

/** Разобранный исходящий запрос — удобно проверять в ожиданиях теста. */
export interface ParsedRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: Record<string, string>;
  /** Тело запроса — байты IPP-сообщения. */
  readonly body: Uint8Array;
}

export class FakeSocket implements TcpSocket {
  private dataHandler?: (chunk: Uint8Array) => void;
  private errorHandler?: (error: Error) => void;
  private closeHandler?: () => void;
  private written: Uint8Array[] = [];
  destroyed = false;

  constructor(
    private readonly responder: Responder,
    /** Разбивать ли ответ на куски — проверяет пересборку из чанков TCP. */
    private readonly chunkSize = 0,
  ) {}

  write(data: Uint8Array): void {
    this.written.push(data);
    const raw = concatBytes(this.written);
    const parsed = tryParseRequest(raw);
    if (!parsed) {
      return;
    }
    // Ответ приходит асинхронно, как из настоящей сети.
    setTimeout(() => this.reply(parsed), 0);
  }

  private reply(request: ParsedRequest): void {
    if (this.destroyed) {
      return;
    }
    const result = this.responder(request);
    if (result === 'silence') {
      return; // молчим — тест на таймаут
    }
    if (result instanceof Error) {
      this.errorHandler?.(result);
      return;
    }
    if (this.chunkSize > 0) {
      for (let at = 0; at < result.length; at += this.chunkSize) {
        this.dataHandler?.(result.subarray(at, at + this.chunkSize));
      }
    } else {
      this.dataHandler?.(result);
    }
    this.closeHandler?.();
  }

  onData(handler: (chunk: Uint8Array) => void): void {
    this.dataHandler = handler;
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandler = handler;
  }

  onClose(handler: () => void): void {
    this.closeHandler = handler;
  }

  destroy(): void {
    this.destroyed = true;
  }
}

export class FakeConnector implements TcpConnector {
  readonly connections: {host: string; port: number}[] = [];
  readonly sockets: FakeSocket[] = [];

  constructor(
    private readonly responder: Responder,
    private readonly options: {chunkSize?: number; failConnect?: boolean} = {},
  ) {}

  async connect(host: string, port: number): Promise<TcpSocket> {
    this.connections.push({host, port});
    if (this.options.failConnect) {
      throw new Error(`Соединение с ${host}:${port} отклонено`);
    }
    const socket = new FakeSocket(this.responder, this.options.chunkSize ?? 0);
    this.sockets.push(socket);
    return socket;
  }
}

/** Возвращает разобранный запрос, если тело получено целиком. */
function tryParseRequest(raw: Uint8Array): ParsedRequest | null {
  const headEnd = indexOfBytes(raw, encodeUtf8('\r\n\r\n'));
  if (headEnd < 0) {
    return null;
  }
  const lines = decodeUtf8(raw.subarray(0, headEnd)).split('\r\n');
  const [method = '', path = ''] = (lines[0] ?? '').split(' ');
  const headers: Record<string, string> = {};
  for (let i = 1; i < lines.length; i++) {
    const colon = lines[i]!.indexOf(':');
    if (colon > 0) {
      headers[lines[i]!.slice(0, colon).trim().toLowerCase()] = lines[i]!
        .slice(colon + 1)
        .trim();
    }
  }
  const expected = Number.parseInt(headers['content-length'] ?? '0', 10) || 0;
  const body = raw.subarray(headEnd + 4);
  if (body.length < expected) {
    return null;
  }
  return {method, path, headers, body: body.subarray(0, expected)};
}
