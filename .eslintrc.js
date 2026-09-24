module.exports = {
  root: true,
  extends: '@react-native',
  ignorePatterns: ['node_modules/', 'android/', 'ios/', 'coverage/'],
  rules: {
    'react-native/no-inline-styles': 'off',
    // `void promise` — намеренная пометка «промис не ждём»; это принятый
    // способ показать, что плавающий промис здесь осознан.
    'no-void': 'off',
  },
  overrides: [
    {
      // Файлы настройки тестов исполняются Node: там есть и `globalThis`,
      // и заглушки, которые он несёт между модулями.
      files: ['jest.setup.ui.js', 'jest.config.js'],
      env: {'jest': true, 'es2020': true, 'node': true},
    },
    {
      // Побитовые операции в `src/platform/tcp.ts` — разбор длины кадра.
      files: ['src/platform/tcp.ts'],
      rules: {'no-bitwise': 'off'},
    },
    {
      // Побитовые операции — суть бинарных протоколов (IPP, PWG Raster,
      // base64, UTF-8). Запрещать их здесь бессмысленно.
      files: [
        'src/utils/bytes.ts',
        'src/utils/base64.ts',
        'src/printing/**/*.ts',
        'src/imaging/composer.ts',
        'src/**/__tests__/**/*.ts',
      ],
      rules: {
        'no-bitwise': 'off',
        'no-labels': 'off',
      },
    },
  ],
};
