import { test, expect } from '@playwright/test'

type Tenant = 'A' | 'B'

const users = {
  A: { id: 'e2e-user-a', username: 'tenant-a', fullName: 'Tenant A Admin', role: 'admin', status: 'ACTIVE', parishId: 'parish-a' },
  B: { id: 'e2e-user-b', username: 'tenant-b', fullName: 'Tenant B Admin', role: 'admin', status: 'ACTIVE', parishId: 'parish-b' },
} as const

const students = {
  A: [{ id: 'student-a', code: 'A-001', holyName: 'Maria A', fullName: 'Student Only A', classId: 'class-a', parishId: 'parish-a', status: 'Đang học' }],
  B: [{ id: 'student-b', code: 'B-001', holyName: 'Maria B', fullName: 'Student Only B', classId: 'class-b', parishId: 'parish-b', status: 'Đang học' }],
} as const

async function seedUser(page: Parameters<typeof test>[0]['page'], tenant: Tenant) {
  await page.addInitScript((user) => {
    localStorage.clear()
    localStorage.setItem('parish_current_user', JSON.stringify(user))
  }, users[tenant])
}

async function installTenantApi(page: Parameters<typeof test>[0]['page'], getTenant: () => Tenant) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    if (!url.pathname.startsWith('/api/')) {
      await route.continue()
      return
    }
    const tenant = getTenant()
    const user = users[tenant]

    if (url.pathname.endsWith('/auth/refresh')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { accessToken: `e2e-token-${tenant}` } }) })
      return
    }

    if (url.pathname.endsWith('/auth/me')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: user }),
      })
      return
    }

    if (url.pathname.endsWith('/students')) {
      const data = tenant === 'B' && url.searchParams.get('empty') === '1' ? [] : students[tenant]
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) })
      return
    }

    if (url.pathname.endsWith('/classes')) {
      const data = [{ id: `class-${tenant.toLowerCase()}`, name: `Class Only ${tenant}`, parishId: user.parishId, branchId: 'branch-1', academicYearId: 'year-1', assistants: [], studentCount: 1 }]
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) })
      return
    }

    if (url.pathname.endsWith('/notices')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) })
      return
    }

    if (url.pathname.endsWith('/settings')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {} }) })
      return
    }

    if (url.pathname.endsWith('/academic-years')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) })
      return
    }

    if (url.pathname.endsWith('/purge-version')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { purgeVersion: 1 } }) })
      return
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) })
  })
}

test.describe('Frontend tenant transition and cache isolation', () => {
  test('switching parish does not render tenant A students/classes in tenant B', async ({ page }) => {
    let tenant: Tenant = 'A'
    await installTenantApi(page, () => tenant)
    await seedUser(page, 'A')

    await page.goto('/students')
    await page.getByRole('button', { name: /Class Only A/ }).click()
    await expect(page.getByText('Student Only A')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('Student Only B')).not.toBeVisible()

    tenant = 'B'
    await page.evaluate((user) => {
      localStorage.removeItem('parish_current_user')
      localStorage.setItem('parish_current_user', JSON.stringify(user))
    }, users.B)
    await page.reload()

    await page.getByRole('button', { name: /Class Only B/ }).click()
    await expect(page.getByText('Student Only B')).toBeVisible()
    await expect(page.getByText('Student Only A')).not.toBeVisible()
    await expect(page.getByText('Class Only A')).not.toBeVisible()
  })

  test('tenant B authoritative empty response clears visible tenant A cache', async ({ page }) => {
    let tenant: Tenant = 'A'
    await installTenantApi(page, () => tenant)
    await seedUser(page, 'A')

    await page.goto('/students')
    await page.getByRole('button', { name: /Class Only A/ }).click()
    await expect(page.getByText('Student Only A')).toBeVisible({ timeout: 15000 })

    tenant = 'B'
    await page.evaluate((user) => {
      localStorage.removeItem('parish_current_user')
      localStorage.setItem('parish_current_user', JSON.stringify(user))
    }, users.B)
    await page.route('**/api/students**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) })
    })
    await page.reload()

    await expect(page.getByText('Student Only A')).not.toBeVisible()
    await expect(page.locator('body')).toContainText(/0\s*em|Không có dữ liệu|Chưa có thiếu nhi/i, { timeout: 10000 })
  })

  test.skip('offline reload under tenant B does not hydrate tenant A, then online sync loads B', async ({ page }) => {
    let tenant: Tenant = 'A'
    await installTenantApi(page, () => tenant)
    await seedUser(page, 'A')

    await page.goto('/students')
    await expect(page.getByText('Student Only A')).toBeVisible({ timeout: 15000 })

    tenant = 'B'
    await page.evaluate((user) => {
      localStorage.removeItem('parish_current_user')
      localStorage.setItem('parish_current_user', JSON.stringify(user))
    }, users.B)
    await page.context().setOffline(true)
    await page.reload()

    await expect(page.getByText('Student Only A')).not.toBeVisible()
    await page.context().setOffline(false)
    await page.reload()
    await expect(page.getByText('Student Only B')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('Student Only A')).not.toBeVisible()
  })

  test('persisted keys are scoped and no legacy unscoped entity cache is read', async ({ page }) => {
    let tenant: Tenant = 'A'
    await installTenantApi(page, () => tenant)
    await seedUser(page, 'A')
    await page.goto('/students')
    await page.getByRole('button', { name: /Class Only A/ }).click()
    await expect(page.getByText('Student Only A')).toBeVisible({ timeout: 15000 })

    const keys = await page.evaluate(async () => {
      const request = indexedDB.open('ParishDB')
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      const transaction = db.transaction('stores', 'readonly')
      const rows = await new Promise<Array<{ key: string }>>((resolve, reject) => {
        const req = transaction.objectStore('stores').getAllKeys()
        req.onsuccess = () => resolve((req.result as IDBValidKey[]).map(key => ({ key: String(key) })))
        req.onerror = () => reject(req.error)
      })
      db.close()
      return rows.map(row => row.key)
    })

    expect(keys.some(key => key === 'parish_store_students')).toBe(false)
    expect(keys.some(key => key.includes('parish-a:e2e-user-a'))).toBe(true)
  })
})
