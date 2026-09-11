/**
 * Минимальный HTTP/1.1-клиент поверх TCP — ровно столько, сколько нужно IPP.
 *
 * Почему не fetch/XHR: тело IPP — бинарное, и в React Native `fetch` не даёт
 * надёжно отправить `Uint8Array` и прочитать бинарный ответ (RN подменяет
 * тело на строку и ломает байты > 0x7f). Поэтому HTTP собираем руками.
 *
 * Поддерживается и `Content-Length`, и `Transfer-Encoding: chunked` —
 * встречаются оба варианта в зависимости от прошивки принтера.
 */

import {concatBytes, encodeUtf8, indexOfBytes} from '../../utils/bytes';
import {NetworkError, TimeoutError, type TcpConnector} from '../net';

/** Разобранный HTTP-ответ. */
export interface HttpResponse {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: Uint8Array;
}

export interface HttpPostOptions {
  readonly host: string;
  readonly port: number;
  readonly path: string;
  readonly contentType: string;
  readonly body: Uint8Array;
  /** Таймаут на установку соединения и на получение полного ответа. */
  readonly timeoutMs: number;
  readonly connector: TcpConnector;
}

const CRLF_CRLF = encodeUtf8('\r\n\r\n');

/** Выполняет POST и возвращает полный ответ. */
export async function httpPost(options: HttpPostOptions): Promise<HttpResponse> {
  const {host, port, path, contentType, body, timeoutMs, connector} = options;
  const socket = await connector.connect(host, port, timeoutMs);

  return new Promise<HttpResponse>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => reject(new TimeoutError(`Принтер не ответил за ${timeoutMs} мс`)));
    }, timeoutMs);

    const tryParse = () => {
      const parsed = parseResponse(concatBytes(chunks));
      if (parsed) {
        finish(() => resolve(parsed));
      }
    };

    socket.onData(chunk => {
      chunks.push(chunk);
      tryParse();
    });

    socket.onError(error => {
      finish(() => reject(new NetworkError(`Ошибка соединения с ${host}:${port}`, error)));
    });

    socket.onClose(() => {
      // Соединение закрыто: если тело шло без Content-Length, оно закончилось.
      const raw = concatBytes(chunks);
      const parsed = parseResponse(raw, true);
      if (parsed) {
        finish(() => resolve(parsed));
      } else {
        finish(() =>
          reject(new NetworkError('Принтер закрыл соединение до полного ответа')),
        );
      }
    });

    const head =
      `POST ${path} HTTP/1.1\r\n` +
      `Host: ${host}:${port}\r\n` +
      `Content-Type: ${contentType}\r\n` +
      `Content-Length: ${body.length}\r\n` +
      'Connection: close\r\n' +
      'User-Agent: PhotoNaPamyat/1.0 IPP/2.0\r\n' +
      'Accept-Encoding: identity\r\n' +
      'Expect:\r\n' +
      '\r\n';

    try {
      socket.write(encodeUtf8(head));
      socket.write(body);
    } catch (error) {
      finish(() => reject(new NetworkError('Не удалось отправить запрос', error)));
    }
  });
}

/**
 * Пытается разобрать накопленные байты как полный HTTP-ответ.
 * Возвращает null, если данных пока недостаточно.
 *
 * @param eof — соединение закрыто, значит тело считается полным.
 */
export function parseResponse(raw: Uint8Array, eof = false): HttpResponse | null {
  const headEnd = indexOfBytes(raw, CRLF_CRLF);
  if (headEnd < 0) {
    return null;
  }

  const headText = new TextDecoderLite().decode(raw.subarray(0, headEnd));
  const lines = headText.split('\r\n');
  const statusLine = lines[0] ?? '';
  const status = Number.parseInt(statusLine.split(' ')[1] ?? '0', 10) || 0;

  const headers: Record<string, string> = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    const colon = line.indexOf(':');
    if (colon > 0) {
      headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
    }
  }

  const bodyStart = headEnd + CRLF_CRLF.length;
  const rest = raw.subarray(bodyStart);

  if ((headers['transfer-encoding'] ?? '').toLowerCase().includes('chunked')) {
    const decoded = decodeChunked(rest);
    if (!decoded && !eof) {
      return null;
    }
    return {status, headers, body: decoded ?? rest};
  }

  const declared = headers['content-length'];
  if (declared !== undefined) {
    const expected = Number.parseInt(declared, 10) || 0;
    if (rest.length < expected && !eof) {
      return null;
    }
    return {status, headers, body: rest.subarray(0, Math.min(expected, rest.length))};
  }

  // Без Content-Length считаем ответ полным только после закрытия соединения.
  return eof ? {status, headers, body: rest} : null;
}

/** Собирает тело из chunked-кодирования; null — данных ещё не хватает. */
function decodeChunked(raw: Uint8Array): Uint8Array | null {
  const parts: Uint8Array[] = [];
  let at = 0;
  for (;;) {
    const lineEnd = indexOfBytes(raw, encodeUtf8('\r\n'), at);
    if (lineEnd < 0) {
      return null;
    }
    const sizeText = new TextDecoderLite().decode(raw.subarray(at, lineEnd)).split(';')[0]!;
    const size = Number.parseInt(sizeText.trim(), 16);
    if (Number.isNaN(size)) {
      return null;
    }
    const dataStart = lineEnd + 2;
    if (size === 0) {
      return concatBytes(parts);
    }
    if (dataStart + size > raw.length) {
      return null;
    }
    parts.push(raw.subarray(dataStart, dataStart + size));
    at = dataStart + size + 2; // пропускаем CRLF после блока
  }
}

/**
 * Декодер ASCII/latin1 для заголовков: `TextDecoder` есть не во всех сборках
 * Hermes, а заголовки HTTP по спецификации всё равно однобайтовые.
 */
class TextDecoderLite {
  decode(data: Uint8Array): string {
    let out = '';
    for (let i = 0; i < data.length; i++) {
      out += String.fromCharCode(data[i]!);
    }
    return out;
  }
}
