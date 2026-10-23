import { expect, test } from '@playwright/test'
import { authorizedRequest, getAdminSession, injectSession, testKey } from './helpers'
import { installUiBoot } from './design-system-matrix'

test('desktop grade pagination preserves keyboard edits through real sync and reload', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await installUiBoot(page)
  const session = await getAdminSession(page.request)
  const key = testKey(testInfo, 'PAGE')
  const className = `Lớp ${key}`
  const createdClass = await authorizedRequest(page.request, session, 'POST', '/api/classes', {
    code: key, name: className, branchId: 'ThieuNhi', academicYearId: '2026-2027',
  })
  expect(createdClass.status()).toBe(201)
  const { id: classId } = (await createdClass.json()).data as { id: string }
  const imported = await authorizedRequest(page.request, session, 'POST', '/api/students/import', {
    academicYearId: '2026-2027',
    rows: Array.from({ length: 55 }, (_, index) => ({
      rowIndex: index, holyName: 'Giuse', fullName: `${key} Học sinh ${String(index).padStart(3, '0')}`,
      gender: 'Nam', dateOfBirth: '2015-06-15', parentName: '', parentPhone: '', address: '',
      branch: 'ThieuNhi', className,
    })),
    classMappings: { [className]: classId }, newClasses: [], duplicateActions: {},
  })
  expect(imported.status()).toBe(200)
  const importResult = (await imported.json()).data
  expect(importResult).toMatchObject({ imported: 55, errors: 0 })
  const students = importResult.studentChanges.map((change: { student: { id: string; fullName: string } }) => change.student) as Array<{ id: string; fullName: string }>
  const modalRequests: string[] = []
  page.on('request', request => {
    if (/\/(ExcelGradeImportModal|GradeFormulaConfigModal)\.tsx(?:\?|$)/.test(request.url())) modalRequests.push(request.url())
  })

  await injectSession(page, session)
  await page.goto('/dashboard')
  const navigation = page.getByRole('navigation', { name: 'Điều hướng quản lý' })
  await navigation.getByRole('button', { name: 'Bảng Điểm', exact: true }).click()
  await expect(page).toHaveURL(/\/grades$/)
  await page.getByRole('combobox', { name: 'Chọn lớp cho ma trận điểm' }).selectOption(classId)
  const table = page.getByRole('region', { name: 'Bảng điểm học kỳ', exact: true })
  await expect(table.locator('tbody tr')).toHaveCount(50)
  await expect(table.locator('[data-matrix-cell]')).toHaveCount(300)
  const boundary = table.locator('input[data-matrix-row="49"][data-matrix-col="0"]')
  const firstLabel = (await boundary.getAttribute('aria-label'))!
  const firstStudent = students.find(student => firstLabel.endsWith(student.fullName))!
  expect(firstStudent).toBeDefined()
  await boundary.fill('9.4')
  await boundary.press('ArrowDown')
  const next = table.locator('input[data-matrix-row="50"][data-matrix-col="0"]')
  await expect(next).toBeFocused()
  await expect(table.locator('tbody tr')).toHaveCount(5)
  const nextLabel = (await next.getAttribute('aria-label'))!
  const nextStudent = students.find(student => nextLabel.endsWith(student.fullName))!
  expect(nextStudent).toBeDefined()
  expect(nextStudent.id).not.toBe(firstStudent.id)
  await next.fill('7.6')
  await next.press('ArrowUp')
  await expect(boundary).toBeFocused()
  await expect(boundary).toHaveValue('9.4')

  const expectedGrades = [
    expect.objectContaining({ studentId: firstStudent.id, academicYear: '2026-2027', semester: 1, scoreOral: 9.4 }),
    expect.objectContaining({ studentId: nextStudent.id, academicYear: '2026-2027', semester: 1, scoreOral: 7.6 }),
  ]
  await expect.poll(async () => {
    const response = await authorizedRequest(page.request, session, 'GET', '/api/grades')
    expect(response.status()).toBe(200)
    return (await response.json()).data
  // A write enqueued during an active flow can wait for the existing 30s
  // sync interval; prove the backend outcome through that cycle as well.
  }, { timeout: 60_000 }).toEqual(expect.arrayContaining(expectedGrades))

  // Reload the same URL through a full document navigation. WebKit's reload
  // command can abort before receiving the document response on the CI runner.
  const previousDocument = await page.evaluate(() => performance.timeOrigin)
  await page.goto(page.url())
  expect(await page.evaluate(() => performance.timeOrigin)).not.toBe(previousDocument)
  await page.getByRole('combobox', { name: 'Chọn lớp cho ma trận điểm' }).selectOption(classId)
  await expect(page.getByRole('textbox', { name: firstLabel, exact: true })).toHaveValue('9.4')
  await page.getByRole('navigation', { name: 'Phân trang bảng điểm' }).getByRole('button', { name: 'Trang sau' }).click()
  await expect(page.getByRole('textbox', { name: nextLabel, exact: true })).toHaveValue('7.6')
  expect(modalRequests).toEqual([])
  await page.getByRole('button', { name: 'Cấu hình hệ số điểm', exact: true }).click()
  const formula = page.getByRole('dialog', { name: 'Cấu Hình Công Thức Tính Điểm & Hệ Số', exact: true })
  await expect(formula).toBeVisible()
  await formula.getByRole('button', { name: 'Đóng', exact: true }).click()
  await page.getByRole('button', { name: 'Nhập Excel', exact: true }).click()
  const importDialog = page.getByRole('dialog', { name: 'Import Bảng Điểm Lớp Từ Excel', exact: true })
  const pasteInput = importDialog.getByPlaceholder(/Dán các cột copy từ bảng Excel/)
  await pasteInput.fill('Bản nháp bảng điểm')
  await importDialog.getByRole('button', { name: 'Đóng', exact: true }).first().click()
  await expect(importDialog).toHaveCount(0)
  await page.getByRole('button', { name: 'Nhập Excel', exact: true }).click()
  await expect(pasteInput).toHaveValue('Bản nháp bảng điểm')
  await importDialog.getByRole('button', { name: 'Đóng', exact: true }).first().click()
  await page.screenshot({ path: testInfo.outputPath('grades-desktop.png') })
})
