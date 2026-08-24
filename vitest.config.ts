import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    modules: ['node_modules', 'server/node_modules'],
  },
  test: {
    globals: true,
    maxWorkers: 1,
    hookTimeout: 30_000,
    environment: 'jsdom',
    globalSetup: ['./src/__tests__/global-setup.ts'],
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'server/src/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**', '**/*.spec.ts', 'server/dist/**'],
    env: {
      JWT_SECRET: 'test-jwt-secret-key-32-chars-long-parish-lms',
      JWT_REFRESH_SECRET: 'test-jwt-refresh-secret-key-32-chars-long-parish-lms',
      NODE_ENV: 'test',
    },
    server: {
      deps: {
        inline: [
          'hono',
          '@hono/node-server',
          '@hono/zod-validator',
          '@libsql/client',
          'bcryptjs',
          'drizzle-orm',
          'grammy',
          'jsonwebtoken',
          'web-push',
          'zod',
        ],
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // QUALITY-GATE-1 (2026-08-24): nâng gate từ 40/30/30/40 (thực tế ~65/53/57/66)
      // để chặn regression — dư địa giảm coverage mà gate không bắt là quá rộng.
      // Lưu ý JWT_SECRET ở env trên phải ≥32 ký tự — khớp SEC-HMAC-1.
      thresholds: {
        lines: 55,
        functions: 45,
        branches: 45,
        statements: 55,
      },
    },
  },
})
