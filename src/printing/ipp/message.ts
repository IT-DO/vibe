/**
 * Модель IPP-сообщения и бинарный кодек (RFC 8010 §3).
 *
 * Формат сообщения:
 *
 *   version-number   2 Б   (major, minor)
 *   operation-id     2 Б   (в запросе) / status-code (в ответе)
 *   request-id       4 Б
 *   attribute-group* ...   каждая начинается с тега-разделителя
 *   end-of-attrs     1 Б   (0x03)
 *   data             ...   тело документа для Print-Job / Send-Document
 *
 * Атрибут внутри группы:
 *
 *   value-tag        1 Б
 *   name-length      2 Б
 *   name             name-length Б
 *   value-length     2 Б
 *   value            value-length Б
 *
 * Дополнительные значения того же атрибута (1setOf) кодируются как атрибуты
 * с name-length = 0 — на этом строится сборка массивов при разборе.
 */

import {ByteReader, ByteWriter} from '../../utils/bytes';
import {
  DelimiterTag,
  IPP_VERSION,
  ResolutionUnit,
  ValueTag,
  type ValueTagCode,
} from './constants';

/** Разрешение печати, значение тега `resolution`. */
export interface IppResolution {
  readonly kind: 'resolution';
  readonly x: number;
  readonly y: number;
  /** 3 = точек на дюйм, 4 = точек на сантиметр. */
  readonly units: number;
}

/** Диапазон целых, значение тега `rangeOfInteger`. */
export interface IppRange {
  readonly kind: 'range';
  readonly lower: number;
  readonly upper: number;
}

/** Коллекция (RFC 3382) — например, элемент `media-col`. */
export interface IppCollection {
  readonly kind: 'collection';
  readonly members: Record<string, IppValue[]>;
}

/** Значение с явно указанным тегом — когда важно, чем именно кодировать. */
export interface IppTagged {
  readonly kind: 'tagged';
  readonly tag: ValueTagCode;
  readonly value: string | number | boolean;
}

/** «Нет значения» / «не поддерживается» — приходит от принтера в ответах. */
export interface IppNoValue {
  readonly kind: 'no-value';
  readonly tag: ValueTagCode;
}

export type IppValue =
  | string
  | number
  | boolean
  | IppResolution
  | IppRange
  | IppCollection
  | IppTagged
  | IppNoValue;

/** Одна группа атрибутов сообщения. */
export interface IppAttributeGroup {
  readonly tag: number;
  readonly attributes: Record<string, IppValue[]>;
}

/** Разобранный ответ принтера. */
export interface IppResponse {
  readonly versionMajor: number;
  readonly versionMinor: number;
  readonly statusCode: number;
  readonly requestId: number;
  readonly groups: IppAttributeGroup[];
  /** Данные после end-of-attributes (у ответов почти всегда пусто). */
  readonly data: Uint8Array;
}

/** Атрибут для записи: имя + значения + опциональный явный тег. */
export interface IppOutAttribute {
  readonly name: string;
  readonly values: readonly IppValue[];
  /** Тег по умолчанию для значений, у которых он не выведен автоматически. */
  readonly tag?: ValueTagCode;
}

/** Группа атрибутов для записи. */
export interface IppOutGroup {
  readonly tag: number;
  readonly attributes: readonly IppOutAttribute[];
}

/** Запрос целиком. */
export interface IppRequest {
  readonly operation: number;
  readonly requestId: number;
  readonly groups: readonly IppOutGroup[];
  readonly data?: Uint8Array;
}

/** Тег по умолчанию для значения, если он не задан явно. */
function inferTag(value: IppValue, fallback?: ValueTagCode): ValueTagCode {
  if (typeof value === 'boolean') {
    return ValueTag.Boolean;
  }
  if (typeof value === 'number') {
    return fallback ?? ValueTag.Integer;
  }
  if (typeof value === 'string') {
    return fallback ?? ValueTag.Keyword;
  }
  switch (value.kind) {
    case 'resolution':
      return ValueTag.Resolution;
    case 'range':
      return ValueTag.RangeOfInteger;
    case 'collection':
      return ValueTag.BegCollection;
    case 'tagged':
      return value.tag;
    case 'no-value':
      return value.tag;
  }
}

