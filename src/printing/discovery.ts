/**
 * Поиск принтера в сети.
 *
 * На мероприятии встречаются две топологии, и обе надо поддержать:
 *
 *  1. Планшет подключён к точке доступа самого принтера. Интернета нет,
 *     принтер почти всегда — шлюз подсети (например, 192.168.223.1).
 *     Работает где угодно, но планшет теряет связь с внешним миром.
 *  2. Принтер и планшет — в общей сети площадки через роутер. Тогда принтер
 *     находится по mDNS и планшет сохраняет интернет (нужно для отправки
 *     цифровых копий гостям).
 *
 * Порядок поиска: mDNS -> шлюз -> ручной ввод адреса в админке.
 */

import {probeIppEndpoint, type IppEndpoint} from './ipp/client';
import type {PrinterCapabilities} from './ipp/capabilities';
import {DEFAULT_IPP_PORT} from './ipp/constants';
import type {TcpConnector} from './net';

/** Служба, найденная по mDNS. */
export interface MdnsService {
  readonly name: string;
  /** IP-адрес, к которому уже разрешено имя. */
  readonly host: string;
  readonly port: number;
  /** TXT-записи; у IPP там лежит `rp` — путь к очереди печати. */
  readonly txt: Readonly<Record<string, string>>;
}

/** Обозреватель mDNS (Bonjour). Реализация — в `src/platform/mdns.ts`. */
export interface MdnsBrowser {
  scan(serviceType: string, timeoutMs: number): Promise<MdnsService[]>;
}

/** Сведения о текущем сетевом подключении планшета. */
export interface NetworkInfo {
  /** Адрес шлюза — в режиме точки доступа это сам принтер. */
  getGatewayIp(): Promise<string | null>;
  getLocalIp(): Promise<string | null>;
}

/** Найденный принтер. */
export interface DiscoveredPrinter {
  readonly endpoint: IppEndpoint;
  readonly capabilities: PrinterCapabilities;
  /** Как именно нашли — показываем оператору в админке. */
  readonly source: 'mdns' | 'gateway' | 'manual';
  readonly displayName: string;
}

export interface DiscoveryOptions {
  readonly connector: TcpConnector;
  readonly mdns?: MdnsBrowser;
  readonly network?: NetworkInfo;
  readonly mdnsTimeoutMs?: number;
  readonly probeTimeoutMs?: number;
}

/** Типы служб IPP в mDNS. */
const IPP_SERVICE_TYPES = ['_ipp._tcp', '_ipps._tcp'] as const;

/**
 * Выделяет путь к очереди печати из TXT-записи `rp`.
 * По RFC 8010 путь в `rp` идёт без ведущего слэша: `rp=ipp/print`.
 */
export function pathFromTxt(txt: Readonly<Record<string, string>>): string | null {
  const rp = txt.rp ?? txt.RP;
  if (!rp) {
    return null;
  }
  return rp.startsWith('/') ? rp : `/${rp}`;
}

/**
 * Достраивает вероятный адрес шлюза из локального адреса: последний октет 1.
 * Нужен, когда ОС не отдаёт шлюз напрямую (частый случай на iOS).
 */
export function guessGatewayFromIp(localIp: string): string | null {
  const match = /^(\d{1,3}\.\d{1,3}\.\d{1,3})\.(\d{1,3})$/.exec(localIp.trim());
  if (!match) {
    return null;
  }
  const octets = match[1]!.split('.').map(Number);
  if (octets.some(o => o > 255)) {
    return null;
  }
  return `${match[1]}.1`;
}

/** Похоже ли имя службы на фотопринтер Xiaomi. */
export function looksLikeXiaomiPrinter(service: {
  name: string;
  txt: Readonly<Record<string, string>>;
}): boolean {
  const haystack = [
    service.name,
    service.txt.ty ?? '',
    service.txt.product ?? '',
    service.txt.usb_MFG ?? '',
  ]
    .join(' ')
    .toLowerCase();
  return /xiaomi|mijia|mi[- ]?photo|instant photo|photo printer/.test(haystack);
}

