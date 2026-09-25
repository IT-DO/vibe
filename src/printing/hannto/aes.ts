/**
 * AES-128 в режиме ECB — ровно столько, сколько нужно принтеру.
 *
 * Своя реализация, а не библиотека, по трём причинам. Нативные крипто-модули
 * для React Native тянут за собой сборку C++ и ломаются при обновлении
 * платформы. Готовые JS-библиотеки несут режимы и дополнения, которые здесь
 * не нужны и только увеличивают приложение. А главное — шифрование стоит на
 * пути отпечатка: ошибка в нём означает испорченный лист на мероприятии,
 * поэтому код должен быть виден целиком и проверяться тестами на векторах
 * из стандарта.
 *
 * ECB без сцепления блоков выбран не нами — так устроен принтер. Для
 * изображения это некритично: лист всё равно уходит по радиоканалу целиком.
 */

const SBOX = buildSbox();
const RCON = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];

/** Таблица замен строится из мультипликативного обратного в GF(2^8). */
function buildSbox(): Uint8Array {
  const sbox = new Uint8Array(256);
  let p = 1;
  let q = 1;
  do {
    // p умножается на 3, q делится на 3 — так обходятся все ненулевые элементы.
    p = p ^ ((p << 1) & 0xff) ^ (p & 0x80 ? 0x1b : 0);
    q ^= q << 1;
    q ^= q << 2;
    q ^= q << 4;
    q &= 0xff;
    if (q & 0x80) {
      q ^= 0x09;
    }
    const value = q ^ rotl8(q, 1) ^ rotl8(q, 2) ^ rotl8(q, 3) ^ rotl8(q, 4);
    sbox[p] = (value ^ 0x63) & 0xff;
  } while (p !== 1);
  sbox[0] = 0x63;
  return sbox;
}

function rotl8(value: number, shift: number): number {
  return ((value << shift) | (value >> (8 - shift))) & 0xff;
}

/** Умножение в поле Галуа GF(2^8) — основа перемешивания столбцов. */
function gmul(a: number, b: number): number {
  let result = 0;
  let x = a;
  let y = b;
  for (let i = 0; i < 8; i++) {
    if (y & 1) {
      result ^= x;
    }
    const high = x & 0x80;
    x = (x << 1) & 0xff;
    if (high) {
      x ^= 0x1b;
    }
    y >>= 1;
  }
  return result;
}

/** Разворачивает 16-байтный ключ в 11 раундовых ключей. */
function expandKey(key: Uint8Array): Uint8Array {
  if (key.length !== 16) {
    throw new Error(`Ключ AES-128 должен быть 16 байт, получено ${key.length}`);
  }
  const expanded = new Uint8Array(176);
  expanded.set(key);

  for (let i = 16; i < 176; i += 4) {
    let a = expanded[i - 4]!;
    let b = expanded[i - 3]!;
    let c = expanded[i - 2]!;
    let d = expanded[i - 1]!;

    if (i % 16 === 0) {
      // Сдвиг слова, замена по таблице и добавление раундовой константы.
      [a, b, c, d] = [
        SBOX[b]! ^ RCON[i / 16 - 1]!,
        SBOX[c]!,
        SBOX[d]!,
        SBOX[a]!,
      ];
    }

    expanded[i] = expanded[i - 16]! ^ a;
    expanded[i + 1] = expanded[i - 15]! ^ b;
    expanded[i + 2] = expanded[i - 14]! ^ c;
    expanded[i + 3] = expanded[i - 13]! ^ d;
  }
  return expanded;
}

/** Шифрует один блок из 16 байт на месте. */
function encryptBlock(state: Uint8Array, roundKeys: Uint8Array): void {
  addRoundKey(state, roundKeys, 0);

  for (let round = 1; round <= 10; round++) {
    for (let i = 0; i < 16; i++) {
      state[i] = SBOX[state[i]!]!;
    }
    shiftRows(state);
    if (round !== 10) {
      mixColumns(state);
    }
    addRoundKey(state, roundKeys, round);
  }
}

function addRoundKey(state: Uint8Array, roundKeys: Uint8Array, round: number): void {
  const offset = round * 16;
  for (let i = 0; i < 16; i++) {
    state[i] = state[i]! ^ roundKeys[offset + i]!;
  }
}

