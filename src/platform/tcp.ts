/**
 * TCP-соединения на React Native — реализация `TcpConnector` из слоя печати.
 *
 * Отдельный файл нужен ровно затем, чтобы протокольный код не знал про
 * React Native и оставался проверяемым в юнит-тестах.
 */

import TcpSocket from 'react-native-tcp-socket';

import {NetworkError, TimeoutError, type TcpConnector, type TcpSocket as Socket} from '../printing/net';

/** Приводит входящий кусок данных к байтам. */
function toBytes(chunk: unknown): Uint8Array {
  if (chunk instanceof Uint8Array) {
    return chunk;
  }
  // Библиотека может отдать Buffer (это тоже Uint8Array) или строку, если
  // кто-то выставил кодировку. Строку читаем как latin1 — байт в символ.
  if (typeof chunk === 'string') {
    const out = new Uint8Array(chunk.length);
    for (let i = 0; i < chunk.length; i++) {
      out[i] = chunk.charCodeAt(i) & 0xff;
    }
    return out;
  }
  if (chunk && typeof chunk === 'object' && 'length' in chunk) {
    return Uint8Array.from(chunk as ArrayLike<number>);
  }
  return new Uint8Array(0);
}

class RnTcpSocket implements Socket {
  private closed = false;

  constructor(private readonly socket: ReturnType<typeof TcpSocket.createConnection>) {}

  write(data: Uint8Array): void {
    this.socket.write(data);
  }

  onData(handler: (chunk: Uint8Array) => void): void {
    this.socket.on('data', chunk => handler(toBytes(chunk)));
  }

  onError(handler: (error: Error) => void): void {
    this.socket.on('error', error => handler(error as Error));
  }

  onClose(handler: () => void): void {
    this.socket.on('close', () => handler());
  }

  destroy(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    try {
      this.socket.destroy();
    } catch {
      // Сокет мог закрыться сам — повторное закрытие не ошибка.
    }
  }
}

/** Соединитель поверх `react-native-tcp-socket`. */
export class RnTcpConnector implements TcpConnector {
  connect(host: string, port: number, timeoutMs: number): Promise<Socket> {
    return new Promise((resolve, reject) => {
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          try {
            socket.destroy();
          } catch {
            // уже закрыт
          }
          reject(new TimeoutError(`Не удалось подключиться к ${host}:${port} за ${timeoutMs} мс`));
        }
      }, timeoutMs);

      const socket = TcpSocket.createConnection({host, port}, () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(new RnTcpSocket(socket));
        }
      });

      socket.on('error', error => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new NetworkError(`Не удалось подключиться к ${host}:${port}`, error));
        }
      });
    });
  }
}
