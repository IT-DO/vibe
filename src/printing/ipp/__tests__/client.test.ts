import {decodeUtf8} from '../../../utils/bytes';
import {
  IppClient,
  IppError,
  describeStatus,
  probeIppEndpoint,
} from '../client';
import {DelimiterTag, JobState, Operation, StatusCode, ValueTag} from '../constants';
import {attrString, attrStrings, decodeResponse, findAttribute} from '../message';
import {FakeConnector, type ParsedRequest} from './fake-socket';
import {attr, extraValue, httpWrap, int32, message, resolution, responseHeader, text} from './fixtures';

/** Ответ Get-Printer-Attributes, похожий на реальный Xiaomi 1S. */
function printerAttributesResponse(requestId: number): Uint8Array {
  return httpWrap(
    message(
      responseHeader(StatusCode.SuccessfulOk, requestId),
      new Uint8Array([DelimiterTag.OperationAttributes]),
      attr(ValueTag.Charset, 'attributes-charset', text('utf-8')),
      new Uint8Array([DelimiterTag.PrinterAttributes]),
      attr(ValueTag.NameWithoutLanguage, 'printer-name', text('MI-Photo-Printer')),
      attr(
        ValueTag.TextWithoutLanguage,
        'printer-make-and-model',
        text('Xiaomi Instant Photo Printer 1S'),
      ),
      attr(ValueTag.Enum, 'printer-state', int32(3)),
      attr(ValueTag.Keyword, 'printer-state-reasons', text('none')),
      attr(ValueTag.MimeMediaType, 'document-format-supported', text('image/urf')),
      extraValue(ValueTag.MimeMediaType, text('image/jpeg')),
      extraValue(ValueTag.MimeMediaType, text('image/pwg-raster')),
      attr(ValueTag.Keyword, 'media-supported', text('na_index-4x6_4x6in')),
      extraValue(ValueTag.Keyword, text('om_photo-3x3_76.2x76.2mm')),
      attr(ValueTag.Keyword, 'media-default', text('na_index-4x6_4x6in')),
      attr(ValueTag.Resolution, 'printer-resolution-supported', resolution(300, 300)),
      attr(ValueTag.Keyword, 'print-color-mode-supported', text('color')),
      attr(ValueTag.Enum, 'operations-supported', int32(Operation.PrintJob)),
      extraValue(ValueTag.Enum, int32(Operation.GetPrinterAttributes)),
      attr(ValueTag.NameWithoutLanguage, 'marker-names', text('Ribbon')),
      attr(ValueTag.Integer, 'marker-levels', int32(62)),
      new Uint8Array([DelimiterTag.EndOfAttributes]),
    ),
  );
}

function printJobResponse(requestId: number, jobId: number): Uint8Array {
  return httpWrap(
    message(
      responseHeader(StatusCode.SuccessfulOk, requestId),
      new Uint8Array([DelimiterTag.OperationAttributes]),
      attr(ValueTag.Charset, 'attributes-charset', text('utf-8')),
      new Uint8Array([DelimiterTag.JobAttributes]),
      attr(ValueTag.Integer, 'job-id', int32(jobId)),
      attr(ValueTag.Enum, 'job-state', int32(JobState.Pending)),
      new Uint8Array([DelimiterTag.EndOfAttributes]),
    ),
  );
}

/** Читает request-id из исходящего запроса, чтобы ответить тем же. */
function requestIdOf(request: ParsedRequest): number {
  return decodeResponse(request.body).requestId;
}

const endpoint = {host: '192.168.223.1', port: 631, path: '/ipp/print'};

describe('IppClient.getCapabilities', () => {
  it('запрашивает атрибуты и разбирает ответ принтера', async () => {
    let seen: ParsedRequest | undefined;
    const connector = new FakeConnector(request => {
      seen = request;
      return printerAttributesResponse(requestIdOf(request));
    });

    const caps = await new IppClient({endpoint, connector}).getCapabilities();

    expect(seen?.method).toBe('POST');
    expect(seen?.path).toBe('/ipp/print');
    expect(seen?.headers['content-type']).toBe('application/ipp');
    expect(connector.connections[0]).toEqual({host: '192.168.223.1', port: 631});

    expect(caps.makeAndModel).toBe('Xiaomi Instant Photo Printer 1S');
    expect(caps.documentFormats).toContain('image/jpeg');
    expect(caps.media.map(m => m.name)).toEqual([
      'na_index-4x6_4x6in',
      'om_photo-3x3_76.2x76.2mm',
    ]);
    expect(caps.media[0]).toMatchObject({widthMm: 101.6, heightMm: 152.4});
    expect(caps.resolutions[0]).toMatchObject({x: 300, y: 300});
    expect(caps.markers).toEqual([{name: 'Ribbon', level: 62}]);
    expect(caps.health).toBe('ready');
  });

  it('шлёт обязательные атрибуты операции в правильном порядке', async () => {
    let body: Uint8Array | undefined;
    const connector = new FakeConnector(request => {
      body = request.body;
      return printerAttributesResponse(requestIdOf(request));
    });

    await new IppClient({endpoint, connector}).getCapabilities();
    const decoded = decodeResponse(body!);

    expect(attrString(decoded, 'attributes-charset')).toBe('utf-8');
    expect(attrString(decoded, 'attributes-natural-language')).toBe('en');
    expect(attrString(decoded, 'printer-uri')).toBe('ipp://192.168.223.1:631/ipp/print');
    expect(attrStrings(decoded, 'requested-attributes')).toContain('media-supported');

    // attributes-charset обязан идти первым атрибутом в группе (RFC 8011 §4.1.4).
    const firstAttrName = decodeUtf8(body!.subarray(12, 12 + 18));
    expect(firstAttrName).toBe('attributes-charset');
  });

  it('собирает ответ, разбитый на мелкие TCP-чанки', async () => {
    const connector = new FakeConnector(
      request => printerAttributesResponse(requestIdOf(request)),
      {chunkSize: 7},
    );
    const caps = await new IppClient({endpoint, connector}).getCapabilities();
    expect(caps.makeAndModel).toBe('Xiaomi Instant Photo Printer 1S');
  });
});

