import { createHash } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { authorizedRequest, getAdminSession, injectSession, testKey } from './helpers'

test.describe('TINI manual attendance import', () => {
  test('@critical admin previews a local extractor file and commits official Attendance', async ({ page }, testInfo) => {
    test.setTimeout(90_000)
    const session = await getAdminSession(page.request)
    const key = testKey(testInfo, 'TINI').replace(/-/g, '_')
    const externalStudentId = `student_${key}`
    const externalClassId = `l_${key}`
    const date = '2026-09-19'

    const classCode = `TINI${key.replace(/-/g, '').slice(-8)}`
    const classResponse = await authorizedRequest(page.request, session, 'POST', '/api/classes', {
      code: classCode,
      name: `Lớp TINI ${key}`,
      branchId: 'AuNhi',
      academicYearId: '2026-2027',
      idempotencyKey: `${key}-class`,
    })
    expect(classResponse.status()).toBe(201)
    const targetClass = (await classResponse.json()).data as { id: string; name: string }

    const studentResponse = await authorizedRequest(page.request, session, 'POST', '/api/students', {
      holyName: 'Maria',
      fullName: `Thiếu Nhi TINI ${key}`,
      gender: 'Nữ',
      dateOfBirth: '2015-02-02',
      parentName: 'Synthetic Parent',
      parentPhone: `090${String(1000000 + Number.parseInt(key.slice(-6), 16) % 9000000)}`,
      address: 'E2E address',
      branch: 'AuNhi',
      classId: targetClass.id,
      status: 'Đang học',
      idempotencyKey: `${key}-student`,
    })
    expect(studentResponse.status()).toBe(201)
    const targetStudent = (await studentResponse.json()).data as { id: string; fullName: string; dateOfBirth: string }

    const observation = {
      externalStudentId, studentName: targetStudent!.fullName, externalClassId,
      dateOfBirth: targetStudent.dateOfBirth, className: targetClass.name,
      date, sourceTitle: 'Có mặt Thánh lễ', late: false,
      sourceFingerprint: '',
    }
    observation.sourceFingerprint = createHash('sha256').update(JSON.stringify([
      'e2e_year', observation.externalStudentId, observation.externalClassId,
      observation.date, observation.sourceTitle, observation.late,
      observation.studentName, observation.className,
      observation.dateOfBirth,
    ])).digest('hex')
    const sourceFile = JSON.stringify({
      format: 'catevia-tini-dom-attendance', schemaVersion: 3, provider: 'tini',
      extractedAt: '2026-09-19T12:00:00.000Z', sourcePageKind: 'glv-attendance', sourcePath: '/glv',
      academicYear: { externalId: 'e2e_year', label: '2026-2027' },
      scope: { date, filter: 'Hiện diện - Tất cả', externalClassId, className: targetClass!.name },
      partial: false, renderedStudentRows: 1, rowErrors: [], observations: [observation],
    })

    await injectSession(page, session)
    await page.goto('/attendance')
    await page.getByRole('button', { name: /Nhập Điểm Danh TINI/i }).click()
    await page.getByLabel('Tệp xuất từ TINI').setInputFiles({
      name: 'tini-e2e.json', mimeType: 'application/json', buffer: Buffer.from(sourceFile),
    })
    await expect(page.getByRole('heading', { name: 'Đề xuất đối chiếu định danh' })).toBeVisible()
    await page.getByRole('checkbox', { name: `Chọn đề xuất ${externalClassId}` }).check()
    const studentProposalCheckbox = page.getByRole('checkbox', { name: `Chọn đề xuất ${externalStudentId}` })
    await expect(studentProposalCheckbox).toBeVisible()
    await studentProposalCheckbox.scrollIntoViewIfNeeded()
    await studentProposalCheckbox.check()
    await expect(page.getByRole('button', { name: 'Duyệt 2 liên kết đề xuất' })).toBeVisible()
    await page.getByLabel('Lý do duyệt liên kết').fill('E2E reviewed exact name birth date and class')
    const linkResponse = page.waitForResponse(response => (
      response.url().endsWith('/api/tini-attendance-import/links/bulk')
      && response.request().method() === 'POST'
    ))
    await page.getByRole('button', { name: 'Duyệt 2 liên kết đề xuất' }).click()
    expect((await linkResponse).status()).toBe(201)
    await expect(page.getByRole('cell', { name: `${externalStudentId} · ${targetStudent!.fullName}` })).toBeVisible()
    await page.getByRole('checkbox', { name: 'Chọn lượt 1' }).check()
    await page.getByRole('checkbox', { name: /Tôi đã đối chiếu/ }).check()

    const commitResponse = page.waitForResponse(response => (
      response.url().endsWith('/api/tini-attendance-import/commit')
      && response.request().method() === 'POST'
    ))
    await page.getByRole('button', { name: 'Xác nhận nhập 1 lượt' }).click()
    expect((await commitResponse).status()).toBe(200)
    await expect(page.getByText(/Đã xử lý 1 lượt/)).toBeVisible()

    const readBack = await authorizedRequest(
      page.request, session, 'GET',
      `/api/attendance?studentId=${targetStudent!.id}&date=${date}&type=SundayMass`,
    )
    expect(readBack.status(), await readBack.text()).toBe(200)
    expect((await readBack.json()).data).toContainEqual(expect.objectContaining({
      studentId: targetStudent!.id, date, type: 'SundayMass', status: 'Present', version: 1,
    }))
  })
})
