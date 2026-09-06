import { test, expect } from '@playwright/test'
import { authorizedRequest, getAdminSession, PARISH_ID } from './helpers'

test.describe('Brave Davinci E2E - PDF Export and QR Verification', () => {
  test('should render verification page and handle missing parameters', async ({ page }) => {
    await page.goto('/verify')
    await expect(page.locator('h1')).toContainText('Kiểm Tra Chữ Ký Mã QR')
    await expect(page.getByText('Thiếu tham số quét QR')).toBeVisible()
  })

  test('should display verification result UI on valid scan parameters', async ({ page }) => {
    const session = await getAdminSession(page.request)
    const signed = await authorizedRequest(page.request, session, 'POST', '/api/verification/sign', {
      studentId: 'student-e2e-001',
      academicYear: '2026-2027',
      certId: 'E2E-VERIFICATION-CERT',
    })
    expect(signed.status()).toBe(200)
    const data = (await signed.json()).data as {
      parishId: string
      studentId: string
      academicYear: string
      certId: string
      signature: string
    }
    const params = new URLSearchParams({
      parishId: data.parishId,
      studentId: data.studentId,
      academicYear: data.academicYear,
      certId: data.certId,
      sig: data.signature,
    })
    await page.goto(`/verify?${params}`)

    await expect(page.getByText('Chữ ký mã QR hợp lệ')).toBeVisible()
    await expect(page.getByText('Thiếu Nhi E2E', { exact: true })).toBeVisible()
  })

  test('should display a fail-closed result when signature is invalid', async ({ page }) => {
    const params = new URLSearchParams({
      parishId: PARISH_ID,
      studentId: 'student-e2e-001',
      academicYear: '2026-2027',
      certId: 'E2E-INVALID-CERT',
      sig: 'invalidsignature123',
    })
    await page.goto(`/verify?${params}`)

    await expect(page.getByText('Không Xác Nhận Được Chữ Ký')).toBeVisible()
    await expect(page.getByText('Chữ ký hoặc thông tin định danh trong mã QR không hợp lệ.')).toBeVisible()
  })
})
