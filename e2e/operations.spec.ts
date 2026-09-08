import { expect, test } from '@playwright/test'
import { apiLogin, authHeaders, getAdminSession, injectSession, testKey } from './helpers'

test('@critical Operations owner handover persists one pending owner and blockout warning', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  const admin = await getAdminSession(page.request)
  const key = testKey(testInfo, 'OPS-HANDOVER')
  const post = async (path: string, body: unknown, suffix: string) => {
    const response = await page.request.post(`/api${path}`, { headers: { ...authHeaders(admin), 'Idempotency-Key': `${key}-${suffix}` }, data: body })
    expect(response.status()).toBe(201)
    return (await response.json()).data
  }
  const snapshot = await page.request.get('/api/parish-profile', { headers: authHeaders(admin) })
  const people = (await snapshot.json()).data.people as Array<{ id: string; linkedUserId: string | null }>
  let personId = people.find(person => person.linkedUserId === 'usr-e2e-phuta')?.id
  if (!personId) personId = (await post('/parish-profile/people', { linkedUserId: 'usr-e2e-phuta', fullName: 'Handover recipient', serviceStatus: 'ACTIVE', visibility: 'STAFF' }, 'person')).id
  const event = await post('/operations/events', { title: key, eventType: 'MEETING', startsAt: '2027-02-01T08:00:00Z', endsAt: '2027-02-01T10:00:00Z', timezone: 'Asia/Ho_Chi_Minh' }, 'event')
  const task = await post('/operations/tasks', { title: `${key}-task`, eventId: event.id, dueAt: '2027-02-01T09:00:00Z' }, 'task')
  await post(`/operations/tasks/${task.id}/assign`, { version: 1, userId: 'usr-e2e-chunhiem', assignmentRole: 'OWNER' }, 'owner')
  const recipient = await apiLogin(page.request, 'e2e_phuta', process.env.E2E_ROLE_PASSWORD || 'E2e-Role-Password-1!')
  const blockout = await page.request.post('/api/operations/blockouts', { headers: { ...authHeaders(recipient), 'Idempotency-Key': `${key}-busy` }, data: { userId: 'usr-e2e-phuta', startsAt: '2027-02-01T08:00:00Z', endsAt: '2027-02-01T10:00:00Z', reason: 'Private E2E reason' } })
  expect(blockout.status()).toBe(201)
  await injectSession(page, admin)
  await page.goto('/operations')
  await page.getByRole('article').filter({ hasText: key }).getByRole('button', { name: 'Xem chi tiết' }).click()
  await page.getByRole('button', { name: 'Checklist', exact: true }).click()
  await page.getByLabel('Người phụ trách mới').selectOption(personId!)
  await page.getByLabel('Lý do bàn giao').fill('Thay đổi lịch trực')
  const acknowledged = page.waitForResponse(response => response.url().endsWith(`/tasks/${task.id}/handover`) && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Xác nhận bàn giao' }).click()
  expect((await acknowledged).status()).toBe(201)
  await expect(page.getByText('Đã lưu phân công, nhưng người được giao có lịch bận tại hạn nhiệm vụ. Cần xác nhận lại khả năng nhận việc.')).toBeVisible()
  await expect(page.getByText('Private E2E reason')).toHaveCount(0)
  const response = await page.request.get(`/api/operations/tasks/${task.id}`, { headers: authHeaders(admin) })
  const owners = (await response.json()).data.assignees.filter((assignment: { assignmentRole: string }) => assignment.assignmentRole === 'OWNER')
  expect(owners).toHaveLength(1)
  expect(owners[0]).toMatchObject({ personId, acknowledgementStatus: 'PENDING' })
  const oldOwner = await apiLogin(page.request, 'e2e_chunhiem', process.env.E2E_ROLE_PASSWORD || 'E2e-Role-Password-1!')
  const mine = await page.request.get('/api/operations/tasks?mine=true', { headers: authHeaders(oldOwner) })
  expect((await mine.json()).data.some((row: { id: string }) => row.id === task.id)).toBe(false)
})

