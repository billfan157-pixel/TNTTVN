import { expect, test } from '@playwright/test'
import {
  authorizedRequest,
  getAdminSession,
  injectSession,
  testKey,
} from './helpers'

test.describe('Critical persisted business outcomes', () => {
  test('@critical admin creates a class through UI and reload reads the committed class', async ({ page }, testInfo) => {
    const session = await getAdminSession(page.request)
    await injectSession(page, session)
    const key = testKey(testInfo, 'CLS')
    const className = `Lớp ${key}`

    await page.goto('/students')
    await page.getByRole('button', { name: 'Thêm Lớp' }).click()
    const dialog = page.getByRole('dialog', { name: 'Thêm Lớp Học Mới' })
    await dialog.getByLabel('Mã Lớp').fill(key.toUpperCase())
    await dialog.getByLabel('Tên Lớp').fill(className)
    await dialog.getByLabel('Phân Ngành').selectOption('AuNhi')
    await dialog.getByLabel('Niên Học').selectOption('2026-2027')

    const createResponsePromise = page.waitForResponse(response => (
      response.url().endsWith('/api/classes')
      && response.request().method() === 'POST'
    ))
    await dialog.getByRole('button', { name: 'Tạo Mới' }).click()
    const createResponse = await createResponsePromise
    expect(createResponse.status()).toBe(201)
    const createdClass = (await createResponse.json()).data as { id: string }

    const readBack = await authorizedRequest(page.request, session, 'GET', `/api/classes/${createdClass.id}`)
    expect(readBack.status()).toBe(200)
    expect((await readBack.json()).data).toMatchObject({
      id: createdClass.id,
      name: className,
      code: key.toUpperCase(),
      branchId: 'AuNhi',
      academicYearId: '2026-2027',
      parishId: 'gia-ton',
    })

    await expect(page.getByRole('button', { name: `Xem danh sách lớp ${className}` })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('button', { name: `Xem danh sách lớp ${className}` })).toBeVisible()
  })

  test('@critical admin creates a student through UI and reload reads the committed record', async ({ page }, testInfo) => {
    const session = await getAdminSession(page.request)
    await injectSession(page, session)
    const fullName = `Thiếu Nhi ${testKey(testInfo, 'UI')}`

    await page.goto('/students')
    await page.getByRole('button', { name: 'Thêm Mới' }).click()
    const dialog = page.getByRole('dialog', { name: 'Thêm Hồ Sơ Thiếu Nhi Mới' })
    await dialog.getByPlaceholder('VD: Nguyễn Văn An').fill(fullName)
    await dialog.getByText('Lớp Giáo Lý').locator('..').getByRole('combobox').selectOption('CLS-AN-1')

    const createdResponse = page.waitForResponse(response => (
      response.url().endsWith('/api/students')
      && response.request().method() === 'POST'
    ))
    await dialog.getByRole('button', { name: 'Thêm Thiếu Nhi' }).click()
    const created = await createdResponse
    expect(created.status()).toBe(201)
    const createdStudent = (await created.json()).data as { id: string; fullName: string; classId: string }
    expect(createdStudent).toMatchObject({ fullName, classId: 'CLS-AN-1' })

    const readBack = await authorizedRequest(page.request, session, 'GET', `/api/students/${createdStudent.id}`)
    expect(readBack.status()).toBe(200)
    expect((await readBack.json()).data).toMatchObject({ fullName, classId: 'CLS-AN-1', parishId: 'gia-ton' })

    await page.goto('/students')
    await page.getByRole('button', { name: 'Xem danh sách lớp Ấu Nhi 1' }).click()
    await expect(page.getByText(fullName, { exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByText(fullName, { exact: true })).toBeVisible()
  })

  test('@critical grade entry is saved by the backend and survives reload', async ({ page }) => {
    const session = await getAdminSession(page.request)
    await injectSession(page, session)
    await page.goto('/grades')

    await page.getByRole('combobox', { name: 'Chọn lớp cho ma trận điểm' }).selectOption('CLS-TN-1')
    const scoreInput = page.getByRole('textbox', { name: 'Nhập điểm miệng cho Maria Thiếu Nhi E2E' })
    await expect(scoreInput).toBeVisible()

    const savedResponse = page.waitForResponse(response => (
      response.url().endsWith('/api/grades/batch')
      && response.request().method() === 'POST'
    ))
    await scoreInput.fill('8.5')
    await scoreInput.press('Enter')
    expect((await savedResponse).status()).toBe(200)
    await expect(page.getByText(/Đã lưu:/)).toBeVisible()

    const gradesResponse = await authorizedRequest(page.request, session, 'GET', '/api/grades')
    const grades = (await gradesResponse.json()).data as Array<Record<string, unknown>>
    expect(grades).toContainEqual(expect.objectContaining({
      studentId: 'student-e2e-001', academicYear: '2026-2027', semester: 1, scoreOral: 8.5,
    }))

    await page.reload()
    await page.getByRole('combobox', { name: 'Chọn lớp cho ma trận điểm' }).selectOption('CLS-TN-1')
    await expect(page.getByRole('textbox', { name: 'Nhập điểm miệng cho Maria Thiếu Nhi E2E' })).toHaveValue('8.5')
  })

  test('@critical finance income updates both ledger and calculated fund balance', async ({ page }, testInfo) => {
    const session = await getAdminSession(page.request)
    const key = testKey(testInfo, 'FIN')
    const amount = 125_000
    const fundResponse = await authorizedRequest(page.request, session, 'POST', '/api/finances/funds', {
      name: `Quỹ ${key}`,
      code: key.toUpperCase(),
      initialBalance: 0,
      isDefault: false,
    })
    expect(fundResponse.status()).toBe(201)
    const fund = (await fundResponse.json()).data as { id: string }

    await injectSession(page, session)
    await page.goto('/finances')
    await page.getByRole('button', { name: 'Tạo Phiếu Thu' }).click()
    const dialog = page.getByRole('dialog', { name: 'Tạo Phiếu Thu (Nhập Quỹ)' })
    await dialog.getByRole('combobox').first().selectOption(fund.id)
    await dialog.getByPlaceholder('Nhập số tiền (VD: 150000)').fill(String(amount))
    await dialog.getByPlaceholder(/Thu niên liễm Lớp/).fill(`Khoản thu ${key}`)

    const txResponsePromise = page.waitForResponse(response => (
      response.url().endsWith('/api/finances/transactions')
      && response.request().method() === 'POST'
    ))
    await dialog.getByRole('button', { name: 'Lập Phiếu Thu' }).click()
    const txResponse = await txResponsePromise
    expect(txResponse.status()).toBe(201)

    const [fundsResponse, transactionsResponse] = await Promise.all([
      authorizedRequest(page.request, session, 'GET', '/api/finances/funds'),
      authorizedRequest(page.request, session, 'GET', '/api/finances/transactions'),
    ])
    const funds = (await fundsResponse.json()).data as Array<Record<string, unknown>>
    const transactions = (await transactionsResponse.json()).data as Array<Record<string, unknown>>
    expect(funds).toContainEqual(expect.objectContaining({ id: fund.id, currentBalance: amount }))
    expect(transactions).toContainEqual(expect.objectContaining({ title: `Khoản thu ${key}`, amount, type: 'INCOME' }))

    await page.reload()
    const ledger = page.getByLabel('Sổ quỹ giao dịch')
    await expect(ledger).toBeVisible({ timeout: 15_000 })
    await expect(ledger.getByText(`Khoản thu ${key}`, { exact: true })).toBeVisible()
  })
})
