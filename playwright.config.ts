import { defineConfig } from '@playwright/test';

// Electron 端到端测试：先 pnpm build，再 pnpm test:e2e
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  retries: process.env['CI'] ? 1 : 0,
  workers: 1,
  reporter: process.env['CI'] ? 'github' : 'list',
});
