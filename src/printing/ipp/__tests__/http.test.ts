import {encodeUtf8} from '../../../utils/bytes';
import {parseResponse} from '../http';

const ascii = (s: string) => encodeUtf8(s);

describe('parseResponse', () => {
  it('возвращает null, пока заголовки не получены целиком', () => {
    expect(parseResponse(ascii('HTTP/1.1 200 OK\r\nContent-Len'))).toBeNull();
  });

  it('разбирает ответ с Content-Length', () => {
    const raw = ascii(
      'HTTP/1.1 200 OK\r\nContent-Type: application/ipp\r\nContent-Length: 5\r\n\r\nhello',
    );
    const parsed = parseResponse(raw);
    expect(parsed?.status).toBe(200);
    expect(parsed?.headers['content-type']).toBe('application/ipp');
    expect(parsed?.body).toHaveLength(5);
  });

  it('ждёт, пока придёт всё объявленное тело', () => {
    const raw = ascii('HTTP/1.1 200 OK\r\nContent-Length: 10\r\n\r\nhalf');
    expect(parseResponse(raw)).toBeNull();
    expect(parseResponse(raw, true)?.body).toHaveLength(4);
  });

  it('не отдаёт лишние байты за границей Content-Length', () => {
    const raw = ascii('HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nabcdef');
    expect(parseResponse(raw)?.body).toHaveLength(2);
  });

  it('собирает тело из chunked-кодирования', () => {
    const raw = ascii(
      'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nhello\r\n6\r\n world\r\n0\r\n\r\n',
    );
    const parsed = parseResponse(raw);
    expect(parsed?.body).toHaveLength(11);
    expect(String.fromCharCode(...(parsed?.body ?? []))).toBe('hello world');
  });

  it('ждёт финальный нулевой чанк', () => {
    const raw = ascii('HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nhello\r\n');
    expect(parseResponse(raw)).toBeNull();
  });

  it('игнорирует расширения чанка после точки с запятой', () => {
    const raw = ascii(
      'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n3;ext=1\r\nabc\r\n0\r\n\r\n',
    );
    expect(String.fromCharCode(...(parseResponse(raw)?.body ?? []))).toBe('abc');
  });

  it('без Content-Length ждёт закрытия соединения', () => {
    const raw = ascii('HTTP/1.1 200 OK\r\nServer: mini\r\n\r\npayload');
    expect(parseResponse(raw)).toBeNull();
    expect(parseResponse(raw, true)?.body).toHaveLength(7);
  });

  it('читает код ошибки', () => {
    const raw = ascii('HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n');
    expect(parseResponse(raw)?.status).toBe(404);
  });

  it('приводит имена заголовков к нижнему регистру', () => {
    const raw = ascii('HTTP/1.1 200 OK\r\nCONTENT-LENGTH: 0\r\n\r\n');
    expect(parseResponse(raw)?.headers['content-length']).toBe('0');
  });

  it('не портит бинарное тело со старшим битом', () => {
    const head = ascii('HTTP/1.1 200 OK\r\nContent-Length: 4\r\n\r\n');
    const raw = new Uint8Array(head.length + 4);
    raw.set(head);
    raw.set([0x02, 0x00, 0xff, 0x9a], head.length);
    expect(Array.from(parseResponse(raw)!.body)).toEqual([0x02, 0x00, 0xff, 0x9a]);
  });
});
