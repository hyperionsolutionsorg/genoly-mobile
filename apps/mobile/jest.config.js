// jest.config.js
module.exports = {
  preset: 'jest-expo',
  testEnvironment: 'jsdom',
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|expo|@expo|expo-module-scripts)/)',
  ],
  setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect'],
  verbose: true,
};
