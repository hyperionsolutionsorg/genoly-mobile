// jest.scripts.config.cjs
//
// Dedicated config for scripts/ tests. The root jest config uses
// jest-expo's preset (Babel transform + RN-specific setup files), which
// is the wrong fit for plain Node ESM .mjs files in scripts/. This
// config opts out of all transforms so .mjs is loaded natively under
// Node ESM via Jest's experimental-vm-modules flag.
//
// The npm script (`test:scripts`) sets NODE_OPTIONS so the flag is
// transparent at call sites.
//
// Run with:
//   npm run test:scripts
//   NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.scripts.config.cjs
module.exports = {
  testEnvironment: "node",
  testMatch: ["<rootDir>/scripts/**/*.test.{mjs,cjs,js}"],
  transform: {},
  moduleFileExtensions: ["mjs", "cjs", "js", "json"],
  setupFiles: [],
};