/** Строки состояния сдвигаются влево на номер строки. */
function shiftRows(s: Uint8Array): void {
  let t = s[1]!;
  s[1] = s[5]!;
  s[5] = s[9]!;
  s[9] = s[13]!;
  s[13] = t;

  t = s[2]!;
  s[2] = s[10]!;
  s[10] = t;
  t = s[6]!;
  s[6] = s[14]!;
  s[14] = t;

  t = s[15]!;
  s[15] = s[11]!;
  s[11] = s[7]!;
  s[7] = s[3]!;
  s[3] = t;
}

function mixColumns(s: Uint8Array): void {
  for (let c = 0; c < 4; c++) {
    const i = c * 4;
    const a0 = s[i]!;
    const a1 = s[i + 1]!;
    const a2 = s[i + 2]!;
    const a3 = s[i + 3]!;
    s[i] = gmul(a0, 2) ^ gmul(a1, 3) ^ a2 ^ a3;
    s[i + 1] = a0 ^ gmul(a1, 2) ^ gmul(a2, 3) ^ a3;
    s[i + 2] = a0 ^ a1 ^ gmul(a2, 2) ^ gmul(a3, 3);
    s[i + 3] = gmul(a0, 3) ^ a1 ^ a2 ^ gmul(a3, 2);
  }
}

/**
 * Шифрует данные в режиме ECB, дополняя нулями до кратности блоку.
 *
 * Дополнение именно нулями, а не по PKCS#7: так делает прошивка принтера, и
 * любое другое дополнение он отвергнет.
 */
export function encryptEcb(key: Uint8Array, data: Uint8Array): Uint8Array {
  const roundKeys = expandKey(key);
  const padded = (16 - (data.length % 16)) % 16;
  const out = new Uint8Array(data.length + padded);
  out.set(data);

  const block = new Uint8Array(16);
  for (let offset = 0; offset < out.length; offset += 16) {
    block.set(out.subarray(offset, offset + 16));
    encryptBlock(block, roundKeys);
    out.set(block, offset);
  }
  return out;
}

/** Расшифровывает данные в режиме ECB. */
export function decryptEcb(key: Uint8Array, data: Uint8Array): Uint8Array {
  if (data.length % 16 !== 0) {
    throw new Error(`Длина шифротекста должна быть кратна 16, получено ${data.length}`);
  }
  const roundKeys = expandKey(key);
  const out = new Uint8Array(data.length);
  const block = new Uint8Array(16);
  for (let offset = 0; offset < data.length; offset += 16) {
    block.set(data.subarray(offset, offset + 16));
    decryptBlock(block, roundKeys);
    out.set(block, offset);
  }
  return out;
}

const INV_SBOX = buildInverseSbox();

function buildInverseSbox(): Uint8Array {
  const inverse = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    inverse[SBOX[i]!] = i;
  }
  return inverse;
}

function decryptBlock(state: Uint8Array, roundKeys: Uint8Array): void {
  addRoundKey(state, roundKeys, 10);
  for (let round = 9; round >= 0; round--) {
    invShiftRows(state);
    for (let i = 0; i < 16; i++) {
      state[i] = INV_SBOX[state[i]!]!;
    }
    addRoundKey(state, roundKeys, round);
    if (round !== 0) {
      invMixColumns(state);
    }
  }
}

function invShiftRows(s: Uint8Array): void {
  let t = s[13]!;
  s[13] = s[9]!;
  s[9] = s[5]!;
  s[5] = s[1]!;
  s[1] = t;

  t = s[2]!;
  s[2] = s[10]!;
  s[10] = t;
  t = s[6]!;
  s[6] = s[14]!;
  s[14] = t;

  t = s[3]!;
  s[3] = s[7]!;
  s[7] = s[11]!;
  s[11] = s[15]!;
  s[15] = t;
}

function invMixColumns(s: Uint8Array): void {
  for (let c = 0; c < 4; c++) {
    const i = c * 4;
    const a0 = s[i]!;
    const a1 = s[i + 1]!;
    const a2 = s[i + 2]!;
    const a3 = s[i + 3]!;
    s[i] = gmul(a0, 14) ^ gmul(a1, 11) ^ gmul(a2, 13) ^ gmul(a3, 9);
    s[i + 1] = gmul(a0, 9) ^ gmul(a1, 14) ^ gmul(a2, 11) ^ gmul(a3, 13);
    s[i + 2] = gmul(a0, 13) ^ gmul(a1, 9) ^ gmul(a2, 14) ^ gmul(a3, 11);
    s[i + 3] = gmul(a0, 11) ^ gmul(a1, 13) ^ gmul(a2, 9) ^ gmul(a3, 14);
  }
}