describe('IppClient.printJob', () => {
  it('передаёт документ и параметры задания, возвращает job-id', async () => {
    let body: Uint8Array | undefined;
    const connector = new FakeConnector(request => {
      body = request.body;
      return printJobResponse(requestIdOf(request), 4242);
    });

    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    const jobId = await new IppClient({endpoint, connector}).printJob({
      data: jpeg,
      documentFormat: 'image/jpeg',
      jobName: 'Фото на память #3',
      copies: 2,
      media: 'na_index-4x6_4x6in',
      resolution: {kind: 'resolution', x: 300, y: 300, units: 3},
      colorMode: 'color',
      scaling: 'fill',
    });

    expect(jobId).toBe(4242);

    const decoded = decodeResponse(body!);
    expect(attrString(decoded, 'job-name')).toBe('Фото на память #3');
    expect(attrString(decoded, 'document-format')).toBe('image/jpeg');
    expect(findAttribute(decoded, 'ipp-attribute-fidelity')[0]).toBe(false);
    expect(findAttribute(decoded, 'copies')[0]).toBe(2);
    expect(attrString(decoded, 'media')).toBe('na_index-4x6_4x6in');
    expect(attrString(decoded, 'print-scaling')).toBe('fill');
    // Документ приложен к сообщению без искажений.
    expect(Array.from(decoded.data)).toEqual(Array.from(jpeg));
  });

  it('не даёт указать меньше одной копии', async () => {
    let body: Uint8Array | undefined;
    const connector = new FakeConnector(request => {
      body = request.body;
      return printJobResponse(requestIdOf(request), 1);
    });
    await new IppClient({endpoint, connector}).printJob({
      data: new Uint8Array([1]),
      documentFormat: 'image/jpeg',
      jobName: 'x',
      copies: 0,
    });
    expect(findAttribute(decodeResponse(body!), 'copies')[0]).toBe(1);
  });

  it('превращает отказ принтера в IppError с кодом статуса', async () => {
    const connector = new FakeConnector(request =>
      httpWrap(
        message(
          responseHeader(StatusCode.ClientErrorDocumentFormatNotSupported, requestIdOf(request)),
          new Uint8Array([DelimiterTag.OperationAttributes]),
          attr(ValueTag.TextWithoutLanguage, 'status-message', text('format not supported')),
          new Uint8Array([DelimiterTag.EndOfAttributes]),
        ),
      ),
    );

    await expect(
      new IppClient({endpoint, connector}).printJob({
        data: new Uint8Array([1]),
        documentFormat: 'image/heic',
        jobName: 'x',
      }),
    ).rejects.toMatchObject({
      name: 'IppError',
      statusCode: StatusCode.ClientErrorDocumentFormatNotSupported,
      message: 'format not supported',
    });
  });

  it('ошибка HTTP уровня не выдаётся за успех', async () => {
    const connector = new FakeConnector(() => httpWrap(new Uint8Array(0), 404));
    await expect(
      new IppClient({endpoint, connector}).getCapabilities(),
    ).rejects.toThrow(IppError);
  });

  it('сообщает, если принтер не вернул job-id', async () => {
    const connector = new FakeConnector(request =>
      httpWrap(
        message(
          responseHeader(StatusCode.SuccessfulOk, requestIdOf(request)),
          new Uint8Array([DelimiterTag.EndOfAttributes]),
        ),
      ),
    );
    await expect(
      new IppClient({endpoint, connector}).printJob({
        data: new Uint8Array([1]),
        documentFormat: 'image/jpeg',
        jobName: 'x',
      }),
    ).rejects.toThrow(/job-id/);
  });
});

