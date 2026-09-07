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
