/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/test/**/*.test.ts"],
  moduleNameMapper: {
    "^(helia|@helia/unixfs|blockstore-core|multiformats/cid)$": "<rootDir>/src/test/__stubs__/ipfs.ts",
    "^jose$": "<rootDir>/src/test/__stubs__/jose.ts",
    "^(\\.{1,2}/.*)\\.js$": "$1" },
  transform: { "^.+\\.ts$": ["ts-jest", { diagnostics: false }] },
};
