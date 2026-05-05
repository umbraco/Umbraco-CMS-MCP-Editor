import type { JestConfigWithTsJest } from "ts-jest";

const config: JestConfigWithTsJest = {
  displayName: "template",
  preset: "ts-jest/presets/js-with-ts-esm",
  testEnvironment: "node",
  maxWorkers: 1,
  workerIdleMemoryLimit: '512MB', // Recycle worker to prevent OOM with ESM module loading
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true,
      },
    ],
  },
  testMatch: ["**/__tests__/**/*.test.ts"],
  setupFiles: ["<rootDir>/jest.setup.ts"],
  setupFilesAfterEnv: ["<rootDir>/src/mocks/jest-setup.ts"],
  // Anchor with <rootDir> so the pattern only skips worktrees nested under
  // the current rootDir (the main repo's view) — not the worktree itself
  // when tests run from within one (where rootDir IS the worktree).
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/.claude/worktrees/"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.d.ts"],
  coverageDirectory: "coverage",
  reporters: [
    "default",
  ],
};

export default config;
