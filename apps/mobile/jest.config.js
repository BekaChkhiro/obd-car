/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  // Whole of src/, not just src/ble/: the honesty rules around simulated
  // adapter data live in the store layer and are worth pinning too. Anything
  // that reaches for a native module has to mock it — the environment is node.
  testMatch: ['**/src/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'babel-jest',
      {
        presets: ['babel-preset-expo'],
      },
    ],
  },
  moduleNameMapper: {
    // Map workspace package to its TypeScript source
    '^@obd-car/obd-protocol$':
      '<rootDir>/../../packages/obd-protocol/src/index.ts',
    // Within obd-protocol, .js imports resolve to .ts sources
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transformIgnorePatterns: [
    'node_modules/(?!(babel-preset-expo|expo)/)',
  ],
};
