import { expect, test } from '@playwright/test'
import { authorizedRequest, getAdminSession, injectSession, testKey } from './helpers'
import { installUiBoot } from './design-system-matrix'

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test(`${viewport.name} student search recognizes name keys and clearly labels typo suggestions`, async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    await page.setViewportSize(viewport)
    await installUiBoot(page)
    const session = await getAdminSession(page.request)
    const key = testKey(testInfo, 'SEARCH')
    const className = `Lớp ${key}`
    const targetName = `${key} Nguyễn Đình Đức`
    const otherName = `${key} Trần Văn An`
    const createdClass = await authorizedRequest(page.request, session, 'POST', '/api/classes', {
      code: key, name: className, branchId: 'ThieuNhi', academicYearId: '2026-2027',
    })
    expect(createdClass.status()).toBe(201)
    const { id: classId } = (await createdClass.json()).data as { id: string }
    const imported = await authorizedRequest(page.request, session, 'POST', '/api/students/import', {
      academicYearId: '2026-2027',
      rows: [targetName, otherName].map((fullName, rowIndex) => ({
        rowIndex, holyName: 'Giuse', fullName, gender: 'Nam', dateOfBirth: '2015-06-15',
        parentName: '', parentPhone: '', address: '', branch: 'ThieuNhi', className,
      })),
      classMappings: { [className]: classId }, newClasses: [], duplicateActions: {},
    })
    expect(imported.status()).toBe(200)
    expect((await imported.json()).data).toMatchObject({ imported: 2, errors: 0 })

    await injectSession(page, session)
    await page.goto('/students')
    await page.getByRole('button', { name: `Xem danh sách lớp ${className}`, exact: true }).click()
    await expect(page.getByText(targetName, { exact: true })).toBeVisible()
    const search = page.getByRole('textbox', { name: 'Tìm thiếu nhi', exact: true })
    for (const query of ['NĐĐ', 'nguyendinhduc', 'duc giuse nguyen']) {
      await search.fill(query)
      await expect(page.getByText(targetName, { exact: true })).toBeVisible()
      await expect(page.getByText(otherName, { exact: true })).toHaveCount(0)
      await expect(page.getByText(/Đang gợi ý tên gần đúng/)).toHaveCount(0)
    }
    await search.fill('nguyne duc')
    await expect(page.getByText(targetName, { exact: true })).toBeVisible()
    await expect(page.getByRole('status')).toContainText('Đang gợi ý tên gần đúng')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`student-search-${viewport.name}.png`) })

    await search.fill('ZZ999999')
    await expect(page.getByText(targetName, { exact: true })).toHaveCount(0)
    await expect(page.getByText(/Đang gợi ý tên gần đúng/)).toHaveCount(0)
    await page.getByRole('button', { name: 'Xóa tìm kiếm', exact: true }).click()
    await expect(page.getByText(targetName, { exact: true })).toBeVisible()
    await expect(page.getByText(otherName, { exact: true })).toBeVisible()
  })
}
