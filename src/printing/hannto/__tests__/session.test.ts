/**
 * Разговор с принтером целиком: от рукопожатия до готового отпечатка.
 *
 * Собеседник — `FakePrinter`, который отвечает теми же кадрами, что снятые
 * с настоящего устройства. Поэтому тесты проверяют не «код сам себя», а
 * поведение против воспроизведённой прошивки: чужой счётчик сообщений,
 * многочастные ответы, незапрошенные события, обрывы связи.
 */

import {CHUNK_DATA, HanntoError, HanntoSession} from '../session';
import {FakePrinter} from './fake-printer';
import capture from './fixtures/capture.json';

async function connected(printer: FakePrinter, timeoutMs = 1000) {
  const session = new HanntoSession(printer, {timeoutMs});
  await session.connect();
  return session;
}

describe('рукопожатие', () => {
  it('приводит к общему ключу с принтером', async () => {
    const printer = new FakePrinter();
    const session = await connected(printer);
    expect(session.ready).toBe(true);
    expect(printer.key).not.toBeNull();
  });

  it('до рукопожатия команды не отправляются', async () => {
    const session = new HanntoSession(new FakePrinter());
    await expect(session.status()).rejects.toThrow(/рукопожатие/);
  });

  it('отказ принтера виден как ошибка, а не как успех', async () => {
    const session = new HanntoSession(new FakePrinter({rejectHandshake: true}), {
      timeoutMs: 500,
    });
    await expect(session.connect()).rejects.toThrow(/отверг рукопожатие/);
    expect(session.ready).toBe(false);
  });

  it('молчание принтера кончается ошибкой, а не зависанием', async () => {
    const mute = {write: async () => {}, subscribe: () => () => {}};
    const session = new HanntoSession(mute, {timeoutMs: 50});
    await expect(session.connect()).rejects.toThrow(/не ответил на рукопожатие/);
  });
});

describe('команды', () => {
  it('device_info отдаёт модель и прошивку', async () => {
    const session = await connected(new FakePrinter());
    const info = await session.deviceInfo();
    expect(info.sku).toBe('BHR9974GL');
    expect(info.fw_ver).toBe('2.1.2_0015');
  });

  it('состояние приносит заряд и остаток до чистки', async () => {
    const session = await connected(new FakePrinter({battery: 42, cleanRemain: 3}));
    const status = await session.status();
    expect(status.category).toBe('idle');
    expect(status['battery-level']).toBe(42);
    expect(status.clean_remain).toBe(3);
    expect(status.error).toBe(0);
  });

  it('ответ, разрезанный принтером на части, собирается обратно', async () => {
    // Длинный device_info настоящего принтера — 256 байт, режем по 64.
    const session = await connected(new FakePrinter({splitAt: 64}));
    const info = await session.deviceInfo();
    expect(info.sku).toBe('BHR9974GL');
    expect(info.did).toBe('4000430552');
  });

  it('части, пришедшие не по порядку, собираются правильно', async () => {
    // Разрежённый массив — ловушка: `every` пропускает дыры, и ответ, у
    // которого последняя часть пришла раньше первой, собрался бы из
    // пустоты, а не остался бы ждать недостающих.
    const printer = new FakePrinter({splitAt: 32, reverseParts: true});
    const session = await connected(printer);
    const info = await session.deviceInfo();
    expect(info.sku).toBe('BHR9974GL');
    expect(info.did).toBe('4000430552');
  });

  it('ошибку принтера не выдаём за результат', async () => {
    const session = await connected(new FakePrinter({failMethod: 'print_job'}));
    await expect(session.createJob(1000)).rejects.toThrow(/нет бумаги/);
  });

  it('неизвестный метод тоже кончается ошибкой', async () => {
    const session = await connected(new FakePrinter());
    await expect(session.call('нет_такого', {})).rejects.toThrow(/ошибку/);
  });

  it('молчание на команду кончается таймаутом', async () => {
    const printer = new FakePrinter();
    const session = await connected(printer, 60);
    printer.disconnect(); // рукопожатие прошло, дальше принтер молчит
    await expect(session.status()).rejects.toThrow(/не ответил.*60 мс/);
  });

  it('незапрошенное событие не сбивает разбор ответов', async () => {
    const printer = new FakePrinter();
    const session = await connected(printer);
    printer.sendEvent();
    // Событие без `id` должно быть пропущено, а следующий ответ — дойти.
    await expect(session.status()).resolves.toHaveProperty('category', 'idle');
  });

  it('неотправленная команда не оставляет висящего обещания', async () => {
    // Если запись в канал упала, ответа не будет никогда. Ожидание должно
    // сняться сразу, а не отклониться через таймаут — к тому моменту его
    // уже никто не ждёт, и React Native покажет необработанный отказ.
    const printer = new FakePrinter();
    const session = await connected(printer, 60_000);
    jest.spyOn(printer, 'write').mockImplementation(async () => {
      throw new Error('канал оборван');
    });

    await expect(session.status()).rejects.toThrow('канал оборван');
    // Ждём заведомо дольше, чем жило бы висящее обещание, будь оно живо.
    await new Promise(resolve => setTimeout(resolve, 20));
  });

  it('обрыв связи отклоняет всё, что ждало ответа', async () => {
    const printer = new FakePrinter({silent: true});
    const session = await connected(printer, 5000);
    const waiting = session.status();
    session.close();
    await expect(waiting).rejects.toThrow(/прервана/);
  });
});

