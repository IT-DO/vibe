/**
 * Два проекта в одном прогоне:
 *  - "logic"  — чистый TypeScript без React Native (протокол печати, геометрия,
 *               очередь, конечный автомат сессии). Гоняется на ts-jest в node.
 *  - "ui"     — компоненты React Native, требуют preset react-native.
 *
 * Разделение сделано намеренно: вся логика, которая должна быть проверяемой,
 * не импортирует ничего из react-native, поэтому тестируется без эмулятора.
 */
module.exports = {
  projects: [
    {
      displayName: 'logic',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts'],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
      },
      transform: {
        '^.+\\.tsx?$': [
          'ts-jest',
          {
            tsconfig: {
              target: 'es2020',
              module: 'commonjs',
              esModuleInterop: true,
              strict: true,
              noUncheckedIndexedAccess: true,
              types: ['jest', 'node'],
            },
          },
        ],
      },
    },
    {
      // Экраны, компоненты и хук оркестрации. Нативные модули заменены
      // заглушками в jest.setup.ui.js: проверяем не камеру и не Skia, а
      // поведение приложения вокруг них — что происходит, когда камера не
      // отвечает, галерея отменена, а запись файла упала.
      displayName: 'ui',
      preset: 'react-native',
      // Приложение собирается только под Android, значит и `Platform.OS` в
      // тестах должен быть androidʼом: иначе проверяется ветка, которая на
      // устройстве никогда не выполняется.
      haste: {defaultPlatform: 'android', platforms: ['android', 'native']},
      // Общие jest.fn() в фикстурах экранов иначе копят вызовы между тестами,
      // и «не вызывалось» проходит или падает в зависимости от порядка.
      clearMocks: true,
      setupFilesAfterEnv: ['<rootDir>/jest.setup.ui.js'],
      testMatch: ['<rootDir>/src/**/__ui__/**/*.test.tsx'],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
      },
      transformIgnorePatterns: [
        'node_modules/(?!(@react-native|react-native|@testing-library)/)',
      ],
    },
  ],
};