test('@critical Operations standalone approval and evidence persist through UI', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  const admin = await getAdminSession(page.request)
  const key = testKey(testInfo, 'OPS-REVIEW')
  const create = await page.request.post('/api/operations/tasks', { headers: { ...authHeaders(admin), 'Idempotency-Key': `${key}-create` }, data: { title: key, requiresApproval: true } })
  expect(create.status()).toBe(201)
  const task = (await create.json()).data
  const assign = await page.request.post(`/api/operations/tasks/${task.id}/assign`, { headers: { ...authHeaders(admin), 'Idempotency-Key': `${key}-assign` }, data: { version: task.version, userId: 'usr-e2e-chunhiem', assignmentRole: 'APPROVER' } })
  expect(assign.status()).toBe(201)
  const staff = await apiLogin(page.request, 'e2e_chunhiem', process.env.E2E_ROLE_PASSWORD || 'E2e-Role-Password-1!')
  await injectSession(page, staff)
  await page.goto('/operations')
  const row = page.getByRole('article').filter({ hasText: key })
  await row.getByRole('button', { name: 'Nhận việc' }).click()
  await expect(row.getByRole('button', { name: 'Nhận việc' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Tải việc chờ duyệt' }).click()
  const queue = page.getByRole('region', { name: 'Việc chờ tôi duyệt' })
  await queue.getByRole('button', { name: 'Mở để duyệt' }).click()
  await page.getByLabel('Bình luận nhiệm vụ').fill('Minh chứng kiểm tra E2E')
  await page.getByLabel('Liên kết minh chứng').fill('https://example.com/operations-evidence')
  const comment = page.waitForResponse(response => response.url().endsWith(`/tasks/${task.id}/comments`) && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Gửi bình luận' }).click()
  expect((await comment).status()).toBe(201)
  await expect(page.getByText('Minh chứng kiểm tra E2E', { exact: true })).toBeVisible()
  const approval = page.waitForResponse(response => response.url().endsWith(`/tasks/${task.id}/approve`) && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Duyệt nhiệm vụ' }).click()
  expect((await approval).status()).toBe(200)
  await expect(page.getByText('Đã duyệt', { exact: true })).toBeVisible()
  const readBack = await page.request.get(`/api/operations/tasks/${task.id}`, { headers: authHeaders(admin) })
  const persisted = (await readBack.json()).data
  expect(persisted.task).toMatchObject({ id: task.id, operationEventId: null, approvalStatus: 'APPROVED' })
  expect(persisted.comments).toEqual(expect.arrayContaining([expect.objectContaining({ content: 'Minh chứng kiểm tra E2E', evidenceUrl: 'https://example.com/operations-evidence' })]))
  await page.getByRole('button', { name: 'Tải việc chờ duyệt' }).click()
  await expect(queue.getByRole('button', { name: 'Mở để duyệt' })).toHaveCount(0)
})

test('@critical Operations UI persists create → assign → acknowledge → complete and event lifecycle', async ({ page, browser }, testInfo) => {
  // This journey includes group creation/membership and two authenticated users.
  test.setTimeout(90_000)
  const admin = await getAdminSession(page.request)
  const key = testKey(testInfo, 'OPS')
  const eventTitle = `Vận hành ${key}`

  const snapshotResponse = await page.request.get('/api/parish-profile', { headers: authHeaders(admin) })
  expect(snapshotResponse.status()).toBe(200)
  const snapshot = (await snapshotResponse.json()).data as { people: Array<{ id: string; linkedUserId: string | null }> }
  let assigneePersonId = snapshot.people.find(person => person.linkedUserId === 'usr-e2e-chunhiem')?.id
  if (!assigneePersonId) {
    const personResponse = await page.request.post('/api/parish-profile/people', {
      headers: authHeaders(admin),
      data: { linkedUserId: 'usr-e2e-chunhiem', fullName: 'E2E Chunhiem', serviceStatus: 'ACTIVE', visibility: 'STAFF' },
    })
    expect(personResponse.status()).toBe(201)
    assigneePersonId = ((await personResponse.json()).data as { id: string }).id
  }

  await injectSession(page, admin)
  await page.goto('/operations')
  await page.getByRole('button', { name: 'Tạo sự kiện vận hành' }).click()
  await page.getByLabel('Tên sự kiện').fill(eventTitle)
  await page.getByLabel('Bắt đầu').fill('2026-10-12T08:00')
  await page.getByLabel('Kết thúc').fill('2026-10-12T12:00')
  const eventResponsePromise = page.waitForResponse(response => response.url().endsWith('/api/operations/events') && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Lưu bản nháp' }).click()
  const eventResponse = await eventResponsePromise
  expect(eventResponse.status()).toBe(201)
  const operationEvent = (await eventResponse.json()).data as { id: string; version: number }

  const eventCard = page.getByRole('article').filter({ hasText: eventTitle })
  await eventCard.getByRole('button', { name: 'Xem chi tiết' }).click()
  await expect(page.getByRole('region', { name: 'Chi tiết sự kiện vận hành' })).toContainText(eventTitle)

  await page.getByLabel('Tên nhóm công việc').fill('Nhóm nghi thức')
  await page.getByLabel('Nhóm bắt buộc').check()
  const groupResponse = page.waitForResponse(response => response.url().endsWith('/api/operations/workstreams') && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Tạo nhóm', exact: true }).click()
  const groupCreated = await groupResponse
  expect(groupCreated.status()).toBe(201)
  const group = (await groupCreated.json()).data as { id: string }
  await page.getByLabel('Thành viên nhóm').selectOption(assigneePersonId)
  await page.getByLabel('Vai trò trong nhóm').selectOption('WORKSTREAM_LEAD')
  const memberResponse = page.waitForResponse(response => response.url().endsWith(`/workstreams/${group.id}/members`) && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Phân công vào nhóm' }).click()
  expect((await memberResponse).status()).toBe(201)
  const readyResponse = page.waitForResponse(response => response.url().endsWith(`/workstreams/${group.id}/ready`) && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Nhóm đã sẵn sàng' }).click()
  expect((await readyResponse).status()).toBe(200)
  await page.getByLabel('Nhóm của công việc').selectOption(group.id)
  await page.getByLabel('Tên task').fill('Chuẩn bị nghi thức')
  await page.getByLabel('Hạn task').fill('2026-10-11T20:00')
  await page.getByText('Bắt buộc cho readiness').click()
  const taskResponsePromise = page.waitForResponse(response => response.url().endsWith('/api/operations/tasks') && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Tạo task' }).click()
  const taskResponse = await taskResponsePromise
  expect(taskResponse.status()).toBe(201)
  const task = (await taskResponse.json()).data as { id: string; version: number }

  const eventDetail = page.getByRole('region', { name: 'Chi tiết sự kiện vận hành' })
  const taskRow = eventDetail.getByText('Chuẩn bị nghi thức', { exact: true }).locator('..').locator('..')
  await taskRow.getByRole('button', { name: 'Checklist' }).click()
  await page.getByLabel('Mục checklist mới').fill('Kiểm tra dụng cụ')
  await page.getByText('Bắt buộc', { exact: true }).last().click()
  const checklistCreateResponse = page.waitForResponse(response => response.url().endsWith(`/api/operations/tasks/${task.id}/checklist`) && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Thêm mục' }).click()
  expect((await checklistCreateResponse).status()).toBe(201)
  const checklistUpdateResponse = page.waitForResponse(response => response.url().includes(`/api/operations/tasks/${task.id}/checklist/`) && response.request().method() === 'POST')
  const checklistCheckbox = page.getByRole('checkbox', { name: /Kiểm tra dụng cụ/ })
  await checklistCheckbox.click()
  expect((await checklistUpdateResponse).status()).toBe(200)
  await expect(checklistCheckbox).toBeChecked()

  await page.getByLabel('Task cần phân công').selectOption(task.id)
  await page.getByLabel('Người được phân công').selectOption(assigneePersonId)
  await page.getByLabel('Vai trò phân công').selectOption('OWNER')
  const assignmentResponsePromise = page.waitForResponse(response => response.url().endsWith(`/api/operations/tasks/${task.id}/assign`) && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Giao việc' }).click()
  const assignmentResponse = await assignmentResponsePromise
  expect(assignmentResponse.status()).toBe(201)

  const staffContext = await browser.newContext()
  const staffPage = await staffContext.newPage()
  try {
    const staff = await apiLogin(staffPage.request, 'e2e_chunhiem', process.env.E2E_ROLE_PASSWORD || 'E2e-Role-Password-1!')
    await injectSession(staffPage, staff)
    await staffPage.goto('/operations')
    const myTask = staffPage.getByRole('article').filter({ hasText: 'Chuẩn bị nghi thức' })
    await expect(myTask).toBeVisible()
    const acknowledgeResponse = staffPage.waitForResponse(response => response.url().endsWith(`/api/operations/tasks/${task.id}/acknowledge`) && response.request().method() === 'POST')
    await myTask.getByRole('button', { name: 'Nhận việc' }).click()
    expect((await acknowledgeResponse).status()).toBe(200)
    const completeResponse = staffPage.waitForResponse(response => response.url().endsWith(`/api/operations/tasks/${task.id}/transition`) && response.request().method() === 'POST')
    await myTask.getByRole('button', { name: 'Hoàn tất' }).click()
    expect((await completeResponse).status()).toBe(200)
  } finally {
    await staffContext.close()
  }

  const readBack = await page.request.get(`/api/operations/tasks/${task.id}`, { headers: authHeaders(admin) })
  expect(readBack.status()).toBe(200)
  expect((await readBack.json()).data.task).toMatchObject({ id: task.id, workstreamId: group.id, status: 'DONE', parishId: 'gia-ton' })

  const transitionFromUi = async (label: string) => {
    const response = page.waitForResponse(value => value.url().endsWith(`/api/operations/events/${operationEvent.id}/transition`) && value.request().method() === 'POST')
    await page.getByRole('button', { name: label }).click()
    expect((await response).status()).toBe(200)
  }
  await transitionFromUi('Bắt đầu lập kế hoạch')
  await transitionFromUi('Đánh dấu sẵn sàng')
  await transitionFromUi('Bắt đầu sự kiện')
  await page.getByRole('textbox', { name: 'Tổng kết kết quả' }).fill('Hoàn tất đúng kế hoạch E2E.')
  await transitionFromUi('Hoàn tất sự kiện')
  const eventReadBack = await page.request.get(`/api/operations/events/${operationEvent.id}`, { headers: authHeaders(admin) })
  expect((await eventReadBack.json()).data).toMatchObject({ event: { status: 'COMPLETED' }, readiness: { percent: 100, blockers: [] } })
})
