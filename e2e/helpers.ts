import { createHash } from 'node:crypto'
import type { APIRequestContext, APIResponse, Page, TestInfo } from '@playwright/test'

/**
 * TQ-F2 (audit 2026-08-21): E2E chạy với BACKEND THẬT nên fake-token fixture
 * cũ ('test-token') bị 401 → app redirect về login trước khi assert.
 *
 * Tài khoản (seed bởi scripts/e2e-seed-users.mjs — tự chạy qua e2e-dev.mjs):
 * - `e2e_admin` / E2E_ROLE_PASSWORD (role admin) — FIN-E2E: KHÔNG dùng bill để
 *   không phụ thuộc mật khẩu thật của admin trên DB dev cục bộ.
 * - `e2e_chunhiem` / `e2e_phuta` / `0900000000` (Parent Portal) / E2E_ROLE_PASSWORD.
 */
export const PARISH_ID = 'gia-ton'
const E2E_ADMIN = 'e2e_admin'
const ROLE_PASSWORD = process.env.E2E_ROLE_PASSWORD || 'E2e-Role-Password-1!'
const ROLE_USERNAMES = {
  chunhiem: 'e2e_chunhiem',
  phuta: 'e2e_phuta',
  phuhuynh: '0900000000',
} as const
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

export async function apiLogin(
  request: APIRequestContext,
  username: string,
  password: string,
  parishId = PARISH_ID,
): Promise<E2ESession> {
  const res = await request.post('/api/auth/login', {
    data: { username, password, parishId },
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
  await injectSession(page, await apiLogin(page.request, ROLE_USERNAMES[role], ROLE_PASSWORD))
}

export async function getRoleSession(
  request: APIRequestContext,
  role: keyof typeof ROLE_USERNAMES,
): Promise<E2ESession> {
  return apiLogin(request, ROLE_USERNAMES[role], ROLE_PASSWORD)
}

export function authHeaders(session: E2ESession): Record<string, string> {
  return { Authorization: `Bearer ${session.accessToken}` }
}

export async function authorizedRequest(
  request: APIRequestContext,
  session: E2ESession,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  data?: unknown,
): Promise<APIResponse> {
  return request.fetch(path, {
    method,
    headers: authHeaders(session),
    ...(data === undefined ? {} : { data }),
  })
}

/** Stable inside one attempt; retry gets a new namespace so partial writes cannot collide. */
export function testKey(testInfo: TestInfo, prefix: string): string {
  const digest = createHash('sha256')
    .update(`${testInfo.testId}:${testInfo.retry}`)
    .digest('hex')
    .slice(0, 10)
  return `${prefix}-${digest}`
}

export async function loginThroughStaffPortal(page: Page): Promise<void> {
  await page.goto('/login/nhan-su')
  await page.getByLabel('Tên Đăng Nhập').fill(E2E_ADMIN)
  await page.getByRole('textbox', { name: 'Mật Khẩu', exact: true }).fill(ROLE_PASSWORD)
  await page.getByRole('button', { name: 'Đăng Nhập Ngay' }).click()
  await page.waitForURL(/\/dashboard$/)
}

export async function loginThroughParentPortal(page: Page): Promise<void> {
  await page.goto('/login/phuhuynh')
  await page.getByLabel('Số Điện Thoại Phụ Huynh').fill(ROLE_USERNAMES.phuhuynh)
  await page.getByRole('textbox', { name: 'Mật Khẩu', exact: true }).fill(ROLE_PASSWORD)
  await page.getByRole('button', { name: 'Đăng Nhập Ngay' }).click()
  await page.waitForURL(/\/dashboard$/)
}