/** Записывает тело значения (без тега и имени) с префиксом длины. */
function writeValue(w: ByteWriter, tag: ValueTagCode, value: IppValue): void {
  // Коллекции и пустые значения кодируются особым образом.
  if (typeof value === 'object' && value.kind === 'collection') {
    writeCollection(w, value);
    return;
  }
  if (typeof value === 'object' && value.kind === 'no-value') {
    w.u16(0);
    return;
  }

  const raw = typeof value === 'object' && value.kind === 'tagged' ? value.value : value;

  switch (tag) {
    case ValueTag.Integer:
    case ValueTag.Enum:
      w.u16(4).u32(Number(raw) | 0);
      return;
    case ValueTag.Boolean:
      w.u16(1).u8(raw ? 1 : 0);
      return;
    case ValueTag.Resolution: {
      const r = value as IppResolution;
      w.u16(9).u32(r.x).u32(r.y).u8(r.units);
      return;
    }
    case ValueTag.RangeOfInteger: {
      const r = value as IppRange;
      w.u16(8).u32(r.lower | 0).u32(r.upper | 0);
      return;
    }
    default: {
      // Все текстовые типы (keyword, uri, name, text, charset, mimeMediaType…).
      const body = new ByteWriter(32).utf8(String(raw)).toBytes();
      w.u16(body.length).bytes(body);
      return;
    }
  }
}

/**
 * Коллекция по RFC 3382: begCollection с пустым значением, затем пары
 * memberAttrName + значение (у всех name-length = 0), затем endCollection.
 */
function writeCollection(w: ByteWriter, collection: IppCollection): void {
  w.u16(0); // value-length самого begCollection всегда 0
  for (const [memberName, memberValues] of Object.entries(collection.members)) {
    w.u8(ValueTag.MemberAttrName).u16(0);
    const nameBytes = new ByteWriter(16).utf8(memberName).toBytes();
    w.u16(nameBytes.length).bytes(nameBytes);
    for (const mv of memberValues) {
      const memberTag = inferTag(mv);
      w.u8(memberTag).u16(0);
      writeValue(w, memberTag, mv);
    }
  }
  w.u8(ValueTag.EndCollection).u16(0).u16(0);
}

/** Сериализует IPP-запрос в байты, готовые к отправке в теле HTTP POST. */
export function encodeRequest(request: IppRequest): Uint8Array {
  const w = new ByteWriter(1024);
  w.u8(IPP_VERSION.major).u8(IPP_VERSION.minor);
  w.u16(request.operation);
  w.u32(request.requestId);

  for (const group of request.groups) {
    w.u8(group.tag);
    for (const attr of group.attributes) {
      if (attr.values.length === 0) {
        continue;
      }
      const nameBytes = new ByteWriter(32).utf8(attr.name).toBytes();
      attr.values.forEach((value, index) => {
        const tag = inferTag(value, attr.tag);
        w.u8(tag);
        if (index === 0) {
          w.u16(nameBytes.length).bytes(nameBytes);
        } else {
          w.u16(0); // дополнительное значение того же атрибута
        }
        writeValue(w, tag, value);
      });
    }
  }

  w.u8(DelimiterTag.EndOfAttributes);
  if (request.data && request.data.length > 0) {
    w.bytes(request.data);
  }
  return w.toBytes();
}

/** Читает одно значение по его тегу. */
function readValue(r: ByteReader, tag: number): IppValue {
  const length = r.u16();
  switch (tag) {
    case ValueTag.Integer:
    case ValueTag.Enum: {
      // Некоторые прошивки шлют целые нестандартной длины — читаем терпимо.
      if (length !== 4) {
        const raw = r.bytes(length);
        let acc = 0;
        for (const b of raw) {
          acc = (acc << 8) | b;
        }
        return acc;
      }
      return r.i32();
    }
    case ValueTag.Boolean:
      return r.bytes(length)[0] === 1;
    case ValueTag.Resolution: {
      if (length !== 9) {
        r.skip(length);
        return {kind: 'resolution', x: 0, y: 0, units: ResolutionUnit.DotsPerInch};
      }
      return {kind: 'resolution', x: r.u32(), y: r.u32(), units: r.u8()};
    }
    case ValueTag.RangeOfInteger: {
      if (length !== 8) {
        r.skip(length);
        return {kind: 'range', lower: 0, upper: 0};
      }
      return {kind: 'range', lower: r.i32(), upper: r.i32()};
    }
    case ValueTag.Unsupported:
    case ValueTag.Unknown:
    case ValueTag.NoValue:
      r.skip(length);
      return {kind: 'no-value', tag: tag as ValueTagCode};
    case ValueTag.TextWithLanguage:
    case ValueTag.NameWithLanguage: {
      // Формат: длина языка + язык + длина текста + текст. Язык отбрасываем.
      const body = new ByteReader(r.bytes(length));
      const langLen = body.u16();
      body.skip(langLen);
      const textLen = body.u16();
      return body.utf8(textLen);
    }
    default:
      return r.utf8(length);
  }
}

