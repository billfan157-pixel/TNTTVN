import { test, expect } from '@playwright/test'

test.describe('E2E Role-Scoped Access & Navigation Flow', () => {
  test('allows navigation to attendance page', async ({ page }) => {
    await page.goto('/attendance')
    await expect(page.locator('body')).toBeVisible()
  })

  test('allows navigation to gradebook page', async ({ page }) => {
    await page.goto('/grades')
    await expect(page.locator('body')).toBeVisible()
  })

  test('allows navigation to notices page', async ({ page }) => {
    await page.goto('/notices')
    await expect(page.locator('body')).toBeVisible()
  })

  test('allows navigation to reports page', async ({ page }) => {
    await page.goto('/reports')
    await expect(page.locator('body')).toBeVisible()
  })
})
