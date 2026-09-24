/**
 * Поиск служб IPP по mDNS (Bonjour) — реализация `MdnsBrowser`.
 *
 * Сканирование намеренно ограничено по времени: на мероприятии сеть бывает
 * шумной, а оператор ждёт ответа в админке, а не бесконечного спиннера.
 */

import Zeroconf, {type Service} from 'react-native-zeroconf';

import type {MdnsBrowser, MdnsService} from '../printing/discovery';

/** Достаёт IPv4-адрес из разрешённой службы. */
function pickAddress(service: Service): string | null {
  const ipv4 = service.addresses?.find(address => /^\d{1,3}(\.\d{1,3}){3}$/.test(address));
  return ipv4 ?? service.addresses?.[0] ?? service.host ?? null;
}

export class ZeroconfBrowser implements MdnsBrowser {
  scan(serviceType: string, timeoutMs: number): Promise<MdnsService[]> {
    // Тип приходит как `_ipp._tcp`, а библиотека ждёт `ipp` и `tcp` отдельно.
    const [, type = 'ipp', protocol = 'tcp'] = /^_?([^.]+)\._?(tcp|udp)/.exec(serviceType) ?? [];

    return new Promise(resolve => {
      const zeroconf = new Zeroconf();
      const found = new Map<string, MdnsService>();

      const finish = () => {
        clearTimeout(timer);
        try {
          zeroconf.stop();
          zeroconf.removeAllListeners();
        } catch {
          // Библиотека могла уже освободить ресурсы.
        }
        resolve([...found.values()]);
      };

      const timer = setTimeout(finish, timeoutMs);

      zeroconf.on('resolved', service => {
        const host = pickAddress(service);
        if (!host) {
          return;
        }
        found.set(service.name, {
          name: service.name,
          host,
          port: service.port ?? 631,
          txt: service.txt ?? {},
        });
      });

      zeroconf.on('error', finish);

      try {
        zeroconf.scan(type, protocol, 'local.');
      } catch {
        finish();
      }
    });
  }
}
