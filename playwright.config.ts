import { defineConfig, devices } from '@playwright/test'
import { createE2ERunId, resolveE2EEndpoints } from './scripts/e2e-sandbox.mjs'

const e2eEndpoints = resolveE2EEndpoints(process.env)
const e2eRunId = createE2ERunId()
Object.assign(process.env, {
  E2E_RUN_ID: e2eRunId,
  E2E_BASE_URL: e2eEndpoints.baseUrl,
  E2E_VITE_URL: e2eEndpoints.viteUrl,
  E2E_HEALTH_URL: e2eEndpoints.healthUrl,
})

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  failOnFlakyTests: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 30000,
  // Auto-retrying assertions default to 5s. A route only paints its controls
  // after RootLayout clears the auth bootstrap screen and the page's own read
  // model lands, and a loaded CI runner routinely needs longer than 5s for that.
  // 15s is the budget this suite already sets inline at several call sites, so
  // raising the default here fixes the whole class of load-then-assert races
  // instead of one call site per red run.
  expect: {
    timeout: 15_000,
  },
  reporter: process.env.CI
    ? [['dot'], ['html', { open: 'never' }], ['./e2e/e2e-cleanup-reporter.mjs']]
    : [['list'], ['./e2e/e2e-cleanup-reporter.mjs']],
  use: {
    // E2E dùng cặp cổng riêng 3100/3101 để không reuse hay chặn phiên dev 3000/3001.
    baseURL: e2eEndpoints.baseUrl,
    // A retry can pass after the failure state has disappeared. Keep the first
    // failed attempt's real requests and browser timeline for CI triage too.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    timezoneId: 'Asia/Ho_Chi_Minh',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // QA-WEBKIT-1 (2026-09-09): chạy cùng suite trên Desktop Safari (WebKit) —
    // giáo lý viên/phụ huynh dùng iPhone/Safari chiếm đa số nhưng trước đây CI
    // chỉ test Chromium, bỏ sót lỗi đặc thù WebKit (date input, IndexedDB, PWA).
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    // Wrapper chỉ log READY sau khi Vite + backend + seed trên DB temp riêng sẵn sàng.
    // Chờ stdout thay vì /health để không mở test trong cửa sổ health-before-seed.
    command: 'node scripts/e2e-dev.mjs',
    wait: { stdout: /^\[e2e-dev\] READY\b/m },
    stdout: 'ignore',
    // POSIX: cho wrapper thời gian dọn toàn bộ process-group con trước SIGKILL.
    // Windows bỏ qua option này; cleanup reporter vẫn xóa sandbox sau taskkill.
    gracefulShutdown: { signal: 'SIGTERM', timeout: 12_000 },
    timeout: 150_000,
  },
})