/**
 * Читает коллекцию, начиная сразу после begCollection.
 * Возвращает собранную коллекцию; курсор остаётся после endCollection.
 */
function readCollection(r: ByteReader): IppCollection {
  const members: Record<string, IppValue[]> = {};
  let currentMember: string | null = null;

  for (;;) {
    if (r.eof) {
      break;
    }
    const tag = r.u8();
    if (tag === ValueTag.EndCollection) {
      r.u16(); // name-length, всегда 0
      r.u16(); // value-length, всегда 0
      break;
    }
    const nameLen = r.u16();
    if (nameLen > 0) {
      r.skip(nameLen); // внутри коллекции имён быть не должно
    }
    if (tag === ValueTag.MemberAttrName) {
      const len = r.u16();
      currentMember = r.utf8(len);
      if (!members[currentMember]) {
        members[currentMember] = [];
      }
      continue;
    }
    const value =
      tag === ValueTag.BegCollection
        ? (r.u16(), readCollection(r))
        : readValue(r, tag);
    if (currentMember) {
      (members[currentMember] ??= []).push(value);
    }
  }
  return {kind: 'collection', members};
}

/** Разбирает ответ принтера. Бросает исключение только на битых данных. */
export function decodeResponse(data: Uint8Array): IppResponse {
  const r = new ByteReader(data);
  const versionMajor = r.u8();
  const versionMinor = r.u8();
  const statusCode = r.u16();
  const requestId = r.u32();

  const groups: IppAttributeGroup[] = [];
  let group: {tag: number; attributes: Record<string, IppValue[]>} | null = null;
  let lastAttrName: string | null = null;

  for (;;) {
    if (r.eof) {
      break;
    }
    const tag = r.u8();

    if (tag === DelimiterTag.EndOfAttributes) {
      break;
    }
    // Диапазон 0x00–0x0f — теги-разделители: начинается новая группа.
    if (tag <= 0x0f) {
      if (group) {
        groups.push(group);
      }
      group = {tag, attributes: {}};
      lastAttrName = null;
      continue;
    }

    const nameLen = r.u16();
    // Аннотация обязательна: без неё вывод типа зацикливается на
    // присваивании lastAttrName ниже.
    const name: string | null = nameLen > 0 ? r.utf8(nameLen) : lastAttrName;
    const value =
      tag === ValueTag.BegCollection ? (r.u16(), readCollection(r)) : readValue(r, tag);

    if (group && name) {
      (group.attributes[name] ??= []).push(value);
      lastAttrName = name;
    }
  }

  if (group) {
    groups.push(group);
  }

  return {
    versionMajor,
    versionMinor,
    statusCode,
    requestId,
    groups,
    data: r.eof ? new Uint8Array(0) : r.bytes(r.remaining),
  };
}

/** Ищет атрибут во всех группах ответа; возвращает все его значения. */
export function findAttribute(response: IppResponse, name: string): IppValue[] {
  for (const group of response.groups) {
    const values = group.attributes[name];
    if (values) {
      return values;
    }
  }
  return [];
}

/** Первое значение атрибута как строка, либо undefined. */
export function attrString(response: IppResponse, name: string): string | undefined {
  const first = findAttribute(response, name)[0];
  return typeof first === 'string' ? first : undefined;
}

/** Первое значение атрибута как число, либо undefined. */
export function attrNumber(response: IppResponse, name: string): number | undefined {
  const first = findAttribute(response, name)[0];
  return typeof first === 'number' ? first : undefined;
}

/** Все строковые значения атрибута (нестроковые отбрасываются). */
export function attrStrings(response: IppResponse, name: string): string[] {
  return findAttribute(response, name).filter((v): v is string => typeof v === 'string');
}
