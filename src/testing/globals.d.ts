/**
 * Управляемые заглушки нативных модулей, доступные тестам интерфейса.
 *
 * Реализация живёт в `jest.setup.ui.js` и пересоздаётся перед каждым тестом.
 * Здесь — только описание типов, чтобы тест не приходилось писать «вслепую»
 * и чтобы опечатка в имени поля ловилась проверкой типов, а не прогоном.
 */

import type {PickResult} from '../platform/gallery';

declare global {
  /** Заглушка камеры: разрешение, устройство и результат съёмки. */
  var __cameraMock: {
    hasPermission: boolean;
    requestPermission: jest.Mock<Promise<boolean>, []>;
    device: {id: string; position: string} | undefined;
    takePhoto: jest.Mock<
      Promise<{path: string; width: number; height: number; isMirrored: boolean}>,
      [unknown?]
    >;
  };

  /** Заглушка системной галереи. */
  var __galleryMock: {
    launch: jest.Mock<Promise<unknown>, [unknown?]>;
  };
}

export type {PickResult};
