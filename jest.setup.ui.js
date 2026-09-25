/**
 * Заглушки нативных модулей для тестов интерфейса.
 *
 * Экраны и хук сессии тянут за собой камеру, Skia, файловую систему и сеть.
 * В тестах нужны не они, а поведение приложения вокруг них: что происходит,
 * когда камера не отвечает, галерея отменена, а запись файла упала. Поэтому
 * каждый нативный модуль заменён на управляемую заглушку, которой тест может
 * задать нужный исход.
 */

/* eslint-env jest */

// ── Камера ────────────────────────────────────────────────────────────────
jest.mock('react-native-vision-camera', () => {
  const React = require('react');
  return {
    Camera: React.forwardRef((props, ref) => {
      React.useImperativeHandle(ref, () => ({
        takePhoto: (...args) => globalThis.__cameraMock.takePhoto(...args),
      }));
      return React.createElement('Camera', props);
    }),
    useCameraDevice: () => globalThis.__cameraMock.device,
    useCameraPermission: () => ({
      hasPermission: globalThis.__cameraMock.hasPermission,
      requestPermission: globalThis.__cameraMock.requestPermission,
    }),
  };
});

// ── Сборка листа ──────────────────────────────────────────────────────────
jest.mock('@shopify/react-native-skia', () => ({
  Skia: {
    Data: {fromURI: jest.fn(async () => null)},
    Typeface: {MakeFreeTypeFaceFromData: jest.fn(() => null)},
    FontMgr: {System: jest.fn(() => ({matchFamilyStyle: () => null}))},
  },
  ImageFormat: {JPEG: 3},
  ColorType: {RGBA_8888: 4},
  AlphaType: {Unpremul: 2},
  TileMode: {Clamp: 0},
  FontStyle: {Normal: 0, Bold: 1, Italic: 2, BoldItalic: 3},
}));

// ── Хранилище настроек ────────────────────────────────────────────────────
jest.mock('react-native-mmkv', () => {
  class MMKV {
    constructor() {
      this.store = new Map();
    }
    getString(key) {
      return this.store.get(key);
    }
    set(key, value) {
      this.store.set(key, value);
    }
    delete(key) {
      this.store.delete(key);
    }
  }
  return {MMKV};
});

// ── Файлы ─────────────────────────────────────────────────────────────────
jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/tmp/док',
  exists: jest.fn(async () => true),
  mkdir: jest.fn(async () => undefined),
  writeFile: jest.fn(async () => undefined),
  readFile: jest.fn(async () => ''),
  unlink: jest.fn(async () => undefined),
  readDir: jest.fn(async () => []),
}));

// ── Сеть и обнаружение ────────────────────────────────────────────────────
jest.mock('react-native-tcp-socket', () => ({
  createConnection: jest.fn(() => ({
    on: jest.fn(),
    write: jest.fn(),
    destroy: jest.fn(),
  })),
}));

jest.mock('react-native-zeroconf', () => {
  return class Zeroconf {
    scan() {}
    stop() {}
    on() {}
    removeAllListeners() {}
  };
});

// ── Галерея ───────────────────────────────────────────────────────────────
jest.mock('react-native-image-picker', () => ({
  launchImageLibrary: (...args) => globalThis.__galleryMock.launch(...args),
}));

// ── Bluetooth ─────────────────────────────────────────────────────────────
// Библиотека поставляется в ES-модулях и поднимает нативный стек: в тестах
// вместо неё управляемая заглушка, которой тест задаёт нужный исход.
// ── Классический Bluetooth ────────────────────────────────────────────────
// Принтер Xiaomi 1S работает по RFCOMM/SPP, а не BLE: это видно в журнале
// настоящей печати — канал L2CAP есть, пакетов ATT нет ни одного.
jest.mock('react-native-bluetooth-classic', () => ({
  __esModule: true,
  default: {
    isBluetoothEnabled: (...a) => globalThis.__btMock.isBluetoothEnabled(...a),
    getBondedDevices: (...a) => globalThis.__btMock.getBondedDevices(...a),
    connectToDevice: (...a) => globalThis.__btMock.connectToDevice(...a),
    openBluetoothSettings: (...a) => globalThis.__btMock.openBluetoothSettings(...a),
  },
}));

// ── Галерея устройства ────────────────────────────────────────────────────
// Отпечаток кладётся в альбом через MediaStore. В тестах проверяется не сама
// запись, а поведение вокруг неё: что сохраняем до постановки в очередь (она
// удалит файл после печати) и что неудача не рвёт сценарий гостя.
jest.mock('@react-native-camera-roll/camera-roll', () => ({
  CameraRoll: {
    save: (...args) => globalThis.__albumMock.save(...args),
  },
}));

