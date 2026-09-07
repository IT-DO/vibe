import {FakeConnector, type Responder} from '../../ipp/__tests__/fake-socket';
import {
  attr,
  extraValue,
  httpWrap,
  int32,
  message,
  resolution,
  responseHeader,
  text,
} from '../../ipp/__tests__/fixtures';
import {MEDIA_3X3, MEDIA_4X6} from '../../ipp/client';
import {DelimiterTag, JobState, StatusCode, ValueTag} from '../../ipp/constants';
import {attrString, decodeResponse, findAttribute} from '../../ipp/message';
import {parseCapabilities} from '../../ipp/capabilities';
import {IppTransport, MockTransport, SystemPrintTransport, mapJobState} from '..';

const endpoint = {host: '192.168.223.1', port: 631, path: '/ipp/print'};

const capabilitiesResponse = (requestId: number, formats: string[] = ['image/jpeg']) =>
  httpWrap(
    message(
      responseHeader(StatusCode.SuccessfulOk, requestId),
      new Uint8Array([DelimiterTag.PrinterAttributes]),
      attr(
        ValueTag.TextWithoutLanguage,
        'printer-make-and-model',
        text('Xiaomi Instant Photo Printer 1S'),
      ),
      attr(ValueTag.Enum, 'printer-state', int32(3)),
      attr(ValueTag.Keyword, 'printer-state-reasons', text('none')),
      attr(ValueTag.MimeMediaType, 'document-format-supported', text(formats[0]!)),
      ...formats.slice(1).map(f => extraValue(ValueTag.MimeMediaType, text(f))),
      attr(ValueTag.Keyword, 'media-supported', text('na_index-4x6_4x6in')),
      extraValue(ValueTag.Keyword, text('om_photo-3x3_76.2x76.2mm')),
      attr(ValueTag.Keyword, 'media-default', text('na_index-4x6_4x6in')),
      attr(ValueTag.Resolution, 'printer-resolution-supported', resolution(300, 300)),
      attr(ValueTag.Keyword, 'print-color-mode-supported', text('color')),
      attr(ValueTag.NameWithoutLanguage, 'marker-names', text('Ribbon')),
      attr(ValueTag.Integer, 'marker-levels', int32(37)),
      new Uint8Array([DelimiterTag.EndOfAttributes]),
    ),
  );

function makeTransport(responder: Responder, targetMedia = MEDIA_4X6) {
  const connector = new FakeConnector(responder);
  // Возможности принтера берём из того же эталонного ответа: транспорт
  // получает их при подключении и дальше опирается на кеш.
  const raw = capabilitiesResponse(1);
  const capabilities = parseCapabilities(decodeResponse(raw.subarray(indexOfBody(raw))));
  return {
    connector,
    transport: new IppTransport({endpoint, connector, capabilities, targetMedia}),
  };
}

function indexOfBody(raw: Uint8Array): number {
  for (let i = 0; i + 3 < raw.length; i++) {
    if (raw[i] === 13 && raw[i + 1] === 10 && raw[i + 2] === 13 && raw[i + 3] === 10) {
      return i + 4;
    }
  }
  throw new Error('Тело HTTP не найдено');
}

describe('IppTransport', () => {
  it('согласует формат, носитель и разрешение с принтером', async () => {
    const {transport} = makeTransport(() => httpWrap(new Uint8Array(0), 200));
    expect(transport.documentFormat).toBe('image/jpeg');
    expect(transport.mediaName).toBe('na_index-4x6_4x6in');
    expect(transport.resolution).toMatchObject({x: 300, y: 300});
    expect(transport.label).toBe('Xiaomi Instant Photo Printer 1S');
  });

  it('выбирает квадратный носитель, если печатаем 3x3', async () => {
    const {transport} = makeTransport(
      () => httpWrap(new Uint8Array(0), 200),
      MEDIA_3X3,
    );
    expect(transport.mediaName).toBe('om_photo-3x3_76.2x76.2mm');
  });

  it('отправляет задание с печатью в край', async () => {
    let body: Uint8Array | undefined;
    const {transport} = makeTransport(request => {
      body = request.body;
      return httpWrap(
        message(
          responseHeader(StatusCode.SuccessfulOk, decodeResponse(request.body).requestId),
          new Uint8Array([DelimiterTag.JobAttributes]),
          attr(ValueTag.Integer, 'job-id', int32(9)),
          new Uint8Array([DelimiterTag.EndOfAttributes]),
        ),
      );
    });

    const job = await transport.submit({
      data: new Uint8Array([0xff, 0xd8]),
      format: 'image/jpeg',
      name: 'Гость №4',
      copies: 1,
    });

    expect(job.remoteId).toBe(9);
    const decoded = decodeResponse(body!);
    expect(attrString(decoded, 'print-scaling')).toBe('fill');
    expect(attrString(decoded, 'media')).toBe('na_index-4x6_4x6in');
    expect(attrString(decoded, 'print-color-mode')).toBe('color');
    expect(findAttribute(decoded, 'printer-resolution')).toHaveLength(1);
  });

  it('сообщает остаток ленты и состояние принтера', async () => {
    const {transport} = makeTransport(request =>
      capabilitiesResponse(decodeResponse(request.body).requestId),
    );
    const status = await transport.checkStatus();
    expect(status).toMatchObject({health: 'ready', suppliesPercent: 37});
  });

  it('переводит закончившуюся бумагу в состояние blocked', async () => {
    const {transport} = makeTransport(request =>
      httpWrap(
        message(
          responseHeader(StatusCode.SuccessfulOk, decodeResponse(request.body).requestId),
          new Uint8Array([DelimiterTag.PrinterAttributes]),
          attr(ValueTag.Enum, 'printer-state', int32(5)),
          attr(ValueTag.Keyword, 'printer-state-reasons', text('media-empty')),
          new Uint8Array([DelimiterTag.EndOfAttributes]),
        ),
      ),
    );
    expect(await transport.checkStatus()).toMatchObject({
      health: 'blocked',
      blockingReason: 'media-empty',
    });
  });

  it('отслеживает состояние задания', async () => {
    const {transport} = makeTransport(request =>
      httpWrap(
        message(
          responseHeader(StatusCode.SuccessfulOk, decodeResponse(request.body).requestId),
          new Uint8Array([DelimiterTag.JobAttributes]),
          attr(ValueTag.Enum, 'job-state', int32(JobState.Processing)),
          attr(ValueTag.Keyword, 'job-state-reasons', text('job-printing')),
          new Uint8Array([DelimiterTag.EndOfAttributes]),
        ),
      ),
    );
    expect(await transport.trackJob({remoteId: 9, submittedAt: 0})).toEqual({
      state: 'printing',
      reasons: ['job-printing'],
    });
  });

  it('без идентификатора задания честно отвечает «неизвестно»', async () => {
    const {transport} = makeTransport(() => httpWrap(new Uint8Array(0), 200));
    expect(await transport.trackJob({remoteId: null, submittedAt: 0})).toEqual({
      state: 'unknown',
      reasons: [],
    });
  });
});

