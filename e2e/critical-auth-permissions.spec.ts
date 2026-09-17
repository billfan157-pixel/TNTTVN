import { expect, test } from '@playwright/test'
import {
  authorizedRequest,
  getAdminSession,
  getRoleSession,
  injectSession,
  loginThroughParentPortal,
  loginThroughStaffPortal,
} from './helpers'

test.describe('Critical authentication, session and authorization journeys', () => {
  test('@critical staff login survives reload and explicit logout closes the client session', async ({ page }) => {
    await test.step('sign in through the real staff portal', async () => {
      await loginThroughStaffPortal(page)
      await expect(page.getByText('E2E Admin', { exact: true })).toBeVisible()
    })

    await test.step('reload and prove the authenticated backend identity is retained', async () => {
      const refreshResponse = page.waitForResponse(response => (
        response.url().endsWith('/api/auth/refresh')
        && response.request().method() === 'POST'
      ))
      await page.reload()
      expect((await refreshResponse).status()).toBe(200)
      await expect(page).toHaveURL(/\/dashboard$/)
      await expect(page.getByText('E2E Admin', { exact: true })).toBeVisible()
      const localSession = await page.evaluate(() => ({
        legacyToken: localStorage.getItem('parish_access_token'),
        marker: JSON.parse(localStorage.getItem('parish_current_user') || 'null'),
      }))
      expect(localSession.legacyToken).toBeNull()
      expect(localSession.marker).toMatchObject({ role: 'admin', parishId: 'gia-ton' })
    })

    await test.step('logout removes the local session and protected navigation fails closed', async () => {
      const logoutResponse = page.waitForResponse(response => response.url().endsWith('/api/auth/logout'))
      await page.getByRole('button', { name: 'Đăng xuất' }).click()
      const response = await logoutResponse
      expect(response.status()).toBe(200)
      expect((await response.json()).data.serverConfirmed).toBe(true)
      await expect(page).toHaveURL(/\/login$/)
      expect((await page.context().cookies()).filter(cookie => cookie.name === 'parish_refresh')).toHaveLength(0)
      await expect.poll(() => page.evaluate(() => ({
        token: localStorage.getItem('parish_access_token'),
        marker: localStorage.getItem('parish_current_user'),
      }))).toEqual({ token: null, marker: null })
      await page.goto('/students')
      await expect(page).toHaveURL(/\/login$/)
    })
  })

  test('@critical two tabs queue refresh behind the same browser lock and keep a valid session', async ({ page, context }) => {
    test.setTimeout(60000)
    await loginThroughStaffPortal(page)
    const second = await context.newPage()
    await second.goto('/dashboard')
    await expect(second.getByText('E2E Admin', { exact: true })).toBeVisible()
    const control = await context.newPage()
    await control.goto('/login')
    // Hold the real browser lock so both reloads must queue, without timing sleeps.
    await control.evaluate(() => new Promise<void>(ready => {
      void navigator.locks.request('catevia-refresh-session', () => new Promise<void>(release => {
        (window as unknown as { releaseAuthTestLock: () => void }).releaseAuthTestLock = release
        ready()
      }))
    }))
    const firstResponse = page.waitForResponse(r => r.url().endsWith('/api/auth/refresh'))
    const secondResponse = second.waitForResponse(r => r.url().endsWith('/api/auth/refresh'))
    const reloads = Promise.all([page.reload(), second.reload()])
    try {
      await expect.poll(() => control.evaluate(async () => {
        const locks = await navigator.locks.query()
        return locks.pending?.filter(lock => lock.name === 'catevia-refresh-session').length || 0
      })).toBeGreaterThanOrEqual(2)
    } finally {
      await control.evaluate(() => (window as unknown as { releaseAuthTestLock: () => void }).releaseAuthTestLock())
    }
    await reloads
    expect((await firstResponse).status()).toBe(200)
    expect((await secondResponse).status()).toBe(200)
    await expect(page.getByText('E2E Admin', { exact: true })).toBeVisible()
    await expect(second.getByText('E2E Admin', { exact: true })).toBeVisible()
    expect((await page.request.post('/api/auth/refresh')).status()).toBe(200)
    await control.close()
    await second.close()
  })

  test('@critical @mobile parent portal returns only linked children and cannot use staff APIs', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await loginThroughParentPortal(page)
    await page.goto('/parent')

    await expect(page.getByRole('button', { name: /Maria Thiếu Nhi E2E Thiếu Nhi/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Thiếu Nhi E2E Khác/ })).toHaveCount(0)

    const parentSession = await getRoleSession(page.request, 'phuhuynh')
    const headers = { Authorization: `Bearer ${parentSession.accessToken}` }

    const children = await page.request.get('/api/parents/my-children', { headers })
    expect(children.status()).toBe(200)
    const childRows = (await children.json()).data as Array<{ id: string; fullName: string }>
    expect(childRows).toEqual([
      expect.objectContaining({ id: 'student-e2e-001', fullName: 'Thiếu Nhi E2E' }),
    ])

    const roster = await page.request.get('/api/students', { headers })
    const foreignStudent = await page.request.get('/api/students/student-e2e-002', { headers })
    const grades = await page.request.get('/api/grades', { headers })
    const attendance = await page.request.get('/api/attendance', { headers })
    expect(roster.status()).toBe(403)
    expect(foreignStudent.status()).toBe(403)
    expect(grades.status()).toBe(403)
    expect(attendance.status()).toBe(403)
  })

  test('@critical backend permission boundaries reject valid-shaped unauthorized mutations', async ({ request, page }) => {
    const [admin, chunhiem, phuta, parent] = await Promise.all([
      getAdminSession(request),
      getRoleSession(request, 'chunhiem'),
      getRoleSession(request, 'phuta'),
      getRoleSession(request, 'phuhuynh'),
    ])

    const denied = await Promise.all([
      authorizedRequest(request, phuta, 'POST', '/api/finances/funds', {
        name: 'Quỹ không được phép', code: 'DENIED', initialBalance: 0, isDefault: false,
      }),
      authorizedRequest(request, phuta, 'POST', '/api/classes', {
        name: 'Lớp không được phép', code: 'DENIED', branchId: 'AuNhi', academicYearId: '2026-2027',
      }),
      authorizedRequest(request, parent, 'POST', '/api/grades', {
        studentId: 'student-e2e-001', academicYear: '2026-2027', semester: 1, scoreOral: 10,
      }),
      authorizedRequest(request, chunhiem, 'PUT', '/api/students/student-e2e-002', {
        fullName: 'Mutation must not persist',
      }),
    ])
    expect(denied.map(response => response.status())).toEqual([403, 403, 403, 403])

    const unchanged = await authorizedRequest(request, admin, 'GET', '/api/students/student-e2e-002')
    expect(unchanged.status()).toBe(200)
    expect((await unchanged.json()).data.fullName).toBe('Thiếu Nhi E2E Khác')

    await injectSession(page, phuta)
    await page.goto('/finances')
    await expect(page).toHaveURL(/\/dashboard$/)
  })
})