// ── Векторная графика для QR ──────────────────────────────────────────────
jest.mock('react-native-svg', () => {
  const React = require('react');
  const Svg = props => React.createElement('Svg', props, props.children);
  const Rect = props => React.createElement('Rect', props);
  return {__esModule: true, default: Svg, Svg, Rect};
});

// ── Безопасные отступы ────────────────────────────────────────────────────
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  return {
    SafeAreaProvider: ({children}) => children,
    SafeAreaView: ({children, ...rest}) => React.createElement('SafeAreaView', rest, children),
    useSafeAreaInsets: () => ({top: 0, bottom: 0, left: 0, right: 0}),
  };
});

// ── Наши нативные модули ──────────────────────────────────────────────────
// Дописываем в существующий реестр, а не подменяем его целиком: React Native
// держит там же свои внутренние модули (Dimensions тянет NativeDeviceInfo), и
// полная подмена ломает сам фреймворк.
const {NativeModules} = require('react-native');

NativeModules.PhotoKiosk = {
  enterKioskMode: jest.fn(async () => false),
  exitKioskMode: jest.fn(async () => false),
  isKioskActive: jest.fn(async () => false),
  keepScreenOn: jest.fn(async () => undefined),
  setImmersive: jest.fn(async () => undefined),
  playCue: jest.fn(),
};

NativeModules.PhotoNetworkInfo = {
  getGatewayIp: jest.fn(async () => null),
  getLocalIp: jest.fn(async () => null),
  getSsid: jest.fn(async () => null),
};

NativeModules.PhotoSystemPrint = {
  isAvailable: jest.fn(async () => false),
  print: jest.fn(async () => undefined),
};

NativeModules.PhotoCrashLog = {
  append: jest.fn(async () => undefined),
  read: jest.fn(async () => ''),
  clear: jest.fn(async () => undefined),
};

// ── Состояние заглушек по умолчанию перед каждым тестом ───────────────────
beforeEach(() => {
  globalThis.__cameraMock = {
    hasPermission: true,
    requestPermission: jest.fn(async () => true),
    device: {id: 'front-0', position: 'front'},
    takePhoto: jest.fn(async () => ({
      path: '/tmp/снимок.jpg',
      width: 3024,
      height: 4032,
      isMirrored: true,
    })),
  };
  globalThis.__galleryMock = {
    launch: jest.fn(async () => ({didCancel: true})),
  };
  globalThis.__albumMock = {
    save: jest.fn(async () => 'content://media/external/images/1'),
  };
  globalThis.__btMock = {
    isBluetoothEnabled: jest.fn(async () => true),
    getBondedDevices: jest.fn(async () => []),
    // По умолчанию принтера нет: тест, которому он нужен, подменяет ответ
    // сам, а остальные не должны случайно «подключиться» к пустоте.
    connectToDevice: jest.fn(async () => {
      throw new Error('Устройство не отвечает');
    }),
    openBluetoothSettings: jest.fn(),
  };
});

// ── Анимации ──────────────────────────────────────────────────────────────
// В тестах анимации завершаются мгновенно. Иначе бесконечная пульсация
// заставки и «пружинка» отсчёта обновляют состояние вне act() и заливают
// вывод предупреждениями, а проверяем мы не их, а что нарисовано и что
// нажимается. Значение сразу переводится в конечное, а колбэк завершения
// вызывается — цепочки анимаций, если они появятся, не зависнут.
const {Animated} = require('react-native');

const settleImmediately = (value, config) => ({
  start: callback => {
    if (config && typeof config.toValue === 'number' && value && value.setValue) {
      value.setValue(config.toValue);
    }
    if (callback) {
      callback({finished: true});
    }
  },
  stop: () => {},
  reset: () => {},
});

const noopAnimation = () => ({
  start: callback => {
    if (callback) {
      callback({finished: true});
    }
  },
  stop: () => {},
  reset: () => {},
});

Animated.timing = settleImmediately;
Animated.spring = settleImmediately;
Animated.decay = settleImmediately;
// Составные анимации: содержимое уже мгновенное, а бесконечный цикл в тесте
// крутить незачем.
Animated.sequence = noopAnimation;
Animated.parallel = noopAnimation;
Animated.stagger = noopAnimation;
Animated.loop = noopAnimation;
