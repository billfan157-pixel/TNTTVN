import type { APIRequestContext, Page } from '@playwright/test'

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
let loginClientSequence = 0

function nextLoginClientIp() {
  // Every Playwright context models a separate client. Include the worker PID
  // so a restarted worker never reuses the previous worker's limiter bucket.
  loginClientSequence += 1
  return `198.18.${process.pid % 250}.${(loginClientSequence % 249) + 1}`
}

export interface E2ESession {
  accessToken: string
  user: Record<string, unknown>
  cookies: Awaited<ReturnType<APIRequestContext['storageState']>>['cookies']
}

async function apiLogin(
  request: APIRequestContext,
  username: string,
  password: string,
): Promise<E2ESession> {
  const res = await request.post('/api/auth/login', {
    data: { username, password, parishId: PARISH_ID },
    headers: { 'x-real-ip': nextLoginClientIp() },
  })
  if (!res.ok()) {
    throw new Error(
      `E2E login thất bại cho "${username}": HTTP ${res.status()} — kiểm tra log seed-before-ready của isolated Playwright harness`,
    )
  }
  const json = (await res.json()) as any
  const { cookies } = await request.storageState()
  return { accessToken: json.data.accessToken, user: json.data.user, cookies }
}

export async function injectSession(
  page: Page,
  session: E2ESession,
): Promise<void> {
  const { accessToken, user, cookies } = session
  await page.context().addCookies(cookies)
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
  await injectSession(page, await apiLogin(page.request, E2E_ADMIN, ROLE_PASSWORD))
}

/** Login once per worker for route matrices so the security rate limiter stays meaningful. */
export async function getAdminSession(request: APIRequestContext): Promise<E2ESession> {
  return apiLogin(request, E2E_ADMIN, ROLE_PASSWORD)
}

/** Đăng nhập user vai trò được seed bởi e2e-seed-users.mjs. */
export async function loginAsRole(
  page: Page,
  role: 'chunhiem' | 'phuta' | 'phuhuynh',
): Promise<void> {
  await injectSession(page, await apiLogin(page.request, `e2e_${role}`, ROLE_PASSWORD))
}
