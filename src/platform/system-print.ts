/**
 * Мост к системной печати: Android Print Framework и iOS AirPrint.
 * Используется только как запасной путь — см. `printing/transports/system.ts`.
 */

import {NativeModules} from 'react-native';

import type {SystemPrintBridge} from '../printing/transports/system';
import {Paths, newFilePath, writeBytes} from './files';

interface SystemPrintNativeModule {
  isAvailable(): Promise<boolean>;
  print(filePath: string, jobName: string, copies: number): Promise<void>;
}

const native = NativeModules.PhotoSystemPrint as SystemPrintNativeModule | undefined;

export const systemPrintBridge: SystemPrintBridge = {
  async isAvailable() {
    return native ? native.isAvailable() : false;
  },
  async print({filePath, jobName, copies}) {
    if (!native) {
      throw new Error('Системная печать недоступна на этом устройстве');
    }
    await native.print(filePath, jobName, copies);
  },
};

/** Сохраняет документ во временный файл для передачи системе. */
export async function writeTempPrintFile(
  data: Uint8Array,
  extension: string,
): Promise<string> {
  const path = newFilePath(Paths.sheets, extension);
  await writeBytes(path, data);
  return path;
}
