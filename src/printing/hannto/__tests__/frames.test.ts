/**
 * Кадры протокола принтера — на настоящих байтах.
 *
 * Проверка идёт не против собственной реализации, а против кадров, снятых с
 * устройства во время настоящей печати (`fixtures/capture.json`). Если мы
 * собираем кадр иначе, чем приложение Xiaomi, принтер его молча отвергнет —
 * и понять это на мероприятии будет нельзя.
 */

import {
  Channel,
  Encoding,
  EncryptOffset,
  Interactive,
  MAX_BODY,
  bodyLength,
  buildFrame,
  parseFrame,
  readFrames,
} from '../frames';
import capture from './fixtures/capture.json';

const hex = (s: string) => Uint8Array.from(Buffer.from(s, 'hex'));
const toHex = (b: Uint8Array) => Buffer.from(b).toString('hex');

describe('длина тела в поле атрибутов', () => {
  it('командный кадр: 5120 за шифрование плюс длина', () => {
    // Из настоящего кадра: атрибуты 5184 при теле в 64 байта.
    expect(capture.команды.первый_кадр.атрибуты).toBe(EncryptOffset.ecb + 64);
    expect(bodyLength(capture.команды.первый_кадр.атрибуты)).toBe(64);
  });

  it('файловый кадр: ещё и признак многочастности', () => {
    // 8192 (части) + 5120 (шифрование) + 992 (длина) = 14304.
    expect(capture.файл.атрибуты).toBe(8192 + EncryptOffset.ecb + 992);
    expect(bodyLength(capture.файл.атрибуты)).toBe(992);
  });

  it('поле вмещает не больше 1023 байт — отсюда размер куска файла', () => {
    expect(bodyLength(EncryptOffset.ecb + MAX_BODY)).toBe(MAX_BODY);
  });
});

describe('сборка кадра повторяет настоящий байт в байт', () => {
  it('подтверждение рукопожатия', () => {
    const real = capture.рукопожатие.подтверждение_от_нас;
    const built = buildFrame({
      channel: Channel.auth,
      interactive: Interactive.clientConfirm,
      encoding: Encoding.json,
      sequence: 2,
      message: 2,
      body: hex(real.тело),
      encrypted: true,
    });
    // Совпадает и заголовок, и контрольная сумма — значит считаем её так же.
    expect(toHex(built)).toBe(real.кадр);
  });

  it('командный кадр', () => {
    const real = capture.команды.первый_кадр;
    const body = hex(real.кадр).slice(20, 20 + real.длина_тела);
    const built = buildFrame({
      channel: Channel.dataEncrypted,
      interactive: Interactive.request,
      encoding: Encoding.json,
      sequence: 3,
      message: 3,
      body,
      encrypted: true,
    });
    expect(toHex(built)).toBe(real.кадр);
  });

  it('заголовок файлового кадра', () => {
    const real = capture.файл;
    const built = buildFrame({
      channel: Channel.fileEncrypted,
      interactive: Interactive.request,
      encoding: Encoding.hex,
      sequence: 19,
      message: 19,
      body: new Uint8Array(real.длина_тела),
      encrypted: true,
      parts: real.всего_частей,
      part: real.номер_первой_части,
    });
    expect(toHex(built.slice(0, 20))).toBe(real.первый_кадр_заголовок);
  });
});

describe('разбор настоящих кадров', () => {
  it('привет принтера', () => {
    const parsed = parseFrame(hex(capture.рукопожатие.привет_принтера.кадр));
    expect(parsed).not.toBeNull();
    expect(parsed!.frame.channel).toBe(Channel.auth);
    expect(parsed!.frame.interactive).toBe(Interactive.serverHello);
    expect(toHex(parsed!.frame.body)).toBe(capture.рукопожатие.привет_принтера.тело);
  });

  it('файловый кадр отдаёт номер части и их общее число', () => {
    const real = capture.файл;
    const frame = new Uint8Array(20 + real.длина_тела + 2);
    frame.set(hex(real.первый_кадр_заголовок));
    const parsed = parseFrame(frame);
    expect(parsed!.frame.parts).toBe(227);
    expect(parsed!.frame.part).toBe(1);
    expect(parsed!.frame.body.length).toBe(992);
  });
});

describe('чтение потока', () => {
  it('выбирает несколько кадров подряд', () => {
    const a = hex(capture.рукопожатие.подтверждение_от_нас.кадр);
    const b = hex(capture.команды.первый_кадр.кадр);
    const stream = new Uint8Array(a.length + b.length);
    stream.set(a);
    stream.set(b, a.length);

    const {frames, rest} = readFrames(stream);
    expect(frames).toHaveLength(2);
    expect(rest).toHaveLength(0);
  });

  it('недочитанный кадр остаётся в остатке', () => {
    // По последовательному каналу данные приходят кусками произвольного
    // размера, и кадр часто разорван посередине.
    const full = hex(capture.команды.первый_кадр.кадр);
    const {frames, rest} = readFrames(full.slice(0, 40));
    expect(frames).toHaveLength(0);
    expect(rest.length).toBe(40);
  });

  it('склеенный из двух кусков кадр читается целиком', () => {
    const full = hex(capture.команды.первый_кадр.кадр);
    const first = readFrames(full.slice(0, 30));
    const joined = new Uint8Array(first.rest.length + (full.length - 30));
    joined.set(first.rest);
    joined.set(full.slice(30), first.rest.length);
    expect(readFrames(joined).frames).toHaveLength(1);
  });

  it('метка кадра внутри зашифрованных данных не сбивает разбор', () => {
    // Байт 0x7E не экранируется и свободно встречается в шифротексте.
    const body = new Uint8Array(48).fill(0x7e);
    const frame = buildFrame({
      channel: Channel.dataEncrypted,
      interactive: Interactive.request,
      encoding: Encoding.json,
      sequence: 1,
      message: 1,
      body,
      encrypted: true,
    });
    const {frames, rest} = readFrames(frame);
    expect(frames).toHaveLength(1);
    expect(frames[0]!.body).toHaveLength(48);
    expect(rest).toHaveLength(0);
  });

  it('мусор перед кадром пропускается', () => {
    const frame = hex(capture.рукопожатие.подтверждение_от_нас.кадр);
    const noisy = new Uint8Array(3 + frame.length);
    noisy.set([0x00, 0x7e, 0x11]);
    noisy.set(frame, 3);
    expect(readFrames(noisy).frames).toHaveLength(1);
  });
});

describe('отказы', () => {
  it('тело длиннее поля длины не собирается', () => {
    expect(() =>
      buildFrame({
        channel: Channel.dataEncrypted,
        interactive: Interactive.request,
        encoding: Encoding.json,
        sequence: 1,
        message: 1,
        body: new Uint8Array(MAX_BODY + 1),
      }),
    ).toThrow(/вмещает/);
  });
});
