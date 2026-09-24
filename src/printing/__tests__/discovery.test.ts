import {
  connectManually,
  discoverPrinters,
  guessGatewayFromIp,
  looksLikeXiaomiPrinter,
  pathFromTxt,
  type MdnsBrowser,
  type MdnsService,
  type NetworkInfo,
} from '../discovery';
import {DelimiterTag, StatusCode, ValueTag} from '../ipp/constants';
import {FakeConnector} from '../ipp/__tests__/fake-socket';
import {
  attr,
  extraValue,
  httpWrap,
  int32,
  message,
  responseHeader,
  text,
} from '../ipp/__tests__/fixtures';
import {decodeResponse} from '../ipp/message';

/** Ответ принтера для узлов, которые «существуют». */
function printerAt(model: string, withPhotoMedia = true) {
  return (requestId: number) =>
    httpWrap(
      message(
        responseHeader(StatusCode.SuccessfulOk, requestId),
        new Uint8Array([DelimiterTag.PrinterAttributes]),
        attr(ValueTag.TextWithoutLanguage, 'printer-make-and-model', text(model)),
        attr(ValueTag.Enum, 'printer-state', int32(3)),
        attr(ValueTag.MimeMediaType, 'document-format-supported', text('image/jpeg')),
        ...(withPhotoMedia
          ? [
              attr(ValueTag.Keyword, 'media-supported', text('na_index-4x6_4x6in')),
              extraValue(ValueTag.Keyword, text('iso_a4_210x297mm')),
            ]
          : [attr(ValueTag.Keyword, 'media-supported', text('iso_a4_210x297mm'))]),
        new Uint8Array([DelimiterTag.EndOfAttributes]),
      ),
    );
}

/** Соединитель, который «отвечает» только с перечисленных адресов. */
function connectorWithHosts(hosts: Record<string, (requestId: number) => Uint8Array>) {
  return new FakeConnector(request => {
    const host = (request.headers.host ?? '').split(':')[0] ?? '';
    const responder = hosts[host];
    if (!responder || request.path !== '/ipp/print') {
      return httpWrap(new Uint8Array(0), 404);
    }
    return responder(decodeResponse(request.body).requestId);
  });
}

const mdnsWith = (services: MdnsService[]): MdnsBrowser => ({
  async scan(serviceType) {
    return serviceType === '_ipp._tcp' ? services : [];
  },
});

const networkWith = (gateway: string | null, local: string | null = null): NetworkInfo => ({
  async getGatewayIp() {
    return gateway;
  },
  async getLocalIp() {
    return local;
  },
});

describe('pathFromTxt', () => {
  it('добавляет ведущий слэш к пути из записи rp', () => {
    expect(pathFromTxt({rp: 'ipp/print'})).toBe('/ipp/print');
  });

  it('не дублирует уже имеющийся слэш', () => {
    expect(pathFromTxt({rp: '/ipp/print'})).toBe('/ipp/print');
  });

  it('понимает запись в верхнем регистре', () => {
    expect(pathFromTxt({RP: 'ipp/printer'})).toBe('/ipp/printer');
  });

  it('возвращает null, если записи нет', () => {
    expect(pathFromTxt({ty: 'Printer'})).toBeNull();
  });
});

describe('guessGatewayFromIp', () => {
  it('меняет последний октет на единицу', () => {
    expect(guessGatewayFromIp('192.168.223.47')).toBe('192.168.223.1');
    expect(guessGatewayFromIp('10.0.5.99')).toBe('10.0.5.1');
  });

  it('терпит пробелы по краям', () => {
    expect(guessGatewayFromIp('  192.168.1.5 ')).toBe('192.168.1.1');
  });

  it('отвергает не-IPv4', () => {
    expect(guessGatewayFromIp('fe80::1')).toBeNull();
    expect(guessGatewayFromIp('не адрес')).toBeNull();
    expect(guessGatewayFromIp('999.1.1.1')).toBeNull();
  });
});

describe('looksLikeXiaomiPrinter', () => {
  it('узнаёт принтер по имени службы', () => {
    expect(looksLikeXiaomiPrinter({name: 'Mi Photo Printer', txt: {}})).toBe(true);
    expect(looksLikeXiaomiPrinter({name: 'XIAOMI-1S', txt: {}})).toBe(true);
  });

  it('узнаёт по TXT-записи модели', () => {
    expect(
      looksLikeXiaomiPrinter({name: 'printer', txt: {ty: 'Mijia Instant Photo Printer'}}),
    ).toBe(true);
  });

  it('не принимает офисный принтер за фотопринтер', () => {
    expect(looksLikeXiaomiPrinter({name: 'HP LaserJet M404', txt: {}})).toBe(false);
  });
});

