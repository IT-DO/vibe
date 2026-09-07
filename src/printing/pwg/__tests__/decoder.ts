/**
 * Независимый декодер PWG Raster — только для тестов.
 *
 * Написан по тексту спецификации отдельно от кодировщика, чтобы round-trip
 * проверял реальное соответствие формату, а не согласованность кода с самим
 * собой.
 */

import {ByteReader} from '../../../utils/bytes';
import {PWG_PAGE_HEADER_SIZE, PWG_SYNC_WORD} from '../raster';

export interface DecodedHeader {
  readonly mediaClass: string;
  readonly mediaType: string;
  readonly hwResolution: readonly [number, number];
  readonly numCopies: number;
  readonly pageSizePt: readonly [number, number];
  readonly width: number;
  readonly height: number;
  readonly bitsPerColor: number;
  readonly bitsPerPixel: number;
  readonly bytesPerLine: number;
  readonly colorOrder: number;
  readonly colorSpace: number;
  readonly numColors: number;
  readonly totalPageCount: number;
  readonly crossFeedTransform: number;
  readonly feedTransform: number;
  readonly imageBox: readonly [number, number, number, number];
  readonly printQuality: number;
  readonly pageSizeName: string;
}

export interface DecodedPage {
  readonly header: DecodedHeader;
  /** Развёрнутые пиксели, длина = width * height * channels. */
  readonly pixels: Uint8Array;
}

function readCString(data: Uint8Array, offset: number, size: number): string {
  let end = offset;
  while (end < offset + size && data[end] !== 0) {
    end++;
  }
  let out = '';
  for (let i = offset; i < end; i++) {
    out += String.fromCharCode(data[i]!);
  }
  return out;
}

function readU32(data: Uint8Array, offset: number): number {
  return (
    data[offset]! * 0x1000000 +
    ((data[offset + 1]! << 16) | (data[offset + 2]! << 8) | data[offset + 3]!)
  );
}

export function parseHeader(raw: Uint8Array): DecodedHeader {
  if (raw.length !== PWG_PAGE_HEADER_SIZE) {
    throw new Error(`Заголовок должен быть ${PWG_PAGE_HEADER_SIZE} Б, а он ${raw.length} Б`);
  }
  return {
    mediaClass: readCString(raw, 0, 64),
    mediaType: readCString(raw, 128, 64),
    hwResolution: [readU32(raw, 276), readU32(raw, 280)],
    numCopies: readU32(raw, 340),
    pageSizePt: [readU32(raw, 352), readU32(raw, 356)],
    width: readU32(raw, 372),
    height: readU32(raw, 376),
    bitsPerColor: readU32(raw, 384),
    bitsPerPixel: readU32(raw, 388),
    bytesPerLine: readU32(raw, 392),
    colorOrder: readU32(raw, 396),
    colorSpace: readU32(raw, 400),
    numColors: readU32(raw, 420),
    totalPageCount: readU32(raw, 452),
    crossFeedTransform: readU32(raw, 456),
    feedTransform: readU32(raw, 460),
    imageBox: [readU32(raw, 464), readU32(raw, 468), readU32(raw, 472), readU32(raw, 476)],
    printQuality: readU32(raw, 484),
    pageSizeName: readCString(raw, 1732, 64),
  };
}

/** Разбирает одностраничный документ PWG Raster обратно в пиксели. */
export function decodePwgRaster(raw: Uint8Array): DecodedPage {
  const r = new ByteReader(raw);
  const sync = r.utf8(4);
  if (sync !== PWG_SYNC_WORD) {
    throw new Error(`Неверная сигнатура: «${sync}»`);
  }

  const header = parseHeader(r.bytes(PWG_PAGE_HEADER_SIZE));
  const channels = header.bitsPerPixel / 8;
  const bytesPerLine = header.width * channels;
  const pixels = new Uint8Array(header.width * header.height * channels);

  let y = 0;
  while (y < header.height) {
    const lineRepeat = r.u8() + 1;
    const line = new Uint8Array(bytesPerLine);

    let x = 0;
    while (x < header.width) {
      const count = r.u8();
      if (count <= 127) {
        // Повтор одного пикселя (count + 1) раз.
        const pixel = r.bytes(channels);
        for (let n = 0; n <= count; n++) {
          line.set(pixel, x * channels);
          x++;
        }
      } else {
        // (257 - count) неповторяющихся пикселей.
        const literal = 257 - count;
        line.set(r.bytes(literal * channels), x * channels);
        x += literal;
      }
    }
    if (x !== header.width) {
      throw new Error(`Строка ${y} раскодировалась в ${x} пикселей вместо ${header.width}`);
    }

    for (let n = 0; n < lineRepeat && y < header.height; n++, y++) {
      pixels.set(line, y * bytesPerLine);
    }
  }

  return {header, pixels};
}