/**
 * Ищет принтеры. Возвращает список; первым идёт наиболее вероятный —
 * похожий на фотопринтер Xiaomi, найденный по mDNS.
 */
export async function discoverPrinters(
  options: DiscoveryOptions,
): Promise<DiscoveredPrinter[]> {
  const found: DiscoveredPrinter[] = [];
  const seen = new Set<string>();

  const add = (printer: DiscoveredPrinter) => {
    const key = `${printer.endpoint.host}:${printer.endpoint.port}${printer.endpoint.path}`;
    if (!seen.has(key)) {
      seen.add(key);
      found.push(printer);
    }
  };

  // 1. mDNS — работает, когда планшет и принтер в одной сети через роутер.
  if (options.mdns) {
    for (const serviceType of IPP_SERVICE_TYPES) {
      let services: MdnsService[] = [];
      try {
        services = await options.mdns.scan(serviceType, options.mdnsTimeoutMs ?? 4_000);
      } catch {
        continue; // mDNS часто режут гостевые сети — это не повод падать
      }

      for (const service of services) {
        const path = pathFromTxt(service.txt);
        const result = await probeIppEndpoint(
          service.host,
          options.connector,
          service.port || DEFAULT_IPP_PORT,
          path ? [path] : undefined,
          options.probeTimeoutMs ?? 4_000,
        );
        if (result) {
          add({
            endpoint: result.endpoint,
            capabilities: result.capabilities,
            source: 'mdns',
            displayName:
              result.capabilities.makeAndModel ?? service.name ?? result.endpoint.host,
          });
        }
      }
    }
  }

  // 2. Шлюз — режим точки доступа принтера, mDNS там обычно недоступен.
  if (options.network) {
    const gateway =
      (await safe(() => options.network!.getGatewayIp())) ??
      (await deriveGateway(options.network));

    if (gateway) {
      const result = await probeIppEndpoint(
        gateway,
        options.connector,
        DEFAULT_IPP_PORT,
        undefined,
        options.probeTimeoutMs ?? 4_000,
      );
      if (result) {
        add({
          endpoint: result.endpoint,
          capabilities: result.capabilities,
          source: 'gateway',
          displayName: result.capabilities.makeAndModel ?? `Принтер на ${gateway}`,
        });
      }
    }
  }

  // Фотопринтеры Xiaomi — вперёд: скорее всего именно за ним пришли.
  return found.sort((a, b) => rank(b) - rank(a));
}

function rank(printer: DiscoveredPrinter): number {
  let score = 0;
  if (looksLikeXiaomiPrinter({name: printer.displayName, txt: {}})) {
    score += 10;
  }
  if (printer.source === 'mdns') {
    score += 2;
  }
  // Принтер, у которого есть 10×15 — то, что нужно фотобудке.
  if (printer.capabilities.media.some(m => Math.abs(m.widthMm - 101.6) < 6)) {
    score += 5;
  }
  return score;
}

async function deriveGateway(network: NetworkInfo): Promise<string | null> {
  const local = await safe(() => network.getLocalIp());
  return local ? guessGatewayFromIp(local) : null;
}

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

/** Проверяет вручную введённый адрес и возвращает принтер, если он там есть. */
export async function connectManually(
  host: string,
  connector: TcpConnector,
  port = DEFAULT_IPP_PORT,
  path?: string,
): Promise<DiscoveredPrinter | null> {
  const result = await probeIppEndpoint(
    host,
    connector,
    port,
    path ? [path] : undefined,
  );
  if (!result) {
    return null;
  }
  return {
    endpoint: result.endpoint,
    capabilities: result.capabilities,
    source: 'manual',
    displayName: result.capabilities.makeAndModel ?? `Принтер на ${host}`,
  };
}
