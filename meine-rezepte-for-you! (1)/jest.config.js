/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  testMatch: ['<rootDir>/**/*.test.(ts|tsx)'],
  // Setup files to run before each test file
  // This allows mocking global objects like localStorage before modules are imported
  setupFilesAfterEnv: [],
};