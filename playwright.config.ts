import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 30000,
  use: {
    // TQ-F2: Vite dev/preview bind port 3000 (vite.config.ts server.port) —
    // config cũ trỏ 5173 khiến webServer wait không bao giờ thấy port mở.
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // TQ-F2: wrapper tự đợi CẢ Vite (3000) và backend health (3001/health) —
    // config cũ gate ở 5173 (port không tồn tại) nên E2E không bao giờ chạy được.
    command: 'node scripts/e2e-dev.mjs',
    url: 'http://localhost:3001/health',
    reuseExistingServer: !process.env.CI,
    timeout: 150_000,
  },
})
