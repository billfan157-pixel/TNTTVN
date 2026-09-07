import { expect, test, type Page } from '@playwright/test'
import { authorizedRequest, getAdminSession, getRoleSession, injectSession } from './helpers'

// Observe real encrypted IndexedDB without mutating application stores or
// substituting API responses. Only synthetic sandbox data is decrypted here.
async function academicCache(page: Page, userId: string, entity: 'grades' | 'attendance') {
  return page.evaluate(async ({ userId, entity }) => {
    const opened = indexedDB.open('ParishDB')
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      opened.onsuccess = () => resolve(opened.result)
      opened.onerror = () => reject(opened.error)
    })
    const read = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      const key = `parish_store_${entity}:gia-ton:${userId}`
      const tx = database.transaction(['stores', 'cryptoKeys'], 'readonly')
      const [row, keys] = await Promise.all([
        read(tx.objectStore('stores').get(key)),
        read(tx.objectStore('cryptoKeys').getAll()),
      ])
      if (!row) return null
      if (!row.value.startsWith('enc:v1:')) throw new Error('Academic cache is not encrypted')
      const [iv, ciphertext] = row.value.slice(7).split('.').map((part: string) =>
        Uint8Array.from(atob(part), char => char.charCodeAt(0)))
      let plaintext: string | undefined
      for (const candidate of keys) {
        try {
          plaintext = new TextDecoder().decode(await crypto.subtle.decrypt({
            name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(`stores:${key}`),
          }, candidate.key, ciphertext))
          break
        } catch { /* Key rotation: try another retained key, never report empty on failure. */ }
      }
      if (plaintext === undefined) throw new Error('Cannot decrypt academic cache')
      const cache = JSON.parse(plaintext)
      return { version: cache.version, revision: cache.state.syncScopeRevision,
        studentIds: cache.state[entity].map((record: { studentId: string }) => record.studentId) as string[] }
    } finally { database.close() }
  }, { userId, entity })
}

test('@critical reconnect retracts revoked Grade and Attendance caches without deleting server history', async ({ page, context, request }) => {
  const admin = await getAdminSession(request)
  const staff = await getRoleSession(page.request, 'phuta')
  const userId = String(staff.user.id)
  const roster = await authorizedRequest(request, admin, 'GET', '/api/users?limit=10000')
  expect(roster.status()).toBe(200)
  const actor = (await roster.json()).data.find((user: { id: string }) => user.id === userId)
  const originalAssignments = actor.assignedClasses as string[]
  expect(originalAssignments).toContain('CLS-TN-1')

  const unlocked = await authorizedRequest(request, admin, 'POST', '/api/semester-locks', {
    academicYear: '2026-2027', semester: 1, isLocked: false, unlockReason: 'E2E scope retraction isolation',
  })
  expect(unlocked.status()).toBe(200)

  // Own historical test inputs; do not depend on scores from another spec.
  const grade = await authorizedRequest(request, admin, 'POST', '/api/grades', {
    studentId: 'student-e2e-001', academicYear: '2025-2026', semester: 1, scoreFinal: 8,
  })
  expect(grade.status()).toBe(200)
  const attendance = await authorizedRequest(request, admin, 'POST', '/api/attendance', {
    studentId: 'student-e2e-001', date: '2026-08-16', type: 'SundayMass', status: 'Present',
  })
  expect(attendance.status(), await attendance.text()).toBe(201)
  await injectSession(page, staff)
  await page.goto('/grades')
  await expect(page.getByRole('combobox', { name: 'Chọn lớp cho ma trận điểm' })).toBeVisible()
  for (const entity of ['grades', 'attendance'] as const) {
    await expect.poll(async () => (await academicCache(page, userId, entity))?.studentIds).toContain('student-e2e-001')
  }

  try {
    await context.setOffline(true)
    const revoke = await authorizedRequest(request, admin, 'PUT', `/api/users/${userId}/assignments`, { assignedClasses: [] })
    expect(revoke.status()).toBe(200)
    // Revocation cannot erase a disconnected device. Reconnect must reconcile it.
    expect((await academicCache(page, userId, 'grades'))?.studentIds).toContain('student-e2e-001')
    const pulls = ['grades', 'attendance'].map(entity => page.waitForResponse(response => {
      const url = new URL(response.url())
      return url.pathname === `/api/${entity}` && url.searchParams.get('includeScope') === 'true'
        && response.request().method() === 'GET'
    }))
    await context.setOffline(false)
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    for (const pull of await Promise.all(pulls)) {
      expect(pull.status()).toBe(200)
      expect((await pull.json()).data).toMatchObject({ mode: 'full', records: [], scope: { studentIds: [] } })
    }
    for (const entity of ['grades', 'attendance'] as const) {
      await expect.poll(async () => (await academicCache(page, userId, entity))?.studentIds).toEqual([])
      expect((await academicCache(page, userId, entity))?.version).toBe(2)
    }
    await page.reload()
    await expect(page.getByRole('combobox', { name: 'Chọn lớp cho ma trận điểm' })).toBeVisible()
    for (const entity of ['grades', 'attendance'] as const) {
      expect((await academicCache(page, userId, entity))?.studentIds).toEqual([])
      const history = await authorizedRequest(request, admin, 'GET', `/api/${entity}`)
      expect(history.status()).toBe(200)
      expect((await history.json()).data).toContainEqual(expect.objectContaining({ studentId: 'student-e2e-001' }))
    }
  } finally {
    await context.setOffline(false)
    const restore = await authorizedRequest(request, admin, 'PUT', `/api/users/${userId}/assignments`, { assignedClasses: originalAssignments })
    expect(restore.status()).toBe(200)
  }
})
