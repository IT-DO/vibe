/**
 * Кадры протокола фотопринтера Hannto (Xiaomi Portable Photo Printer 1S/Pro).
 *
 * Формат разобран по журналу Bluetooth с настоящей печати и сверен с
 * открытыми работами других людей (см. docs/BLUETOOTH-PROTOCOL.md). Модуль
 * чистый: ни Bluetooth, ни React Native — только байты, поэтому проверяется
 * на тех самых кадрах, что сняты с устройства.
 */

/** Границы кадра. Тот же байт свободно встречается внутри данных. */
export const FRAME_MARK = 0x7e;

/** Версия протокола: два байта сразу после начала кадра. */
const VERSION = 0x64;
const RESERVED = 0x00;

/** Заголовок фиксированной длины, дальше идут данные. */
export const HEADER_SIZE = 20;

/** Каналы. Шифрованные и открытые различаются номером. */
export const Channel = {
  base: 0,
  data: 1,
  file: 2,
  /** Команды JSON под шифрованием — рабочий канал. */
  dataEncrypted: 3,
  /** Куски файла под шифрованием — туда уходит отпечаток. */
  fileEncrypted: 4,
  /** Рукопожатие: обмен ключами идёт открытым текстом. */
  auth: 255,
} as const;

/** Что за сообщение внутри кадра. */
export const Interactive = {
  request: 6,
  response: 7,
  clientHello: 16,
  serverHello: 17,
  clientConfirm: 18,
  serverConfirm: 19,
} as const;

/** Как закодировано тело. */
export const Encoding = {
  binary: 1,
  hex: 2,
  json: 3,
} as const;

/**
 * Смещения в поле атрибутов, которыми обозначается шифрование.
 *
 * Поле совмещает длину тела и признак шифра: младшие 10 бит — длина,
 * старшие — режим. Из-за этого длина ограничена 1023 байтами, что и
 * определяет размер куска файла.
 */
export const EncryptOffset = {
  none: 0,
  ecb: 5120,
} as const;

/** Длина тела не может превысить 10 бит поля атрибутов. */
export const MAX_BODY = 1023;

/** Признак того, что сообщение разбито на части. */
const MULTIPART_FLAG = 8192;

export interface Frame {
  readonly channel: number;
  readonly interactive: number;
  readonly encoding: number;
  /** Сквозной счётчик кадров. */
  readonly sequence: number;
  /** Номер сообщения — по нему сопоставляется ответ. */
  readonly message: number;
  readonly parts: number;
  readonly part: number;
  readonly body: Uint8Array;
}

export interface BuildOptions {
  readonly channel: number;
  readonly interactive: number;
  readonly encoding: number;
  readonly sequence: number;
  readonly message: number;
  readonly body: Uint8Array;
  readonly encrypted?: boolean;
  readonly parts?: number;
  readonly part?: number;
}

/** Собирает кадр для отправки. Тело должно быть уже зашифровано. */
export function buildFrame(options: BuildOptions): Uint8Array {
  const {body} = options;
  if (body.length > MAX_BODY) {
    throw new Error(
      `Тело кадра ${body.length} байт, а поле длины вмещает ${MAX_BODY}`,
    );
  }

  const parts = options.parts ?? 0;
  const frame = new Uint8Array(HEADER_SIZE + body.length + 2);
  const view = new DataView(frame.buffer);

  frame[0] = FRAME_MARK;
  frame[1] = VERSION;
  frame[2] = RESERVED;
  frame[3] = options.channel;
  frame[4] = options.interactive;
  frame[5] = options.encoding;
  view.setUint32(6, options.sequence, true);
  view.setUint32(10, options.message, true);
  view.setUint16(14, parts, true);
  view.setUint16(16, options.part ?? 0, true);

  let attributes = body.length + (options.encrypted ? EncryptOffset.ecb : EncryptOffset.none);
  if (parts > 1) {
    attributes += MULTIPART_FLAG;
  }
  view.setUint16(18, attributes, true);
  frame.set(body, HEADER_SIZE);

  frame[frame.length - 2] = checksum(frame);
  frame[frame.length - 1] = FRAME_MARK;
  return frame;
}

/**
 * Контрольная сумма: сумма всех байтов кадра без начальной метки.
 *
 * Считается до того, как проставлены сама сумма и завершающая метка, —
 * оба байта ещё нулевые и в сумму не попадают. Поэтому вычитается ровно
 * одна метка, начальная.
 */
function checksum(frame: Uint8Array): number {
  let sum = 0;
  for (const byte of frame) {
    sum += byte;
  }
  return (sum - FRAME_MARK) & 0xff;
}

/** Длина тела по полю атрибутов. */
export function bodyLength(attributes: number): number {
  return attributes < MULTIPART_FLAG
    ? attributes % 1024
    : (attributes - MULTIPART_FLAG) % 1024;
}

/**
 * Разбирает кадр, лежащий в начале буфера.
 *
 * Возвращает `null`, если кадр ещё не дочитан целиком: по последовательному
 * каналу данные приходят кусками произвольного размера.
 */
export function parseFrame(
  buffer: Uint8Array,
  offset = 0,
): {frame: Frame; end: number} | null {
  if (buffer.length - offset < HEADER_SIZE + 2) {
    return null;
  }
  if (buffer[offset] !== FRAME_MARK || buffer[offset + 1] !== VERSION) {
    return null;
  }

  const view = new DataView(buffer.buffer, buffer.byteOffset + offset);
  const length = bodyLength(view.getUint16(18, true));
  const end = offset + HEADER_SIZE + length + 2;
  if (buffer.length < end) {
    return null;
  }

  return {
    frame: {
      channel: buffer[offset + 3]!,
      interactive: buffer[offset + 4]!,
      encoding: buffer[offset + 5]!,
      sequence: view.getUint32(6, true),
      message: view.getUint32(10, true),
      parts: view.getUint16(14, true),
      part: view.getUint16(16, true),
      body: buffer.slice(offset + HEADER_SIZE, offset + HEADER_SIZE + length),
    },
    end,
  };
}

/**
 * Выбирает из потока все целые кадры и возвращает непрочитанный остаток.
 *
 * Границы ищутся по началу кадра, а не по завершающей метке: та же метка
 * попадается внутри зашифрованных данных, и опираться на неё нельзя.
 */
export function readFrames(buffer: Uint8Array): {
  frames: Frame[];
  rest: Uint8Array;
} {
  const frames: Frame[] = [];
  let offset = 0;

  while (offset < buffer.length) {
    if (buffer[offset] !== FRAME_MARK || buffer[offset + 1] !== VERSION) {
      offset++;
      continue;
    }
    const parsed = parseFrame(buffer, offset);
    if (!parsed) {
      break;
    }
    frames.push(parsed.frame);
    offset = parsed.end;
  }

  return {frames, rest: buffer.slice(offset)};
}
