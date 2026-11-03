import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// 容量与性能测试（NFR-PERF-06 / 07）：造数较慢，不随 pnpm test 运行，用 pnpm test:perf 单独执行
export default defineConfig({
  resolve: { alias: { '@shared': resolve('src/shared') } },
  test: {
    include: ['tests/perf/**/*.test.ts'],
    environment: 'node',
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
