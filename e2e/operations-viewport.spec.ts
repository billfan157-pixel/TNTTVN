import { expect, test, type APIRequestContext } from '@playwright/test'
import { authHeaders, getAdminSession, injectSession, testKey } from './helpers'
import { matrixViewports, type MatrixViewportName } from './design-system-matrix'

/**
 * W3.6 (MB-02/MB-05) + W2.2 viewport gate for /operations, run at the two
 * phone widths the audit flagged:
 *  - the event detail deep link (?event=) must open the dialog directly;
 *  - the six-step lifecycle stepper must not overflow its card at 320px;
 *  - the primary transition button must lead a full-width row below sm;
 *  - the document itself must never scroll horizontally.
 */
async function createDraftEvent(request: APIRequestContext, session: Awaited<ReturnType<typeof getAdminSession>>, key: string) {
  const start = new Date(Date.now() + 2 * 86_400_000)
  const end = new Date(start.getTime() + 5 * 3_600_000)
  const response = await request.post('/api/operations/events', {
    headers: { ...authHeaders(session), 'Idempotency-Key': key },
    data: {
      title: key,
      eventType: 'MEETING',
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      timezone: 'Asia/Ho_Chi_Minh',
      visibility: 'INTERNAL',
    },
  })
  expect(response.status()).toBe(201)
  return (await response.json()).data as { id: string; title: string }
}

test('@critical operations deep link + stepper/footer fit 320–390px viewports', async ({ page }, testInfo) => {
  test.setTimeout(150_000)
  const admin = await getAdminSession(page.request)
  const key = testKey(testInfo, 'OPS-VPT')
  const event = await createDraftEvent(page.request, admin, key)
  // Deep-link creation happened server-side; authenticate the browser once.
  await injectSession(page, admin)

  for (const viewportName of ['compact', 'mobile'] as MatrixViewportName[]) {
    await page.setViewportSize(matrixViewports[viewportName])
    // W2.2: ?event=<id> must deep-open the detail dialog without a row click.
    await page.goto(`/operations?event=${event.id}`)
    const dialog = page.getByRole('dialog')
    await expect(dialog, `${viewportName}: deep link opens the event dialog`).toBeVisible({ timeout: 20_000 })
    // W2.2: the linked event's title heads the dialog. The h3 itself is the
    // canary for the 320px header-collapse regression (W3.6): when the
    // shrink-to-fit sheet header overflows, the truncate collapses its width.
    await expect(dialog.getByText(key).first(), `${viewportName}: dialog shows the linked event`).toBeVisible({ timeout: 20_000 })

    const overflow = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }))
    expect(overflow.documentWidth, `${viewportName}: no horizontal page overflow`).toBeLessThanOrEqual(overflow.viewportWidth + 1)

    // MB-02: the lifecycle stepper fits its card (labels wrap, no clipping).
    // Tolerance of 6px absorbs justify-between's fractional-gap rounding
    // (6 fixed columns cannot divide an odd clientWidth exactly) — the
    // original defect this guards was 50px+ of nowrap labels clipping off a
    // 320px sheet, and the document-level assertion above still forbids any
    // real horizontal page scroll.
    const stepper = dialog.locator('[aria-label="Vòng đời sự kiện"]')
    await expect(stepper).toBeVisible()
    const stepperFit = await stepper.evaluate(element => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }))
    expect(stepperFit.scrollWidth, `${viewportName}: stepper fits its card`).toBeLessThanOrEqual(stepperFit.clientWidth + 6)

    // MB-05: the primary transition leads a full-width row on phones.
    const primary = dialog.getByRole('button', { name: 'Bắt đầu lập kế hoạch' })
    await expect(primary).toBeVisible()
    const box = await primary.boundingBox()
    expect(box, `${viewportName}: primary transition button is laid out`).not.toBeNull()
    expect(box!.width, `${viewportName}: primary button is full-width row`).toBeGreaterThanOrEqual(matrixViewports[viewportName].width * 0.8)
  }
})