describe('mapJobState', () => {
  it('раскладывает коды IPP по состояниям приложения', () => {
    expect(mapJobState(JobState.Pending)).toBe('pending');
    expect(mapJobState(JobState.PendingHeld)).toBe('pending');
    expect(mapJobState(JobState.Processing)).toBe('printing');
    expect(mapJobState(JobState.ProcessingStopped)).toBe('printing');
    expect(mapJobState(JobState.Completed)).toBe('done');
    expect(mapJobState(JobState.Canceled)).toBe('canceled');
    expect(mapJobState(JobState.Aborted)).toBe('failed');
    expect(mapJobState(999)).toBe('unknown');
  });
});

describe('MockTransport', () => {
  it('имитирует печать с заданной длительностью', async () => {
    let now = 1000;
    const transport = new MockTransport({printDurationMs: 5000, now: () => now});

    const job = await transport.submit({
      data: new Uint8Array([1]),
      format: 'image/jpeg',
      name: 'демо',
      copies: 1,
    });

    expect((await transport.trackJob(job)).state).toBe('printing');
    now += 5000;
    expect((await transport.trackJob(job)).state).toBe('done');
    expect(transport.printed).toHaveLength(1);
  });

  it('умеет изображать неисправность для проверки экранов', async () => {
    const transport = new MockTransport();
    expect((await transport.checkStatus()).health).toBe('ready');
    transport.forcedBlockingReason = 'media-empty';
    expect(await transport.checkStatus()).toMatchObject({
      health: 'blocked',
      blockingReason: 'media-empty',
    });
  });

  it('умеет ронять отправку с заданной вероятностью', async () => {
    const transport = new MockTransport({failureRate: 1, random: () => 0});
    await expect(
      transport.submit({data: new Uint8Array([1]), format: 'image/jpeg', name: 'x', copies: 1}),
    ).rejects.toThrow(/имитация сбоя/);
  });
});

describe('SystemPrintTransport', () => {
  const bridge = {
    available: true,
    calls: [] as {filePath: string; jobName: string; copies: number}[],
    async isAvailable() {
      return this.available;
    },
    async print(options: {filePath: string; jobName: string; copies: number}) {
      this.calls.push(options);
    },
  };

  beforeEach(() => {
    bridge.available = true;
    bridge.calls = [];
  });

  it('сохраняет документ во временный файл и отдаёт его системе', async () => {
    const written: {data: Uint8Array; extension: string}[] = [];
    const transport = new SystemPrintTransport(bridge, async (data, extension) => {
      written.push({data, extension});
      return `/tmp/print.${extension}`;
    });

    const job = await transport.submit({
      data: new Uint8Array([0xff, 0xd8]),
      format: 'image/jpeg',
      name: 'Гость №1',
      copies: 2,
    });

    expect(written[0]?.extension).toBe('jpg');
    expect(bridge.calls[0]).toMatchObject({
      filePath: '/tmp/print.jpg',
      jobName: 'Гость №1',
      copies: 2,
    });
    // Система не выдаёт идентификатор — отслеживать нечего.
    expect(job.remoteId).toBeNull();
    expect(transport.canTrackJobs).toBe(false);
  });

  it('сообщает, что печать недоступна', async () => {
    bridge.available = false;
    const transport = new SystemPrintTransport(bridge, async () => '/tmp/x');
    expect(await transport.checkStatus()).toMatchObject({
      health: 'blocked',
      blockingReason: 'system-print-unavailable',
    });
  });
});
