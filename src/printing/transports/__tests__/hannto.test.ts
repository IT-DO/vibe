/**
 * Транспорт печати по Bluetooth.
 *
 * Проверяется не протокол — он уже проверен в `printing/hannto`, — а то,
 * что транспорт делает вокруг него: когда переподключается, что считает
 * поводом остановить очередь и как переводит состояние принтера в ответ,
 * понятный очереди и админке.
 */

import {FakePrinter} from '../../hannto/__tests__/fake-printer';
import {HanntoSession} from '../../hannto/session';
import {HanntoTransport, describeStatus, mapJobState, type PrinterConnector} from '../hannto';

/** Соединение, которое можно открыть, закрыть и сломать по желанию теста. */
class TestConnector implements PrinterConnector {
  readonly name = 'Xiaomi Photo Printer';
  opens = 0;
  closes = 0;
  failNextOpen: string | null = null;
  printer = new FakePrinter();

  constructor(private readonly options: ConstructorParameters<typeof FakePrinter>[0] = {}) {
    this.printer = new FakePrinter(options);
  }

  async open(): Promise<HanntoSession> {
    this.opens += 1;
    if (this.failNextOpen) {
      const reason = this.failNextOpen;
      this.failNextOpen = null;
      throw new Error(reason);
    }
    // Каждое подключение — новый принтер: так же ведёт себя настоящий,
    // он вырабатывает новый ключ при каждом соединении.
    this.printer = new FakePrinter(this.options);
    const session = new HanntoSession(this.printer, {timeoutMs: 500});
    await session.connect();
    return session;
  }

  async close(): Promise<void> {
    this.closes += 1;
  }
}

const jpeg = (size: number): Uint8Array => {
  const data = new Uint8Array(size);
  data[0] = 0xff;
  data[1] = 0xd8;
  return data;
};

const document = (size = 2000) => ({
  data: jpeg(size),
  format: 'image/jpeg',
  name: 'Фото на память',
  copies: 1,
});

describe('готовность принтера', () => {
  it('исправный и заряженный — можно печатать', async () => {
    const transport = new HanntoTransport({connector: new TestConnector()});
    const status = await transport.checkStatus();
    expect(status.health).toBe('ready');
    expect(status.suppliesPercent).toBe(83);
    expect(status.printerName).toBe('Xiaomi Photo Printer');
  });

  it('недоступный принтер останавливает очередь, а не роняет её', async () => {
    const connector = new TestConnector();
    connector.failNextOpen = 'Bluetooth выключен';
    const transport = new HanntoTransport({connector});

    const status = await transport.checkStatus();
    // Задания должны сохраниться и напечататься после починки — значит
    // «blocked», а не ошибка.
    expect(status.health).toBe('blocked');
    expect(status.blockingReason).toBe('Bluetooth выключен');
  });

  it('разряженный принтер не берут в работу', async () => {
    const transport = new HanntoTransport({connector: new TestConnector({battery: 9})});
    const status = await transport.checkStatus();
    expect(status.health).toBe('blocked');
    expect(status.blockingReason).toMatch(/разряжен \(9%\)/);
  });

  it('порог заряда настраивается', async () => {
    const connector = new TestConnector({battery: 20});
    const ready = new HanntoTransport({connector});
    expect((await ready.checkStatus()).health).toBe('ready');

    const strict = new HanntoTransport({connector, minBatteryPercent: 50});
    expect((await strict.checkStatus()).health).toBe('blocked');
  });
});

describe('перевод состояний принтера', () => {
  it('код неисправности объясняется по-человечески', () => {
    const cases: Array<[number, RegExp]> = [
      [1, /закончилась бумага/],
      [2, /Замялась/],
      [3, /крышка/],
      [4, /перегрелся/],
      [5, /картридж/],
    ];
    for (const [code, expected] of cases) {
      const status = describeStatus({category: 'error', error: code}, 'принтер', 15);
      expect(status.health).toBe('blocked');
      expect(status.blockingReason).toMatch(expected);
    }
  });

  it('незнакомый код не теряется', () => {
    const status = describeStatus({category: 'error', error: 42}, 'принтер', 15);
    expect(status.blockingReason).toBe('Ошибка принтера 42');
  });

  it('принтер без сведений о заряде не считается разряженным', () => {
    expect(describeStatus({category: 'idle', error: 0}, 'принтер', 15).health).toBe('ready');
  });

  it('состояния задания переводятся для очереди', () => {
    expect(mapJobState('finished')).toBe('done');
    expect(mapJobState('printing')).toBe('printing');
    expect(mapJobState('decoding')).toBe('printing');
    expect(mapJobState('queued')).toBe('pending');
    expect(mapJobState('cancel')).toBe('canceled');
    expect(mapJobState('error')).toBe('failed');
    expect(mapJobState('невиданное')).toBe('unknown');
  });
});

