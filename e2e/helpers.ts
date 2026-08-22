import type { Page } from '@playwright/test'

/**
 * TQ-F2 (audit 2026-08-21): E2E chạy với BACKEND THẬT nên fake-token fixture
 * cũ ('test-token') bị 401 → app redirect về login trước khi assert.
 *
 * Tài khoản (seed bởi scripts/e2e-seed-users.mjs — tự chạy qua e2e-dev.mjs):
 * - `e2e_admin` / E2E_ROLE_PASSWORD (role admin) — FIN-E2E: KHÔNG dùng bill để
 *   không phụ thuộc mật khẩu thật của admin trên DB dev cục bộ.
 * - `e2e_chunhiem` / `e2e_phuta` / `e2e_phuhuynh` / E2E_ROLE_PASSWORD.
 */
export const PARISH_ID = 'gia-ton'
const E2E_ADMIN = 'e2e_admin'
const ROLE_PASSWORD = process.env.E2E_ROLE_PASSWORD || 'E2e-Role-Password-1!'

async function apiLogin(
  page: Page,
  username: string,
  password: string,
): Promise<{ accessToken: string; user: Record<string, unknown> }> {
  const res = await page.request.post('/api/auth/login', {
    data: { username, password, parishId: PARISH_ID },
  })
  if (!res.ok()) {
    throw new Error(
      `E2E login thất bại cho "${username}": HTTP ${res.status()} — chạy 'node scripts/e2e-seed-users.mjs' với SEED_ADMIN_PASSWORD+E2E_ROLE_PASSWORD trước`,
    )
  }
  const json = (await res.json()) as any
  return { accessToken: json.data.accessToken, user: json.data.user }
}

async function injectSession(
  page: Page,
  accessToken: string,
  user: Record<string, unknown>,
): Promise<void> {
  await page.addInitScript(
    ([access, currentUser]) => {
      localStorage.setItem('parish_access_token', access)
      localStorage.setItem('parish_current_user', JSON.stringify(currentUser))
    },
    [accessToken, user] as const,
  )
}

/** Đăng nhập admin E2E riêng (e2e_admin). */
export async function loginAsAdmin(page: Page): Promise<void> {
  const { accessToken, user } = await apiLogin(page, E2E_ADMIN, ROLE_PASSWORD)
  await injectSession(page, accessToken, user)
}

/** Đăng nhập user vai trò được seed bởi e2e-seed-users.mjs. */
export async function loginAsRole(
  page: Page,
  role: 'chunhiem' | 'phuta' | 'phuhuynh',
): Promise<void> {
  const { accessToken, user } = await apiLogin(page, `e2e_${role}`, ROLE_PASSWORD)
  await injectSession(page, accessToken, user)
}
