import { expect, test } from '@playwright/test'
import { loginAsAdmin, loginAsRole } from './helpers'

/**
 * Landing (trang giới thiệu `/`) — mặt tiền public đứng trước mọi cổng đăng nhập.
 * Axe + tràn viewport đã được bao bởi ma trận dùng chung (a11y.spec,
 * design-system-visual.spec qua `publicDesignRoutes`); spec này chỉ giữ các
 * hành vi chức năng nhẹ: render public, điều hướng cổng, redirect session sống.
 */
test.describe('Landing giới thiệu trước đăng nhập', () => {
  test('@critical khách chưa đăng nhập thấy trang giới thiệu tại /', async ({ page }) => {
    await page.goto('/')

    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 })
    await expect(page.getByRole('heading', { level: 1, name: /quản lý giáo lý/i })).toBeVisible()
    // Trang giới thiệu, không phải portal chooser của /login
    await expect(page.getByRole('button', { name: /bắt đầu đăng nhập/i }).first()).toBeVisible()
    await expect(page.getByText('Năm ngành sinh hoạt TNTT')).toBeVisible()
  })

  test('CTA hero dẫn tới cổng chọn đăng nhập', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /bắt đầu đăng nhập/i }).first().click()
    await expect(page).toHaveURL(/\/login$/, { timeout: 15_000 })
    await expect(page.locator('.auth-card')).toBeVisible()
    await expect(page.getByText('Cổng Phụ Huynh')).toBeVisible()
  })

  test('thẻ cổng điều hướng đúng portal nhân sự / phụ huynh', async ({ page }) => {
    await page.goto('/')

    const portals = page.locator('#cong-dang-nhap')
    await portals.getByRole('button', { name: 'Đăng nhập phụ huynh' }).click()
    await expect(page).toHaveURL(/\/login\/phuhuynh$/, { timeout: 15_000 })

    await page.goto('/')
    await page.locator('#cong-dang-nhap').getByRole('button', { name: /đăng nhập glv & huynh trưởng/i }).first().click()
    await expect(page).toHaveURL(/\/login\/nhan-su$/, { timeout: 15_000 })
  })

  test('@critical session nhân sự mở app vẫn thấy landing trước, CTA vào thẳng dashboard', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/')
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 })
    await expect(page.getByRole('heading', { level: 1, name: /quản lý giáo lý/i })).toBeVisible()
    await page.getByRole('button', { name: /vào hệ thống/i }).first().click()
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 })
  })

  test('session phụ huynh mở app vẫn thấy landing trước, CTA về cổng phụ huynh', async ({ page }) => {
    await loginAsRole(page, 'phuhuynh')
    await page.goto('/')
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 })
    await page.getByRole('button', { name: /vào hệ thống/i }).first().click()
    await expect(page).toHaveURL(/\/parent$/, { timeout: 15_000 })
  })

  test('@mobile viewport nhỏ nhất không tràn ngang và CTA đủ 44px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 })
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: /quản lý giáo lý/i })).toBeVisible()

    const overflow = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    }))
    expect(overflow.documentWidth, 'document must not overflow the visual viewport').toBeLessThanOrEqual(overflow.viewportWidth + 1)

    const cta = page.getByRole('button', { name: /bắt đầu đăng nhập/i }).first()
    const box = await cta.boundingBox()
    expect(box?.height).toBeGreaterThanOrEqual(44)
  })

  test('hiển thị dải số liệu 5/3/2/1, FAQ tương tác và cam kết dữ liệu giáo xứ', async ({ page }) => {
    await page.goto('/')

    // Stats strip
    const stats = page.getByRole('region', { name: 'Thông số hệ thống' })
    await expect(stats).toBeVisible()
    await expect(stats.getByText('5', { exact: true })).toBeVisible()
    await expect(stats.getByText('3', { exact: true })).toBeVisible()
    await expect(stats.getByText('2', { exact: true })).toBeVisible()
    await expect(stats.getByText('1', { exact: true })).toBeVisible()

    // FAQ Accordion
    const faqHeading = page.getByRole('heading', { level: 2, name: /câu hỏi thường gặp/i })
    await expect(faqHeading).toBeVisible()
    const q1Btn = page.getByRole('button', { name: /làm thế nào để tôi có tài khoản/i })
    await expect(q1Btn).toBeVisible()
    await expect(q1Btn).toHaveAttribute('aria-expanded', 'false')

    // Click to expand question 1
    await q1Btn.click()
    await expect(q1Btn).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByText(/tài khoản do ban giáo lý/i)).toBeVisible()

    // Title: Lần đầu đến với Catevia?
    await expect(page.getByRole('heading', { level: 2, name: /lần đầu đến với catevia\?/i })).toBeVisible()

    // Frosted Glass Parish Identity Panel trên ảnh tập thể
    const glassFigure = page.getByRole('figure')
    await expect(glassFigure).toBeVisible()
    await expect(glassFigure.getByText('Xứ Đoàn Đức Mẹ Fatima').first()).toBeVisible()
    await expect(glassFigure.getByText('Bổn mạng Xứ Đoàn')).toBeVisible()
    await expect(glassFigure.getByText('4 Tôn Chỉ TNTT')).toBeVisible()

    // Footer commitment
    await expect(page.getByText(/dữ liệu thuộc về xứ đoàn đức mẹ fatima — giáo xứ gia tôn/i)).toBeVisible()
    await expect(page.getByText(/không chia sẻ cho bên thứ ba/i)).toBeVisible()
  })
})