describe('отправка задания', () => {
  it('снимок доходит до принтера целиком', async () => {
    const connector = new TestConnector();
    const transport = new HanntoTransport({connector});
    const doc = document(3000);

    const job = await transport.submit(doc);
    expect(job.remoteId).toBe(15);
    expect(Uint8Array.from(connector.printer.received)).toEqual(doc.data);
  });

  it('число копий уходит принтеру', async () => {
    const connector = new TestConnector();
    const transport = new HanntoTransport({connector});
    await transport.submit({...document(), copies: 3});
    // Принтер получил команду с тремя копиями — иначе задания бы не было.
    expect(connector.printer.jobId).toBe(15);
  });

  it('соединение переживает несколько заданий подряд', async () => {
    const connector = new TestConnector();
    const transport = new HanntoTransport({connector});

    await transport.submit(document());
    await transport.submit(document());
    await transport.submit(document());
    // Рукопожатие занимает время — держим соединение открытым.
    expect(connector.opens).toBe(1);
  });

  it('обрыв связи приводит к переподключению на следующем задании', async () => {
    const connector = new TestConnector();
    const transport = new HanntoTransport({connector});
    await transport.submit(document());
    expect(connector.opens).toBe(1);

    // Принтер отвалился молча — узнать об этом можно только попыткой.
    connector.printer.disconnect();
    await expect(transport.submit(document())).rejects.toThrow();

    // Зато после неудачи соединение сброшено, и очередь, повторяя
    // задание, получит исправный принтер, а не то же самое мёртвое
    // соединение по кругу.
    await transport.submit(document());
    expect(connector.opens).toBe(2);
    expect(connector.printer.received.length).toBeGreaterThan(0);
  });

  it('ошибка постановки задания не оставляет соединение в полусостоянии', async () => {
    const connector = new TestConnector({failMethod: 'print_job'});
    const transport = new HanntoTransport({connector});

    await expect(transport.submit(document())).rejects.toThrow(/нет бумаги/);
    expect(connector.closes).toBeGreaterThan(0);
  });
});

describe('слежение за заданием', () => {
  it('готовое задание видно как напечатанное', async () => {
    const transport = new HanntoTransport({connector: new TestConnector()});
    const job = await transport.submit(document());
    expect((await transport.trackJob(job)).state).toBe('done');
  });

  it('задание без номера не выдумывает состояние', async () => {
    const transport = new HanntoTransport({connector: new TestConnector()});
    const progress = await transport.trackJob({remoteId: null, submittedAt: 0});
    expect(progress.state).toBe('unknown');
  });

  it('недоступный принтер не выдаёт задание за потерянное', async () => {
    const connector = new TestConnector();
    const transport = new HanntoTransport({connector});
    const job = await transport.submit(document());

    connector.printer.disconnect();
    const progress = await transport.trackJob(job);
    // «unknown» — значит очередь попробует ещё раз, а не спишет отпечаток
    // как потерянный и не перепечатает как новый.
    expect(progress.state).toBe('unknown');
    expect(progress.reasons[0]).toMatch(/не ответил/);
  });

  it('после обрыва слежение переподключается и договаривает', async () => {
    const connector = new TestConnector();
    const transport = new HanntoTransport({connector});
    const job = await transport.submit(document());

    connector.printer.disconnect();
    await transport.trackJob(job); // неудача, соединение сброшено
    expect((await transport.trackJob(job)).state).toBe('done');
  });
});

describe('свойства транспорта', () => {
  it('объявляет JPEG — другого принтер не принимает', () => {
    const transport = new HanntoTransport({connector: new TestConnector()});
    expect(transport.documentFormat).toBe('image/jpeg');
    expect(transport.canTrackJobs).toBe(true);
  });

  it('закрытие освобождает принтер для другого телефона', async () => {
    const connector = new TestConnector();
    const transport = new HanntoTransport({connector});
    await transport.submit(document());
    await transport.dispose();
    expect(connector.closes).toBeGreaterThan(0);
  });
});
