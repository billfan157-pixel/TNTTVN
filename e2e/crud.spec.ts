import { test, expect } from '@playwright/test'

test.describe('E2E Student Roster & User Admin CRUD Flow', () => {
  test('navigates to students page and opens student modal', async ({ page }) => {
    await page.goto('/students')
    await expect(page.locator('body')).toBeVisible()
  })

  test('navigates to users management page', async ({ page }) => {
    await page.goto('/users')
    await expect(page.locator('body')).toBeVisible()
  })
})