describe('discoverPrinters', () => {
  it('находит принтер по mDNS', async () => {
    const connector = connectorWithHosts({
      '192.168.1.50': printerAt('Xiaomi Instant Photo Printer 1S'),
    });
    const mdns = mdnsWith([
      {name: 'Mi Photo Printer', host: '192.168.1.50', port: 631, txt: {rp: 'ipp/print'}},
    ]);

    const found = await discoverPrinters({connector, mdns});

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      source: 'mdns',
      displayName: 'Xiaomi Instant Photo Printer 1S',
    });
    expect(found[0]?.endpoint).toEqual({
      host: '192.168.1.50',
      port: 631,
      path: '/ipp/print',
    });
  });

  it('находит принтер на шлюзе в режиме точки доступа', async () => {
    const connector = connectorWithHosts({
      '192.168.223.1': printerAt('Xiaomi Instant Photo Printer 1S'),
    });

    const found = await discoverPrinters({
      connector,
      network: networkWith('192.168.223.1'),
    });

    expect(found).toHaveLength(1);
    expect(found[0]?.source).toBe('gateway');
  });

  it('достраивает шлюз из локального адреса, если ОС его не отдала', async () => {
    const connector = connectorWithHosts({
      '192.168.223.1': printerAt('Xiaomi Instant Photo Printer 1S'),
    });

    const found = await discoverPrinters({
      connector,
      network: networkWith(null, '192.168.223.64'),
    });

    expect(found[0]?.endpoint.host).toBe('192.168.223.1');
  });

  it('ставит фотопринтер выше офисного', async () => {
    const connector = connectorWithHosts({
      '192.168.1.10': printerAt('HP LaserJet M404', false),
      '192.168.1.50': printerAt('Xiaomi Instant Photo Printer 1S'),
    });
    const mdns = mdnsWith([
      {name: 'HP LaserJet', host: '192.168.1.10', port: 631, txt: {rp: 'ipp/print'}},
      {name: 'Mi Photo', host: '192.168.1.50', port: 631, txt: {rp: 'ipp/print'}},
    ]);

    const found = await discoverPrinters({connector, mdns});

    expect(found.map(p => p.displayName)).toEqual([
      'Xiaomi Instant Photo Printer 1S',
      'HP LaserJet M404',
    ]);
  });

  it('не дублирует принтер, найденный обоими способами', async () => {
    const connector = connectorWithHosts({
      '192.168.223.1': printerAt('Xiaomi Instant Photo Printer 1S'),
    });
    const mdns = mdnsWith([
      {name: 'Mi Photo', host: '192.168.223.1', port: 631, txt: {rp: 'ipp/print'}},
    ]);

    const found = await discoverPrinters({
      connector,
      mdns,
      network: networkWith('192.168.223.1'),
    });

    expect(found).toHaveLength(1);
  });

  it('переживает сеть, где mDNS заблокирован', async () => {
    const connector = connectorWithHosts({
      '192.168.223.1': printerAt('Xiaomi Instant Photo Printer 1S'),
    });
    const brokenMdns: MdnsBrowser = {
      async scan() {
        throw new Error('multicast заблокирован в гостевой сети');
      },
    };

    const found = await discoverPrinters({
      connector,
      mdns: brokenMdns,
      network: networkWith('192.168.223.1'),
    });

    expect(found).toHaveLength(1);
    expect(found[0]?.source).toBe('gateway');
  });

  it('возвращает пустой список, когда принтеров нет', async () => {
    const connector = connectorWithHosts({});
    const found = await discoverPrinters({
      connector,
      mdns: mdnsWith([]),
      network: networkWith('192.168.1.1'),
    });
    expect(found).toEqual([]);
  });

  it('игнорирует службу mDNS, за которой никого нет', async () => {
    const connector = connectorWithHosts({});
    const mdns = mdnsWith([
      {name: 'Призрак', host: '192.168.1.99', port: 631, txt: {rp: 'ipp/print'}},
    ]);
    expect(await discoverPrinters({connector, mdns})).toEqual([]);
  });
});

describe('connectManually', () => {
  it('подключается по адресу, введённому оператором', async () => {
    const connector = connectorWithHosts({
      '10.1.1.7': printerAt('Xiaomi Instant Photo Printer 1S'),
    });
    const printer = await connectManually('10.1.1.7', connector);
    expect(printer).toMatchObject({source: 'manual', displayName: 'Xiaomi Instant Photo Printer 1S'});
  });

  it('возвращает null, если по адресу никого нет', async () => {
    const connector = connectorWithHosts({});
    expect(await connectManually('10.1.1.7', connector)).toBeNull();
  });
});