describe('IppClient — состояние задания', () => {
  const jobStatusResponse = (requestId: number, state: number) =>
    httpWrap(
      message(
        responseHeader(StatusCode.SuccessfulOk, requestId),
        new Uint8Array([DelimiterTag.JobAttributes]),
        attr(ValueTag.Integer, 'job-id', int32(7)),
        attr(ValueTag.Enum, 'job-state', int32(state)),
        attr(ValueTag.Keyword, 'job-state-reasons', text('job-printing')),
        new Uint8Array([DelimiterTag.EndOfAttributes]),
      ),
    );

  it('различает промежуточные и финальные состояния', async () => {
    const processing = new FakeConnector(r =>
      jobStatusResponse(requestIdOf(r), JobState.Processing),
    );
    const done = new FakeConnector(r => jobStatusResponse(requestIdOf(r), JobState.Completed));

    const a = await new IppClient({endpoint, connector: processing}).getJobStatus(7);
    expect(a).toMatchObject({jobId: 7, state: JobState.Processing, isTerminal: false});
    expect(a.stateReasons).toEqual(['job-printing']);

    const b = await new IppClient({endpoint, connector: done}).getJobStatus(7);
    expect(b.isTerminal).toBe(true);
  });

  it('считает отменённое и прерванное задание финальным', async () => {
    for (const state of [JobState.Canceled, JobState.Aborted]) {
      const connector = new FakeConnector(r => jobStatusResponse(requestIdOf(r), state));
      const status = await new IppClient({endpoint, connector}).getJobStatus(7);
      expect(status.isTerminal).toBe(true);
    }
  });

  it('cancelJob отправляет Cancel-Job с job-id', async () => {
    let body: Uint8Array | undefined;
    const connector = new FakeConnector(request => {
      body = request.body;
      return httpWrap(
        message(
          responseHeader(StatusCode.SuccessfulOk, requestIdOf(request)),
          new Uint8Array([DelimiterTag.EndOfAttributes]),
        ),
      );
    });
    await new IppClient({endpoint, connector}).cancelJob(31);
    const decoded = decodeResponse(body!);
    expect(decoded.groups.length).toBeGreaterThan(0);
    expect(findAttribute(decoded, 'job-id')[0]).toBe(31);
  });
});

describe('устойчивость к сети', () => {
  it('падает по таймауту, если принтер молчит', async () => {
    const connector = new FakeConnector(() => 'silence');
    await expect(
      new IppClient({endpoint, connector, queryTimeoutMs: 50}).getCapabilities(),
    ).rejects.toThrow(/не ответил/);
  });

  it('оборачивает ошибку сокета в NetworkError', async () => {
    const connector = new FakeConnector(() => new Error('ECONNRESET'));
    await expect(
      new IppClient({endpoint, connector}).getCapabilities(),
    ).rejects.toThrow(/Ошибка соединения/);
  });

  it('сообщает об отказе в соединении', async () => {
    const connector = new FakeConnector(() => new Uint8Array(0), {failConnect: true});
    await expect(new IppClient({endpoint, connector}).getCapabilities()).rejects.toThrow(
      /отклонено/,
    );
  });

  it('request-id растёт от запроса к запросу', async () => {
    const ids: number[] = [];
    const connector = new FakeConnector(request => {
      const id = requestIdOf(request);
      ids.push(id);
      return printerAttributesResponse(id);
    });
    const client = new IppClient({endpoint, connector});
    await client.getCapabilities();
    await client.getCapabilities();
    await client.getCapabilities();
    expect(ids).toEqual([2, 3, 4]);
  });
});

describe('probeIppEndpoint', () => {
  it('находит рабочий путь, перебирая варианты', async () => {
    const tried: string[] = [];
    const connector = new FakeConnector(request => {
      tried.push(request.path);
      if (request.path !== '/ipp/printer') {
        return httpWrap(new Uint8Array(0), 404);
      }
      return printerAttributesResponse(requestIdOf(request));
    });

    const found = await probeIppEndpoint('10.0.0.5', connector);
    expect(found?.endpoint.path).toBe('/ipp/printer');
    expect(found?.capabilities.makeAndModel).toBe('Xiaomi Instant Photo Printer 1S');
    expect(tried.slice(0, 2)).toEqual(['/ipp/print', '/ipp/printer']);
  });

  it('возвращает null, если ни один путь не отвечает', async () => {
    const connector = new FakeConnector(() => httpWrap(new Uint8Array(0), 404));
    expect(await probeIppEndpoint('10.0.0.5', connector)).toBeNull();
  });
});

describe('describeStatus', () => {
  it('переводит частые коды на человеческий язык', () => {
    expect(describeStatus(StatusCode.ClientErrorDocumentFormatNotSupported)).toMatch(
      /формат документа/,
    );
    expect(describeStatus(StatusCode.ServerErrorBusy)).toMatch(/занят/);
  });

  it('для незнакомого кода печатает его в шестнадцатеричном виде', () => {
    expect(describeStatus(0x04ff)).toContain('0x04ff');
  });
});
