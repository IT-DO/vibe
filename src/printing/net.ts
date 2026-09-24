/**
 * Абстракция TCP-сокета.
 *
 * Слой печати не импортирует ничего из React Native — благодаря этому весь
 * протокол гоняется в юнит-тестах на Node с поддельным сокетом, без эмулятора
 * и без принтера. Реальная реализация поверх `react-native-tcp-socket` лежит
 * в `src/platform/tcp.ts` и подставляется при сборке приложения.
 */

/** Открытое TCP-соединение. */
export interface TcpSocket {
  /** Отправляет байты. Может вызываться несколько раз. */
  write(data: Uint8Array): void;
  /** Подписка на входящие данные. */
  onData(handler: (chunk: Uint8Array) => void): void;
  /** Подписка на ошибку сокета. */
  onError(handler: (error: Error) => void): void;
  /** Подписка на закрытие соединения удалённой стороной. */
  onClose(handler: () => void): void;
  /** Немедленно закрывает соединение и освобождает ресурсы. */
  destroy(): void;
}

/** Фабрика соединений. */
export interface TcpConnector {
  connect(host: string, port: number, timeoutMs: number): Promise<TcpSocket>;
}

/** Ошибка сетевого уровня — отличаем её от протокольных ошибок принтера. */
export class NetworkError extends Error {
  constructor(
    message: string,
    // Error.cause существует в новых lib.d.ts — перекрываем осознанно.
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'NetworkError';
  }
}

/** Истекло время ожидания ответа. */
export class TimeoutError extends NetworkError {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}
