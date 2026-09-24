/**
 * Типы для `react-native-zeroconf` — библиотека их не поставляет.
 * Описано только то, чем пользуемся: сканирование служб `_ipp._tcp`.
 */
declare module 'react-native-zeroconf' {
  /** Служба, объявленная по mDNS. */
  export interface Service {
    name: string;
    fullName?: string;
    host?: string;
    port?: number;
    /** Разрешённые адреса; первым обычно идёт IPv4. */
    addresses?: string[];
    txt?: Record<string, string>;
  }

  export type ZeroconfEvent =
    | 'start'
    | 'stop'
    | 'found'
    | 'remove'
    | 'update'
    | 'resolved'
    | 'error';

  export default class Zeroconf {
    /** @param type тип службы без подчёркиваний, например `ipp`. */
    scan(type?: string, protocol?: string, domain?: string): void;
    stop(): void;
    getServices(): Record<string, Service>;
    removeDeviceListeners(): void;
    addDeviceListeners(): void;
    /* eslint-disable no-dupe-class-members -- перегрузки метода, не дубликаты */
    on(event: 'resolved' | 'found' | 'update', listener: (service: Service) => void): void;
    on(event: 'error', listener: (error: Error) => void): void;
    on(event: ZeroconfEvent, listener: (...args: unknown[]) => void): void;
    /* eslint-enable no-dupe-class-members */
    removeAllListeners(): void;
  }
}
