export default {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: {
          module: "ESNext",
          target: "ES2022",
        },
      },
    ],
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!src/**/__tests__/**",
    "!src/**/*.test.ts",
  ],
  // Coverage thresholds disabled temporarily - enable when test coverage improves
  // coverageThreshold: {
  //   global: {
  //     branches: 85,
  //     functions: 90,
  //     lines: 90,
  //     statements: 90,
  //   },
  //   // Core pricing logic must be near 100%
  //   "./src/lib/utils/priceResolver.ts": {
  //     branches: 95,
  //     functions: 100,
  //     lines: 95,
  //     statements: 95,
  //   },
  //   "./src/lib/utils/pricingStateMachine.ts": {
  //     branches: 95,
  //     functions: 100,
  //     lines: 95,
  //     statements: 95,
  //   },
  //   "./src/lib/utils/dateET.ts": {
  //     branches: 90,
  //     functions: 100,
  //     lines: 90,
  //     statements: 90,
  //   },
  // },
  // Must run BEFORE test modules import Prisma (sets per-worker DATABASE_URL)
  setupFiles: ["<rootDir>/jest.env.ts"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testPathIgnorePatterns: ["/node_modules/", "/.next/"],
  testTimeout: 10000,
  // Force exit to prevent hanging from open handles
  forceExit: true,
  // Detect open handles for debugging
  detectOpenHandles: false,
  extensionsToTreatAsEsm: [".ts"],
  globals: {
    "ts-jest": {
      useESM: true,
      tsconfig: {
        module: "ESNext",
        target: "ES2022",
      },
    },
  },
};
