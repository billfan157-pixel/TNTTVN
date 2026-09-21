import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { getAdminSession, injectSession } from './helpers'
import {
  installUiBoot,
  matrixViewports,
  assertParishRecordEditorLayout,
  openParishRecordEditor,
  openPublicObservation,
  openProtectedObservation,
  publicDesignRoutes,
  representativeProtectedRoutes,
  setThemeThroughHeader,
  type MatrixTheme,
  type MatrixViewportName,
} from './design-system-matrix'

const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']
type AxeResults = Awaited<ReturnType<AxeBuilder['analyze']>>

const formatViolations = (violations: AxeResults['violations']) => (
  violations.map(violation => {
    const nodes = violation.nodes.map(node => {
      const targets = node.target.map(target => String(target)).join(', ')
      const messages = [...node.any, ...node.all, ...node.none].map(check => check.message).filter(Boolean).join('; ')
      return `  ${targets}\n    ${node.html}${messages ? `\n    ${messages}` : ''}`
    }).join('\n')
    return `[${violation.impact ?? 'unknown'}] ${violation.id}: ${violation.help}\n${nodes}`
  }).join('\n')
)

const isContextDestroyedError = (err: unknown): boolean =>
  /execution context was destroyed/i.test(err instanceof Error ? err.message : String(err))

/**
 * CI-root-cause (2026-09-04): axe scan dài vài giây; nếu SPA điều hướng giữa
 * chừng (race hạ tầng — quan sát 1 lần/~200 observations), analyze nổ
 * "Execution context was destroyed" và CI `failOnFlakyTests` đỏ cả build dù
 * retry pass. Không dùng test-retry (vẫn đỏ gate) — settle trước scan, và nếu
 * context chết thì dựng LẠI ĐÚNG observation rồi scan một lần. Violations vẫn
 * fail thật; lỗi thứ hai vẫn throw. Không che instability của route.
 */
const runAxeStable = async (
  page: Page,
  testInfo: TestInfo,
  artifactName: string,
  reopen: () => Promise<unknown>,
) => {
  // Đóng cửa sổ race phổ biến: request đang bay hoàn tất rồi mới scan.
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
  try {
    return await analyzeOnce(page, testInfo, artifactName)
  } catch (err) {
    if (!isContextDestroyedError(err)) throw err
    await reopen()
    return await analyzeOnce(page, testInfo, `${artifactName}-reopened`)
  }
}

const analyzeOnce = async (page: Page, testInfo: TestInfo, artifactName: string) => {
  const results = await new AxeBuilder({ page })
    .withTags(wcagTags)
    .analyze()
  await testInfo.attach(`axe-${artifactName}.json`, {
    body: Buffer.from(JSON.stringify(results, null, 2)),
    contentType: 'application/json',
  })
  return results
}

test.describe('Accessibility runtime gate — WCAG 2.2 AA automated subset', () => {
  test.describe.configure({ timeout: 240_000 })

  test('protected route viewport/theme matrix', async ({ page }, testInfo) => {
    const failedObservations: string[] = []
    await installUiBoot(page)
    await injectSession(page, await getAdminSession(page.request))
    await page.goto('/dashboard')

    for (const viewportName of Object.keys(matrixViewports) as MatrixViewportName[]) {
      for (const theme of ['light', 'dark'] as const) {
        await setThemeThroughHeader(page, theme)
        for (const route of representativeProtectedRoutes) {
          await openProtectedObservation(page, route, viewportName, `${viewportName}/${theme}`)
          await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /\bdark\b/ : /^(?!.*\bdark\b)/)
          const artifactName = `${route.slice(1)}-${viewportName}-${theme}`
          const results = await runAxeStable(page, testInfo, artifactName,
            () => openProtectedObservation(page, route, viewportName, `${viewportName}/${theme}`))
          if (results.violations.length > 0) {
            failedObservations.push(`[${artifactName}]\n${formatViolations(results.violations)}`)
          }

          if (route === '/parish-profile') {
            const dialog = await openParishRecordEditor(page)
            await assertParishRecordEditorLayout(page)
            const modalResults = await runAxeStable(page, testInfo, `${artifactName}-record-editor`,
              () => openParishRecordEditor(page))
            if (modalResults.violations.length > 0) {
              failedObservations.push(`[${artifactName}-record-editor]\n${formatViolations(modalResults.violations)}`)
            }
            await dialog.getByRole('button', { name: 'Đóng' }).click()
          }

          if (route === '/dashboard' && viewportName === 'desktop' && theme === 'light') {
            await expect(page.locator('a.skip-link')).toHaveAttribute('href', '#main-content')
          }
          if (route === '/dashboard' && viewportName !== 'desktop' && theme === 'light') {
            const activeItem = page.locator('.mobile-bottom-nav__item.is-active').first()
            await expect(activeItem).toHaveAttribute('aria-current', 'page')
            const box = await activeItem.boundingBox()
            expect(box?.height).toBeGreaterThanOrEqual(44)
            expect(box?.width).toBeGreaterThanOrEqual(44)
          }
          if (route === '/students' && viewportName === 'desktop' && theme === 'light') {
            const input = page.getByPlaceholder('Tìm theo tên, mã thiếu nhi...')
            await input.pressSequentially('Nguyen', { delay: 25 })
            await expect(input).toBeFocused()
            await expect(input).toHaveValue('Nguyen')
          }
        }
      }
    }

    expect(failedObservations, failedObservations.join('\n\n')).toEqual([])
  })

  for (const publicRoute of publicDesignRoutes) {
    for (const viewportName of Object.keys(matrixViewports) as MatrixViewportName[]) {
      for (const theme of ['light', 'dark'] as const) {
        test(`${publicRoute.route} · ${viewportName} · ${theme}`, async ({ page }, testInfo) => {
          await page.setViewportSize(matrixViewports[viewportName])
          await installUiBoot(page, theme as MatrixTheme)
          await openPublicObservation(page, publicRoute, `${viewportName}/${theme}`)
          const artifactName = `${publicRoute.artifact}-${viewportName}-${theme}`
          const results = await runAxeStable(page, testInfo, artifactName,
            () => openPublicObservation(page, publicRoute, `${viewportName}/${theme}`))
          expect(results.violations, formatViolations(results.violations)).toEqual([])

          if (publicRoute.route === '/login/phuhuynh') {
            await page.getByRole('button', { name: 'Quên mật khẩu?' }).click()
            await expect(page.getByRole('dialog', { name: 'Khôi Phục Tài Khoản An Toàn' })).toBeVisible()
            await page.waitForTimeout(300)
            const modalResults = await runAxeStable(page, testInfo, `parent-forgot-password-${viewportName}-${theme}`,
              async () => {
                await page.getByRole('button', { name: 'Quên mật khẩu?' }).click()
                await expect(page.getByRole('dialog', { name: 'Khôi Phục Tài Khoản An Toàn' })).toBeVisible()
                await page.waitForTimeout(300)
              })
            expect(modalResults.violations, formatViolations(modalResults.violations)).toEqual([])
          }
        })
      }
    }
  }

})
