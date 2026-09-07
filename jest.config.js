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
  ],
};
