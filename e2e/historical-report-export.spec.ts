import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { authorizedRequest, getAdminSession, injectSession, testKey } from './helpers'

async function expectOk(response: Awaited<ReturnType<typeof authorizedRequest>>, label: string) {
  expect(response.ok(), `${label}: HTTP ${response.status()}`).toBe(true)
  return response
}

test.describe('Official historical report export authority', () => {
  test('@critical finalized CSV export ignores mutable current class, membership and settings', async ({ page }, testInfo) => {
    const session = await getAdminSession(page.request)
    const key = testKey(testInfo, `HIST-${testInfo.project.name}`)
    const numeric = parseInt(key.slice(-6), 16)
    const startYear = 2100 + (numeric % 500)
    const academicYear = `${startYear}-${startYear + 1}`
    const nextYear = `${startYear + 1}-${startYear + 2}`
    const frozenClassName = `Frozen Class ${key}`

    await expectOk(await authorizedRequest(page.request, session, 'POST', '/api/classes/academic-years', { id: academicYear }), 'create source year')
    await expectOk(await authorizedRequest(page.request, session, 'POST', '/api/classes/academic-years', { id: nextYear }), 'create destination year')
    const sourceClassResponse = await expectOk(await authorizedRequest(page.request, session, 'POST', '/api/classes', {
      code: `S${key.slice(-8)}`,
      name: frozenClassName,
      branchId: 'AuNhi',
      academicYearId: academicYear,
      idempotencyKey: `${key}-source-class`,
    }), 'create source class')
    const sourceClassId = ((await sourceClassResponse.json()) as { data: { id: string } }).data.id
    const destinationClassResponse = await expectOk(await authorizedRequest(page.request, session, 'POST', '/api/classes', {
      code: `D${key.slice(-8)}`,
      name: `Current Class ${key}`,
      branchId: 'AuNhi',
      academicYearId: nextYear,
      idempotencyKey: `${key}-destination-class`,
    }), 'create destination class')
    const destinationClassId = ((await destinationClassResponse.json()) as { data: { id: string } }).data.id

    const studentResponse = await expectOk(await authorizedRequest(page.request, session, 'POST', '/api/students', {
      holyName: 'Maria',
      fullName: `Historical Export ${key}`,
      gender: 'Nữ',
      dateOfBirth: '2015-01-01',
      parentName: 'Synthetic Parent',
      parentPhone: '0901234567',
      address: 'Synthetic address',
      branch: 'AuNhi',
      classId: sourceClassId,
      status: 'Đang học',
      idempotencyKey: `${key}-student`,
    }), 'create student')
    const studentId = ((await studentResponse.json()) as { data: { id: string } }).data.id

    for (const semester of [1, 2] as const) {
      await expectOk(await authorizedRequest(page.request, session, 'POST', '/api/grades', {
        studentId,
        academicYear,
        semester,
        scoreOral: 10,
        scoreFinal: 6,
      }), `write semester ${semester} grade`)
    }
    await expectOk(await authorizedRequest(page.request, session, 'POST', '/api/semester-locks', {
      academicYear, semester: 1, isLocked: true,
    }), 'lock semester 1')
    await expectOk(await authorizedRequest(page.request, session, 'POST', `/api/academic-years/${academicYear}/start-semester-2`), 'start semester 2')
    await expectOk(await authorizedRequest(page.request, session, 'POST', '/api/semester-locks', {
      academicYear, semester: 2, isLocked: true,
    }), 'lock semester 2')
    await expectOk(await authorizedRequest(page.request, session, 'POST', `/api/academic-years/${academicYear}/finalize`), 'finalize year')

    await injectSession(page, session)
    await page.goto('/academic-years')
    const yearCard = page.getByTestId(`academic-year-${academicYear}`)
    await expect(yearCard).toBeVisible()
    const selectYear = yearCard.getByRole('button', { name: 'Chọn Làm Năm Học Hiện Tại' })
    if (await selectYear.count()) await selectYear.click()
    await expect(page.getByText(`Niên Học ${academicYear}`, { exact: false })).toBeVisible()

    await page.getByRole('button', { name: 'Báo Cáo', exact: true }).click()
    await expect(page).toHaveURL(/\/reports$/)
    await expect(page.getByText(`Historical Export ${key}`, { exact: false })).toBeVisible()
    const firstDownloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Xuất CSV' }).nth(1).click()
    const firstDownload = await firstDownloadPromise
    const firstPath = await firstDownload.path()
    expect(firstPath).not.toBeNull()
    const before = await readFile(firstPath!)
    expect(before.toString('utf8')).toContain(frozenClassName)

    await expectOk(await authorizedRequest(page.request, session, 'PUT', `/api/classes/${sourceClassId}`, {
      name: `Mutable Renamed ${key}`,
    }), 'rename mutable source class')
    const evalRes = await authorizedRequest(page.request, session, 'GET', `/api/promotion/evaluate/${studentId}?academicYear=${academicYear}`)
    const evalData = ((await evalRes.json()) as { data: { gpa: number; attendanceRate: number } }).data
    await expectOk(await authorizedRequest(page.request, session, 'POST', '/api/promotion/batch-approve', {
      items: [{
        studentId,
        academicYear,
        targetClassId: sourceClassId,
        nextClassId: destinationClassId,
        newBranch: 'AuNhi',
        gpa: evalData.gpa,
        attendanceRate: evalData.attendanceRate,
      }],
    }), 'promote student to destination year class')
    await expectOk(await authorizedRequest(page.request, session, 'PUT', '/api/settings', {
      gradeWeights: {
        weightOral: 9,
        weightFinal: 1,
        xuatSacThreshold: 10,
        gioiThreshold: 9,
        khaThreshold: 8,
        trungBinhThreshold: 7,
        roundingDecimal: 2,
      },
      attendancePolicy: { excusedWeight: 0 },
      promotionPolicy: { minGpa: 10, minAttendance: 100 },
    }), 'mutate current settings')

    await page.getByRole('button', { name: 'Tổng Quan', exact: true }).click()
    await page.getByRole('button', { name: 'Báo Cáo', exact: true }).click()
    await expect(page.getByText(`Historical Export ${key}`, { exact: false })).toBeVisible()
    const secondDownloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Xuất CSV' }).nth(1).click()
    const secondDownload = await secondDownloadPromise
    const secondPath = await secondDownload.path()
    expect(secondPath).not.toBeNull()
    const after = await readFile(secondPath!)

    expect(after.equals(before)).toBe(true)
  })
})
