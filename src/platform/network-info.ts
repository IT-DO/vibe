/**
 * Сведения о текущей сети: нужны, чтобы найти принтер в режиме точки доступа.
 */

import {NativeModules} from 'react-native';

import type {NetworkInfo} from '../printing/discovery';

interface NetworkNativeModule {
  getGatewayIp(): Promise<string | null>;
  getLocalIp(): Promise<string | null>;
  /** Имя сети, к которой подключён планшет, — показываем в админке. */
  getSsid(): Promise<string | null>;
}

const native = NativeModules.PhotoNetworkInfo as NetworkNativeModule | undefined;

export const networkInfo: NetworkInfo = {
  async getGatewayIp() {
    return native ? native.getGatewayIp() : null;
  },
  async getLocalIp() {
    return native ? native.getLocalIp() : null;
  },
};

/** Имя сети для экрана диагностики. */
export async function currentSsid(): Promise<string | null> {
  return native ? native.getSsid().catch(() => null) : null;
}
