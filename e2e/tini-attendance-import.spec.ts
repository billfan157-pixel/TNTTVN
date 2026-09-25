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

    const candidatesResponse = await authorizedRequest(
      page.request, session, 'GET', '/api/tini-attendance-import/candidates?year=2026-2027',
    )
    expect(candidatesResponse.status(), await candidatesResponse.text()).toBe(200)
    const candidates = (await candidatesResponse.json()).data as {
      classes: { id: string; name: string }[]
      students: { id: string; classId: string; fullName: string }[]
    }
    const targetStudent = candidates.students.find(item => item.id === 'student-e2e-002')
    expect(targetStudent).toBeTruthy()
    const targetClass = candidates.classes.find(item => item.id === targetStudent!.classId)
    expect(targetClass).toBeTruthy()
    const studentResponse = await authorizedRequest(page.request, session, 'GET', `/api/students/${targetStudent!.id}`)
    expect(studentResponse.status(), await studentResponse.text()).toBe(200)
    const studentProfile = (await studentResponse.json()).data as { dateOfBirth: string }

    const observation = {
      externalStudentId, studentName: targetStudent!.fullName, externalClassId,
      dateOfBirth: studentProfile.dateOfBirth, className: targetClass!.name,
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