describe('передача снимка', () => {
  /** Файл в 2,5 куска — проверяем и деление, и неполный хвост. */
  const file = new Uint8Array(CHUNK_DATA * 2 + 100);
  for (let i = 0; i < file.length; i++) {
    file[i] = (i * 31 + 7) & 0xff;
  }

  it('приходит к принтеру байт в байт', async () => {
    const printer = new FakePrinter();
    const session = await connected(printer);
    const jobId = await session.createJob(file.length);
    await session.sendFile(file, jobId);
    expect(printer.received).toHaveLength(file.length);
    expect(Uint8Array.from(printer.received)).toEqual(file);
  });

  it('делится на куски по 988 байт, как в настоящей печати', async () => {
    const printer = new FakePrinter();
    const session = await connected(printer);
    const jobId = await session.createJob(file.length);

    const before = printer.frameCount;
    await session.sendFile(file, jobId);
    expect(printer.frameCount - before).toBe(3);
  });

  it('кадры уезжают пачками — меньше переходов через мост', async () => {
    // 227 кадров настоящей печати одиночными записями — это 227 переходов
    // в нативный модуль; по три за раз их втрое меньше.
    const big = new Uint8Array(CHUNK_DATA * 7);
    const printer = new FakePrinter();
    const session = await connected(printer);
    const jobId = await session.createJob(big.length);

    const before = printer.written.length;
    await session.sendFile(big, jobId);
    const writes = printer.written.length - before;
    expect(writes).toBe(3); // 7 кадров = 3 + 3 + 1
    expect(Uint8Array.from(printer.received)).toEqual(big);
  });

  it('размер куска совпадает с перехваченным', () => {
    expect(CHUNK_DATA + 4).toBe(capture.файл.длина_тела);
    expect(Math.ceil(capture.файл.размер_файла / CHUNK_DATA)).toBe(
      capture.файл.всего_частей,
    );
  });

  it('сообщает о продвижении — экрану есть что показать', async () => {
    const printer = new FakePrinter();
    const session = await connected(printer);
    const jobId = await session.createJob(file.length);

    const progress: number[] = [];
    await session.sendFile(file, jobId, sent => progress.push(sent));
    expect(progress).toEqual([CHUNK_DATA, CHUNK_DATA * 2, file.length]);
  });

  it('каждый кусок помечен номером задания', async () => {
    const printer = new FakePrinter();
    const session = await connected(printer);
    const jobId = await session.createJob(file.length);
    // Поддельный принтер сам бросит, если номер в куске не тот.
    await expect(session.sendFile(file, jobId)).resolves.toBeUndefined();
    await expect(session.sendFile(file, jobId + 1)).rejects.toThrow(/помечен заданием/);
  });

  it('пустой файл отвергается до отправки', async () => {
    const session = await connected(new FakePrinter());
    await expect(session.sendFile(new Uint8Array(0), 1)).rejects.toThrow(/пуст/);
  });
});

describe('печать целиком', () => {
  it('проходит тот же путь, что и настоящая', async () => {
    const printer = new FakePrinter({states: ['idle', 'processing', 'processing', 'idle']});
    const session = await connected(printer);

    expect((await session.deviceInfo()).sku).toBe('BHR9974GL');
    expect((await session.status()).category).toBe('idle');

    const file = new Uint8Array(CHUNK_DATA * 3);
    const jobId = await session.createJob(file.length);
    expect(jobId).toBe(15); // тот же номер, что в перехвате

    await session.sendFile(file, jobId);
    while ((await session.status()).category !== 'idle') {
      // ждём, пока принтер отработает
    }

    const info = await session.jobInfo(jobId);
    expect(info.job_state).toBe('finished');
    expect(info.job_id).toBe(jobId);
  });

  it('номер задания у каждой печати свой', async () => {
    const session = await connected(new FakePrinter());
    const first = await session.createJob(100);
    const second = await session.createJob(100);
    expect(second).not.toBe(first);
  });
});

describe('устойчивость разбора', () => {
  it('кадр, пришедший по кускам, собирается', async () => {
    const printer = new FakePrinter();
    const session = new HanntoSession(
      {
        write: data => printer.write(data),
        subscribe: listener =>
          printer.subscribe(frame => {
            // Рвём поток пополам — так и ведёт себя Bluetooth.
            listener(frame.subarray(0, 3));
            listener(frame.subarray(3));
          }),
      },
      {timeoutMs: 1000},
    );
    await session.connect();
    expect((await session.status()).category).toBe('idle');
  });

  it('мусор в потоке не ломает разбор', async () => {
    const printer = new FakePrinter();
    const session = new HanntoSession(
      {
        write: data => printer.write(data),
        subscribe: listener =>
          printer.subscribe(frame => {
            listener(new Uint8Array([0x00, 0xff, 0x7e]));
            listener(frame);
          }),
      },
      {timeoutMs: 1000},
    );
    await session.connect();
    expect((await session.status()).category).toBe('idle');
  });

  it('ошибка HanntoError отличима от прочих', async () => {
    const session = new HanntoSession(new FakePrinter());
    await expect(session.status()).rejects.toBeInstanceOf(HanntoError);
  });
});
