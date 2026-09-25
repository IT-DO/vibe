/**
 * Рукопожатие проверяется по настоящему сеансу печати.
 *
 * Секрет того сеанса удалось восстановить: модуль P, который выдаёт
 * прошивка, оказался составным и гладким (2² · 7³ · 83 · 179 · 270833 ·
 * 3009749), поэтому дискретный логарифм решается Похлигом — Хеллманом за
 * доли секунды. Благодаря этому тест не просто проверяет код сам на себе —
 * он требует совпадения с байтами, которые принтер реально принял.
 *
 * Побочный вывод, важный для приложения: ключ вырабатывается на лету,
 * никаких токенов и учётных записей Xiaomi не нужно.
 */

import {decryptEcb, encryptEcb} from '../aes';
import {
  KEY_SIZE,
  SERVER_HELLO_SIZE,
  buildConfirm,
  buildHello,
  computeConfirmation,
  hexAsciiToInt,
  intToHexAscii,
  modPow,
  padEnd,
  padFront,
  parseServerHello,
} from '../handshake';
import capture from './fixtures/capture.json';

const РУКОПОЖАТИЕ = capture.рукопожатие;

function hex(text: string): Uint8Array {
  const out = new Uint8Array(text.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(text.substr(i * 2, 2), 16);
  }
  return out;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

describe('числа передаются строкой шестнадцатеричных цифр', () => {
  it('байты читаются как текст, а текст — как число', () => {
    // 45 36 39 36 — это символы «E696», то есть число 0xE696.
    expect(hexAsciiToInt(new Uint8Array([0x45, 0x36, 0x39, 0x36]))).toBe(0xe696n);
  });

  it('хвостовые нули — дополнение, а не цифры', () => {
    expect(hexAsciiToInt(new Uint8Array([0x32, 0, 0, 0]))).toBe(2n);
  });

  it('обратное преобразование даёт заглавные буквы', () => {
    expect(new TextDecoder().decode(intToHexAscii(0xe696n))).toBe('E696');
  });

  it('туда и обратно без потерь', () => {
    for (const value of [1n, 2n, 0xffn, 0xdeadbeefn, 0xe6969d3d495be32cn]) {
      expect(hexAsciiToInt(intToHexAscii(value))).toBe(value);
    }
  });

  it('не хекс — отказ, а не молчаливый разбор', () => {
    expect(() => hexAsciiToInt(new Uint8Array([0x5a, 0x5a]))).toThrow(/шестнадцатеричн/);
  });
});

describe('выравнивание в 16 байтах', () => {
  it('половина ключа дополняется слева символом «0»', () => {
    const out = padFront(new Uint8Array([0x41, 0x42]));
    expect(out).toHaveLength(16);
    expect(new TextDecoder().decode(out)).toBe('00000000000000AB');
  });

  it('ключ дополняется справа нулевыми байтами', () => {
    const out = padEnd(new Uint8Array([0x41, 0x42]));
    expect(out).toHaveLength(16);
    expect(out[0]).toBe(0x41);
    expect(out[2]).toBe(0);
    expect(out[15]).toBe(0);
  });
});

describe('возведение в степень по модулю', () => {
  it('совпадает с прямым счётом на малых числах', () => {
    for (let e = 0; e < 20; e++) {
      expect(modPow(3n, BigInt(e), 1000n)).toBe(3n ** BigInt(e) % 1000n);
    }
  });

  it('тянет числа, на которых наивный счёт уже невозможен', () => {
    expect(modPow(2n, 4126797477100135n, 0xe6969d3d495be32cn)).toBe(0xd2660568571e69f4n);
  });
});

describe('«привет» настоящего принтера', () => {
  const hello = parseServerHello(hex(РУКОПОЖАТИЕ.привет_принтера.тело));

  it('разбирается на основание, модуль и половину принтера', () => {
    expect(hello.g).toBe(2n);
    expect(hello.p).toBe(BigInt('0x' + РУКОПОЖАТИЕ.привет_принтера.P));
    expect(hello.ra).toBe(BigInt('0x' + РУКОПОЖАТИЕ.привет_принтера.RA));
  });

  it('исходные байты модуля сохраняются — принтер ждёт их обратно', () => {
    expect(new TextDecoder().decode(hello.pBytes)).toBe(РУКОПОЖАТИЕ.привет_принтера.P);
  });

  it('короткий ответ отвергается, а не разбирается наугад', () => {
    expect(() => parseServerHello(new Uint8Array(SERVER_HELLO_SIZE - 1))).toThrow(/байт/);
  });
});

describe('подтверждение повторяет настоящий сеанс', () => {
  const hello = parseServerHello(hex(РУКОПОЖАТИЕ.привет_принтера.тело));
  const secret = BigInt(РУКОПОЖАТИЕ.восстановленный_секрет);
  const confirmation = computeConfirmation(hello, secret);

  it('наша половина ключа — та же, что ушла в принтер', () => {
    expect(new TextDecoder().decode(confirmation.body.subarray(0, 16))).toBe(
      РУКОПОЖАТИЕ.подтверждение_от_нас.RB,
    );
  });

  it('общий ключ — тот, которым был зашифрован весь сеанс', () => {
    expect(confirmation.key).toHaveLength(KEY_SIZE);
    expect(toHex(confirmation.key)).toBe(РУКОПОЖАТИЕ.ключ_сеанса);
    expect(new TextDecoder().decode(confirmation.key)).toBe(РУКОПОЖАТИЕ.общий_секрет);
  });

  it('проверочное значение совпадает байт в байт', () => {
    expect(toHex(confirmation.body.subarray(16))).toBe(
      РУКОПОЖАТИЕ.подтверждение_от_нас.проверочное_значение,
    );
  });

  it('весь кадр подтверждения повторяет перехваченный', () => {
    expect(toHex(buildConfirm(2, confirmation))).toBe(
      РУКОПОЖАТИЕ.подтверждение_от_нас.кадр,
    );
  });

  it('этим ключом расшифровывается первая настоящая команда', () => {
    const frame = hex(capture.команды.первый_кадр.кадр);
    const body = frame.slice(20, 20 + capture.команды.первый_кадр.длина_тела);
    const plain = decryptEcb(confirmation.key, body);
    const text = new TextDecoder().decode(plain).replace(/\0+$/, '');
    expect(text).toBe(capture.команды.первый_кадр.открытый_текст);
  });
});

describe('выработка ключа вообще', () => {
  const hello = parseServerHello(hex(РУКОПОЖАТИЕ.привет_принтера.тело));

  it('обе стороны приходят к одному ключу', () => {
    // Считаем за принтер: его секрет a, наш — b.
    const a = 123456789n;
    const b = 987654321n;
    const ra = modPow(hello.g, a, hello.p);
    const rb = modPow(hello.g, b, hello.p);
    expect(modPow(ra, b, hello.p)).toBe(modPow(rb, a, hello.p));
  });

  it('проверочное значение расшифровывается обратно в модуль', () => {
    const {body, key} = computeConfirmation(hello);
    const back = decryptEcb(key, body.slice(16));
    expect(new TextDecoder().decode(back)).toBe(РУКОПОЖАТИЕ.привет_принтера.P);
  });

  it('секрет каждый раз новый — ключ не зашит в приложение', () => {
    const first = computeConfirmation(hello);
    const second = computeConfirmation(hello);
    expect(first.secret).not.toBe(second.secret);
  });

  it('ключ всегда ровно 16 байт, даже когда секрет короткий', () => {
    for (let i = 0; i < 50; i++) {
      const {key} = computeConfirmation(hello);
      expect(key).toHaveLength(KEY_SIZE);
      // Ключ используется как есть — значит, должен шифровать без ошибок.
      expect(encryptEcb(key, hello.pBytes)).toHaveLength(16);
    }
  });
});

describe('первый кадр разговора', () => {
  it('совпадает с перехваченным', () => {
    expect(toHex(buildHello(1))).toBe(РУКОПОЖАТИЕ.привет_от_нас);
  });
});
