/**
 * AES-128-ECB проверяется официальными векторами из FIPS-197 и NIST SP 800-38A.
 *
 * Своя реализация шифра стоит прямо на пути отпечатка: ошибка в ней — это
 * испорченный лист на мероприятии и непонятный отказ принтера. Поэтому
 * сверяемся не «сам с собой», а с эталонными значениями стандарта.
 */

import {decryptEcb, encryptEcb} from '../aes';

const hex = (s: string) => Uint8Array.from(Buffer.from(s.replace(/\s/g, ''), 'hex'));
const toHex = (b: Uint8Array) => Buffer.from(b).toString('hex');

describe('вектор из FIPS-197 (приложение B)', () => {
  const key = hex('000102030405060708090a0b0c0d0e0f');
  const plain = hex('00112233445566778899aabbccddeeff');
  const cipher = '69c4e0d86a7b0430d8cdb78070b4c55a';

  it('шифрует', () => {
    expect(toHex(encryptEcb(key, plain))).toBe(cipher);
  });

  it('расшифровывает обратно', () => {
    expect(toHex(decryptEcb(key, hex(cipher)))).toBe(toHex(plain));
  });
});

describe('векторы NIST SP 800-38A для AES-128-ECB', () => {
  const key = hex('2b7e151628aed2a6abf7158809cf4f3c');
  const cases: [string, string][] = [
    ['6bc1bee22e409f96e93d7e117393172a', '3ad77bb40d7a3660a89ecaf32466ef97'],
    ['ae2d8a571e03ac9c9eb76fac45af8e51', 'f5d3d58503b9699de785895a96fdbaaf'],
    ['30c81c46a35ce411e5fbc1191a0a52ef', '43b1cd7f598ece23881b00e3ed030688'],
    ['f69f2445df4f9b17ad2b417be66c3710', '7b0c785e27e8ad3f8223207104725dd4'],
  ];

  it.each(cases)('блок %s', (plain, cipher) => {
    expect(toHex(encryptEcb(key, hex(plain)))).toBe(cipher);
    expect(toHex(decryptEcb(key, hex(cipher)))).toBe(plain);
  });

  it('все четыре блока разом дают ту же цепочку', () => {
    const plain = hex(cases.map(c => c[0]).join(''));
    const cipher = cases.map(c => c[1]).join('');
    expect(toHex(encryptEcb(key, plain))).toBe(cipher);
  });
});

describe('дополнение нулями', () => {
  it('короткие данные дополняются до блока', () => {
    const key = hex('000102030405060708090a0b0c0d0e0f');
    const out = encryptEcb(key, hex('0011'));
    expect(out.length).toBe(16);
    // Дополнение именно нулями: принтер другого не принимает.
    const back = decryptEcb(key, out);
    expect(toHex(back)).toBe('0011' + '00'.repeat(14));
  });

  it('данные кратной длины не удлиняются', () => {
    const key = hex('000102030405060708090a0b0c0d0e0f');
    expect(encryptEcb(key, new Uint8Array(32)).length).toBe(32);
  });

  it('пустые данные дают пустой результат', () => {
    const key = hex('000102030405060708090a0b0c0d0e0f');
    expect(encryptEcb(key, new Uint8Array(0)).length).toBe(0);
  });

  it('994 байта — размер тела файлового кадра — дополняются до 1008', () => {
    const key = hex('000102030405060708090a0b0c0d0e0f');
    expect(encryptEcb(key, new Uint8Array(994)).length).toBe(1008);
  });
});

describe('режим ECB виден по одинаковым блокам', () => {
  it('одинаковые блоки дают одинаковый шифротекст', () => {
    // Это свойство ECB, по которому протокол принтера и был опознан в дампе.
    const key = hex('2b7e151628aed2a6abf7158809cf4f3c');
    const block = hex('6bc1bee22e409f96e93d7e117393172a');
    const doubled = new Uint8Array(32);
    doubled.set(block);
    doubled.set(block, 16);
    const out = encryptEcb(key, doubled);
    expect(toHex(out.subarray(0, 16))).toBe(toHex(out.subarray(16)));
  });
});

describe('отказы', () => {
  it('ключ не того размера отвергается', () => {
    expect(() => encryptEcb(new Uint8Array(8), new Uint8Array(16))).toThrow(/16 байт/);
  });

  it('шифротекст некратной длины отвергается', () => {
    const key = hex('000102030405060708090a0b0c0d0e0f');
    expect(() => decryptEcb(key, new Uint8Array(17))).toThrow(/кратна 16/);
  });
});
