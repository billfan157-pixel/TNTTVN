import { expect, test } from '@playwright/test'
import { apiLogin, authHeaders, getAdminSession, getRoleSession, injectSession, testKey } from './helpers'

test('@critical public Operations event is projected to the parent read-only calendar', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  const admin = await getAdminSession(page.request)
  const parishLeader = await getRoleSession(page.request, 'phuta')
  const key = testKey(testInfo, 'OPS-PUBLIC-CALENDAR')
  const now = new Date()
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  await injectSession(page, parishLeader)
  await page.goto('/operations')
  await page.getByRole('button', { name: 'Tạo mới' }).click()
  await page.getByRole('menuitem', { name: /Tạo sự kiện Xứ đoàn/ }).click()
  await page.getByRole('button', { name: 'Công khai', exact: true }).click()
  await page.getByLabel('Tên sự kiện').fill(key)
  await page.getByLabel('Loại sự kiện').selectOption('CAMP')
  await page.getByLabel('Địa điểm').fill('Sân giáo xứ E2E')
  await page.getByLabel('Bắt đầu', { exact: true }).fill(`${date}T08:00`)
  // W4-era selector fix: the SmartEventTimePicker end-date switch label
  // "Bật tắt ngày kết thúc" contains "Kết thúc", so exact matching is required.
  await page.getByLabel('Kết thúc', { exact: true }).fill(`${date}T17:00`)
  // Organizer is auto-selected when a single Xứ đoàn trưởng exists; otherwise pick the first option.
  const organizerSelect = page.getByLabel('Người chịu trách nhiệm (Organizer)')
  if (await organizerSelect.isEnabled() && !(await organizerSelect.inputValue())) {
    const firstOption = organizerSelect.locator('option[value]:not([value=""])').first()
    if (await firstOption.count()) await organizerSelect.selectOption(await firstOption.getAttribute('value') as string)
  }
  const createResponsePromise = page.waitForResponse(response => response.url().endsWith('/api/operations/events') && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Lưu bản nháp' }).click()
  const createResponse = await createResponsePromise
  expect(createResponse.status()).toBe(201)
  const operationEvent = (await createResponse.json()).data as { id: string; sourceParishEventId: string | null; visibility: string }
  expect(operationEvent).toMatchObject({ visibility: 'PUBLIC_SUMMARY' })
  expect(operationEvent.sourceParishEventId).toBeNull()

  const draftProjectionResponse = await page.request.get(`/api/parish-events?from=${date}&to=${date}`, { headers: authHeaders(parishLeader) })
  expect(draftProjectionResponse.status()).toBe(200)
  expect((await draftProjectionResponse.json()).data.some((event: { title: string }) => event.title === key)).toBe(false)

  // Create flow now opens the new event's detail directly (select-on-create),
  // so clicking the row would hit the open dialog overlay instead.
  await expect(page.getByRole('dialog').filter({ hasText: key })).toBeVisible()
  const planningResponsePromise = page.waitForResponse(response => response.url().endsWith(`/api/operations/events/${operationEvent.id}/transition`) && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Bắt đầu lập kế hoạch' }).click()
  const planningResponse = await planningResponsePromise
  expect(planningResponse.status()).toBe(200)
  const plannedEvent = (await planningResponse.json()).data as { sourceParishEventId: string }
  expect(plannedEvent.sourceParishEventId).toBeTruthy()

  const projectionResponse = await page.request.get(`/api/parish-events?from=${date}&to=${date}`, { headers: authHeaders(parishLeader) })
  expect(projectionResponse.status()).toBe(200)
  const projection = (await projectionResponse.json()).data.find((event: { id: string }) => event.id === plannedEvent.sourceParishEventId)
  expect(projection).toMatchObject({ title: key, date, time: '08:00', location: 'Sân giáo xứ E2E' })
  expect(projection).not.toHaveProperty('tasks')
  expect(projection).not.toHaveProperty('assignees')

  const directWrite = await page.request.post('/api/parish-events', {
    headers: authHeaders(admin),
    data: { date, title: 'Không được ghi trực tiếp', category: 'OTHER' },
  })
  expect(directWrite.status()).toBe(405)
  expect((await directWrite.json()).error.code).toBe('CALENDAR_READ_ONLY')

  const parent = await getRoleSession(page.request, 'phuhuynh')
  await injectSession(page, parent)
  await page.goto('/calendar')
  await expect(page.getByText(key, { exact: true })).toBeVisible()
  await expect(page.getByText('Sân giáo xứ E2E', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Tạo sự kiện|Sửa sự kiện|Xóa sự kiện/ })).toHaveCount(0)
})

test('@critical Operations primary dispatch appears only after planning and first acceptance becomes OWNER', async ({ page, browser }, testInfo) => {
  test.setTimeout(90_000)
  const admin = await getAdminSession(page.request)
  const key = testKey(testInfo, 'OPS-DISPATCH')
  const createPerson = async (linkedUserId: string, fullName: string, suffix: string) => {
    const snapshot = await page.request.get('/api/parish-profile', { headers: authHeaders(admin) })
    const existing = ((await snapshot.json()).data.people as Array<{ id: string; linkedUserId: string | null }>).find(person => person.linkedUserId === linkedUserId)
    if (existing) return existing.id
    const response = await page.request.post('/api/parish-profile/people', {
      headers: { ...authHeaders(admin), 'Idempotency-Key': `${key}-${suffix}` },
      data: { linkedUserId, fullName, serviceStatus: 'ACTIVE', visibility: 'STAFF' },
    })
    expect(response.status()).toBe(201)
    return (await response.json()).data.id as string
  }
  const primaryPersonId = await createPerson('usr-e2e-chunhiem', 'E2E primary', 'primary-person')
  const reservePersonId = await createPerson('usr-e2e-phuta', 'E2E reserve', 'reserve-person')
  const post = async (path: string, body: unknown, suffix: string) => {
    const response = await page.request.post(`/api${path}`, { headers: { ...authHeaders(admin), 'Idempotency-Key': `${key}-${suffix}` }, data: body })
    expect(response.status()).toBe(201)
    return (await response.json()).data
  }
  const operationEvent = await post('/operations/events', {
    title: key, eventType: 'CAMP', startsAt: '2035-06-01T08:00:00Z', endsAt: '2035-06-01T17:00:00Z', timezone: 'Asia/Ho_Chi_Minh', visibility: 'INTERNAL',
  }, 'event')
  const task = await post('/operations/tasks', { title: `Trực cổng ${key}`, eventId: operationEvent.id }, 'task')

  const recipientContext = await browser.newContext()
  const recipientPage = await recipientContext.newPage()
  try {
    const recipient = await apiLogin(recipientPage.request, 'e2e_chunhiem', process.env.E2E_ROLE_PASSWORD || 'E2e-Role-Password-1!')
    await injectSession(recipientPage, recipient)
    expect((await (await recipientPage.request.get('/api/operations/dispatches/inbox', { headers: authHeaders(recipient) })).json()).data).toEqual([])

    await injectSession(page, admin)
    await page.goto('/operations')
    await page.getByRole('article').filter({ hasText: key }).getByRole('button', { name: 'Xem chi tiết' }).click()
    await page.getByLabel('Task cần phân công').selectOption(task.id)
    await page.getByLabel('Vai trò phân công').selectOption('OWNER')
    await page.getByLabel('Người thực hiện chính').selectOption(`person:${primaryPersonId}`)
    await page.getByLabel('Người dự bị').selectOption(`person:${reservePersonId}`)
    await page.getByLabel('Hạn nhận nhiệm vụ').fill('2034-01-01T12:00')
    const dispatchResponsePromise = page.waitForResponse(response => response.url().endsWith(`/api/operations/tasks/${task.id}/dispatch`) && response.request().method() === 'POST')
    await page.getByRole('button', { name: 'Gửi lời mời phụ trách' }).click()
    const dispatchResponse = await dispatchResponsePromise
    expect(dispatchResponse.status()).toBe(201)
    expect((await dispatchResponse.json()).data.dispatch).toMatchObject({ status: 'SCHEDULED', primaryInvitedAt: null })

    const planningResponsePromise = page.waitForResponse(response => response.url().endsWith(`/api/operations/events/${operationEvent.id}/transition`) && response.request().method() === 'POST')
    await page.getByRole('button', { name: 'Bắt đầu lập kế hoạch' }).click()
    expect((await planningResponsePromise).status()).toBe(200)

    await recipientPage.goto('/operations')
    const invitationPanel = recipientPage.locator('[aria-label="Lời mời nhận nhiệm vụ"]')
    await expect(invitationPanel).toContainText(`Trực cổng ${key}`)
    const acceptanceResponsePromise = recipientPage.waitForResponse(response => response.url().includes(`/api/operations/tasks/${task.id}/dispatches/`) && response.url().endsWith('/accept') && response.request().method() === 'POST')
    await invitationPanel.getByRole('button', { name: 'Nhận nhiệm vụ' }).click()
    expect((await acceptanceResponsePromise).status()).toBe(200)

    const readBack = await page.request.get(`/api/operations/tasks/${task.id}`, { headers: authHeaders(admin) })
    const owners = (await readBack.json()).data.assignees.filter((assignment: { assignmentRole: string }) => assignment.assignmentRole === 'OWNER')
    expect(owners).toEqual([expect.objectContaining({ userId: 'usr-e2e-chunhiem', acknowledgementStatus: 'ACCEPTED' })])
  } finally {
    await recipientContext.close()
  }
})

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
  // Candidate selects use `person:<id>` option values (operationCandidateValue).
  await page.getByLabel('Người phụ trách mới').selectOption(`person:${personId}`)
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

test('@critical Operations standalone evidence persists through UI', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  const admin = await getAdminSession(page.request)
  const key = testKey(testInfo, 'OPS-REVIEW')
  const create = await page.request.post('/api/operations/tasks', { headers: { ...authHeaders(admin), 'Idempotency-Key': `${key}-create` }, data: { title: key } })
  expect(create.status()).toBe(201)
  const task = (await create.json()).data
  const assign = await page.request.post(`/api/operations/tasks/${task.id}/assign`, { headers: { ...authHeaders(admin), 'Idempotency-Key': `${key}-assign` }, data: { version: task.version, userId: 'usr-e2e-chunhiem', assignmentRole: 'OWNER' } })
  expect(assign.status()).toBe(201)
  const staff = await apiLogin(page.request, 'e2e_chunhiem', process.env.E2E_ROLE_PASSWORD || 'E2e-Role-Password-1!')
  await injectSession(page, staff)
  await page.goto('/operations')
  const row = page.getByRole('article').filter({ hasText: key })
  // W4.3 behavior change: accepting now opens a dialog with an optional note.
  await row.getByRole('button', { name: 'Nhận việc' }).click()
  await page.getByRole('dialog', { name: 'Nhận nhiệm vụ' }).getByRole('button', { name: 'Xác nhận nhận việc' }).click()
  await expect(row.getByRole('button', { name: 'Nhận việc' })).toHaveCount(0)
  await row.getByRole('button', { name: 'Chi tiết nhiệm vụ' }).click()
  await page.getByLabel('Bình luận nhiệm vụ').fill('Minh chứng kiểm tra E2E')
  await page.getByLabel('Liên kết minh chứng').fill('https://example.com/operations-evidence')
  const comment = page.waitForResponse(response => response.url().endsWith(`/tasks/${task.id}/comments`) && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Gửi bình luận' }).click()
  expect((await comment).status()).toBe(201)
  await expect(page.getByText('Minh chứng kiểm tra E2E', { exact: true })).toBeVisible()
  const readBack = await page.request.get(`/api/operations/tasks/${task.id}`, { headers: authHeaders(admin) })
  const persisted = (await readBack.json()).data
  expect(persisted.task).toMatchObject({ id: task.id, operationEventId: null })
  expect(persisted.task).not.toHaveProperty('approvalStatus')
  expect(persisted.comments).toEqual(expect.arrayContaining([expect.objectContaining({ content: 'Minh chứng kiểm tra E2E', evidenceUrl: 'https://example.com/operations-evidence' })]))
})

test('@critical Operations P4 standalone group assignment respects private blockout and acceptance', async ({ page, browser }, testInfo) => {
  test.setTimeout(90_000)
  const admin = await getAdminSession(page.request)
  const key = testKey(testInfo, 'OPS-P4')
  const groupName = `Nhóm độc lập ${key}`
  const taskTitle = `Kiểm kê ${key}`
  const snapshotResponse = await page.request.get('/api/parish-profile', { headers: authHeaders(admin) })
  expect(snapshotResponse.status()).toBe(200)
  const people = (await snapshotResponse.json()).data.people as Array<{ id: string; linkedUserId: string | null }>
  let personId = people.find(person => person.linkedUserId === 'usr-e2e-chunhiem')?.id
  if (!personId) {
    const personResponse = await page.request.post('/api/parish-profile/people', {
      headers: { ...authHeaders(admin), 'Idempotency-Key': `${key}-person` },
      data: { linkedUserId: 'usr-e2e-chunhiem', fullName: 'E2E Chunhiem', serviceStatus: 'ACTIVE', visibility: 'STAFF' },
    })
    expect(personResponse.status()).toBe(201)
    personId = (await personResponse.json()).data.id
  }
  const unitsResponse = await page.request.get('/api/operations/units?limit=500', { headers: authHeaders(admin) })
  expect(unitsResponse.status()).toBe(200)
  let unit = (await unitsResponse.json()).data[0] as { id: string } | undefined
  if (!unit) {
    const createUnitResponse = await page.request.post('/api/parish-profile/units', {
      headers: authHeaders(admin),
      data: { parentId: null, name: `Ngành E2E ${key}`, unitType: 'BRANCH', description: null, sortOrder: 0, isActive: true },
    })
    expect(createUnitResponse.status()).toBe(201)
    unit = (await createUnitResponse.json()).data as { id: string }
  }

  const recipientContext = await browser.newContext()
  const recipientPage = await recipientContext.newPage()
  const recipient = await apiLogin(recipientPage.request, 'e2e_chunhiem', process.env.E2E_ROLE_PASSWORD || 'E2e-Role-Password-1!')
  await injectSession(recipientPage, recipient)
  await recipientPage.goto('/operations')
  await recipientPage.getByLabel('Bận từ').fill('2027-06-01T08:00')
  await recipientPage.getByLabel('Bận đến').fill('2027-06-01T10:00')
  await recipientPage.getByLabel('Lý do bận riêng tư').fill('Lý do riêng P4 không được lộ')
  const blockoutResponsePromise = recipientPage.waitForResponse(response => response.url().endsWith('/api/operations/blockouts') && response.request().method() === 'POST')
  await recipientPage.getByRole('button', { name: 'Báo bận' }).click()
  expect((await blockoutResponsePromise).status()).toBe(201)
  await expect(recipientPage.getByText('Đã lưu lịch bận.')).toBeVisible()

  await injectSession(page, admin)
  await page.goto('/operations')
  // W2/W3 layout: standalone workstreams moved into the utilities tab.
  await page.getByRole('tab', { name: 'Nhóm công tác độc lập' }).click()
  const panel = page.getByRole('region', { name: 'Nhóm công việc độc lập' })
  await panel.getByLabel('Đơn vị phụ trách nhóm độc lập').selectOption(unit!.id)
  await panel.getByLabel('Tên nhóm độc lập').fill(groupName)
  const groupResponsePromise = page.waitForResponse(response => response.url().endsWith('/api/operations/workstreams') && response.request().method() === 'POST')
  await panel.getByRole('button', { name: 'Tạo nhóm' }).click()
  const groupResponse = await groupResponsePromise
  expect(groupResponse.status()).toBe(201)
  const group = (await groupResponse.json()).data as { id: string; sourceUnitId: string | null; operationEventId: string | null }
  expect(group).toMatchObject({ sourceUnitId: unit!.id, operationEventId: null })
  await expect(panel.getByRole('heading', { name: groupName })).toBeVisible()

  await panel.getByLabel('Thành viên nhóm độc lập').selectOption(`person:${personId}`)
  await panel.getByLabel('Vai trò nhóm độc lập').selectOption('WORKSTREAM_LEAD')
  const memberResponsePromise = page.waitForResponse(response => response.url().endsWith(`/api/operations/workstreams/${group.id}/members`) && response.request().method() === 'POST')
  await panel.getByRole('button', { name: 'Thêm vào nhóm' }).click()
  expect((await memberResponsePromise).status()).toBe(201)

  await panel.getByLabel('Tên việc của nhóm độc lập').fill(taskTitle)
  await panel.getByLabel('Hạn việc của nhóm độc lập').fill('2027-06-01T09:00')
  const taskResponsePromise = page.waitForResponse(response => response.url().endsWith('/api/operations/tasks') && response.request().method() === 'POST')
  await panel.getByRole('button', { name: 'Tạo việc' }).click()
  const taskResponse = await taskResponsePromise
  expect(taskResponse.status()).toBe(201)
  const task = (await taskResponse.json()).data as { id: string }

  await panel.getByLabel('Người nhận việc nhóm độc lập').selectOption(`person:${personId}`)
  const assignmentResponsePromise = page.waitForResponse(response => response.url().endsWith(`/api/operations/tasks/${task.id}/assign`) && response.request().method() === 'POST')
  await panel.getByRole('button', { name: 'Giao việc' }).click()
  const assignmentResponse = await assignmentResponsePromise
  expect(assignmentResponse.status()).toBe(201)
  expect((await assignmentResponse.json()).data.conflictWarnings.length).toBeGreaterThanOrEqual(1)
  await expect(panel.getByText('Đã lưu phân công, nhưng người nhận có lịch bận tại hạn công việc.')).toBeVisible()
  await expect(page.getByText('Lý do riêng P4 không được lộ')).toHaveCount(0)

  await recipientPage.reload()
  const myTask = recipientPage.getByRole('article').filter({ hasText: taskTitle })
  await expect(myTask).toBeVisible()
  const acknowledgementResponsePromise = recipientPage.waitForResponse(response => response.url().endsWith(`/api/operations/tasks/${task.id}/acknowledge`) && response.request().method() === 'POST')
  await myTask.getByRole('button', { name: 'Nhận việc' }).click()
  await recipientPage.getByRole('dialog', { name: 'Nhận nhiệm vụ' }).getByRole('button', { name: 'Xác nhận nhận việc' }).click()
  expect((await acknowledgementResponsePromise).status()).toBe(200)

  const readBack = await page.request.get(`/api/operations/tasks/${task.id}`, { headers: authHeaders(admin) })
  expect(readBack.status()).toBe(200)
  const persisted = (await readBack.json()).data
  expect(persisted.task).toMatchObject({ id: task.id, operationEventId: null, workstreamId: group.id })
  expect(persisted.assignees).toEqual(expect.arrayContaining([expect.objectContaining({ personId, assignmentRole: 'OWNER', acknowledgementStatus: 'ACCEPTED' })]))
  await recipientContext.close()
})

test('@critical Operations P5 turns a completed-event retrospective into an owned follow-up', async ({ page, browser }, testInfo) => {
  test.setTimeout(90_000)
  const admin = await getAdminSession(page.request)
  const key = testKey(testInfo, 'OPS-P5')
  const eventTitle = `Hậu kiểm ${key}`
  const followUpTitle = `Chuẩn hóa checklist ${key}`
  const snapshotResponse = await page.request.get('/api/parish-profile', { headers: authHeaders(admin) })
  expect(snapshotResponse.status()).toBe(200)
  const people = (await snapshotResponse.json()).data.people as Array<{ id: string; linkedUserId: string | null }>
  let personId = people.find(person => person.linkedUserId === 'usr-e2e-chunhiem')?.id
  if (!personId) {
    const personResponse = await page.request.post('/api/parish-profile/people', {
      headers: { ...authHeaders(admin), 'Idempotency-Key': `${key}-person` },
      data: { linkedUserId: 'usr-e2e-chunhiem', fullName: 'E2E Chunhiem', serviceStatus: 'ACTIVE', visibility: 'STAFF' },
    })
    expect(personResponse.status()).toBe(201)
    personId = (await personResponse.json()).data.id
  }

  const createResponse = await page.request.post('/api/operations/events', {
    headers: { ...authHeaders(admin), 'Idempotency-Key': `${key}-event` },
    data: { title: eventTitle, eventType: 'MEETING', startsAt: '2027-07-01T08:00:00Z', endsAt: '2027-07-01T10:00:00Z', timezone: 'Asia/Ho_Chi_Minh' },
  })
  expect(createResponse.status()).toBe(201)
  let operationEvent = (await createResponse.json()).data as { id: string; version: number; status: string }
  for (const status of ['PLANNING', 'PREPARING', 'READY', 'LIVE', 'COMPLETED'] as const) {
    const transitionResponse = await page.request.post(`/api/operations/events/${operationEvent.id}/transition`, {
      headers: { ...authHeaders(admin), 'Idempotency-Key': `${key}-${status}` },
      data: { version: operationEvent.version, status, ...(status === 'COMPLETED' ? { outcomeSummary: 'Hoàn tất an toàn theo kế hoạch E2E.' } : {}) },
    })
    expect(transitionResponse.status()).toBe(200)
    operationEvent = (await transitionResponse.json()).data
  }

  await injectSession(page, admin)
  await page.goto('/operations')
  await page.getByRole('article').filter({ hasText: eventTitle }).getByRole('button', { name: 'Xem chi tiết' }).click()
  await page.getByRole('tab', { name: 'Đúc kết sau sự kiện' }).click()
  const panel = page.getByRole('region', { name: 'Hậu kiểm và công việc tiếp nối' })
  await expect(panel.getByText('Hoàn tất an toàn theo kế hoạch E2E.')).toBeVisible()
  await panel.getByLabel('Bài học rút ra').fill('Xác nhận người phụ trách trước khi chốt kế hoạch.')
  await panel.getByLabel('Điểm cần cải thiện').fill('Chuẩn hóa checklist dùng lại.')
  const retrospectiveResponsePromise = page.waitForResponse(response => response.url().endsWith(`/api/operations/events/${operationEvent.id}/retrospective`) && response.request().method() === 'PUT')
  await panel.getByRole('button', { name: 'Lưu hậu kiểm' }).click()
  expect((await retrospectiveResponsePromise).status()).toBe(200)
  await expect(panel.getByText('Đã lưu hậu kiểm.')).toBeVisible()

  await panel.getByLabel('Tên follow-up').fill(followUpTitle)
  await panel.getByLabel('Mô tả follow-up').fill('Biến bài học thành đầu việc có thể xác nhận hoàn thành.')
  await panel.getByLabel('Hạn follow-up').fill('2027-07-08T20:00')
  await panel.getByLabel('Người phụ trách follow-up').selectOption(`person:${personId}`)
  await panel.getByLabel('Mức ưu tiên follow-up').selectOption('HIGH')
  const followUpResponsePromise = page.waitForResponse(response => response.url().endsWith(`/api/operations/events/${operationEvent.id}/follow-ups`) && response.request().method() === 'POST')
  await panel.getByRole('button', { name: 'Tạo và giao follow-up' }).click()
  const followUpResponse = await followUpResponsePromise
  expect(followUpResponse.status()).toBe(201)
  const followUp = (await followUpResponse.json()).data as { task: { id: string }; assignment: { assignmentRole: string; acknowledgementStatus: string } }
  expect(followUp.assignment).toMatchObject({ assignmentRole: 'OWNER', acknowledgementStatus: 'PENDING' })

  const recipientContext = await browser.newContext()
  const recipientPage = await recipientContext.newPage()
  try {
    const recipient = await apiLogin(recipientPage.request, 'e2e_chunhiem', process.env.E2E_ROLE_PASSWORD || 'E2e-Role-Password-1!')
    await injectSession(recipientPage, recipient)
    await recipientPage.goto('/operations')
    const taskCard = recipientPage.getByRole('article').filter({ hasText: followUpTitle })
    await expect(taskCard).toBeVisible()
    const acknowledgementResponsePromise = recipientPage.waitForResponse(response => response.url().endsWith(`/api/operations/tasks/${followUp.task.id}/acknowledge`) && response.request().method() === 'POST')
    await taskCard.getByRole('button', { name: 'Nhận việc' }).click()
    await recipientPage.getByRole('dialog', { name: 'Nhận nhiệm vụ' }).getByRole('button', { name: 'Xác nhận nhận việc' }).click()
    expect((await acknowledgementResponsePromise).status()).toBe(200)
  } finally {
    await recipientContext.close()
  }

  const readBack = await page.request.get(`/api/operations/events/${operationEvent.id}`, { headers: authHeaders(admin) })
  expect(readBack.status()).toBe(200)
  const persisted = (await readBack.json()).data
  expect(persisted.retrospective).toMatchObject({ lessonsLearned: 'Xác nhận người phụ trách trước khi chốt kế hoạch.', improvementNotes: 'Chuẩn hóa checklist dùng lại.', version: 1 })
  expect(persisted.tasks).toEqual(expect.arrayContaining([expect.objectContaining({ id: followUp.task.id, phase: 'FOLLOW_UP', status: 'TODO', priority: 'HIGH' })]))
  expect(persisted.assignees).toEqual(expect.arrayContaining([expect.objectContaining({ taskId: followUp.task.id, personId, assignmentRole: 'OWNER', acknowledgementStatus: 'ACCEPTED' })]))
})

test('@critical Operations P5 previews and instantiates an immutable event template without inherited assignees', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  const admin = await getAdminSession(page.request)
  const key = testKey(testInfo, 'OPS-TEMPLATE')
  const eventTitle = `Nguồn mẫu ${key}`
  const taskTitle = `Chuẩn bị từ mẫu ${key}`
  const templateName = `Mẫu E2E ${key}`
  const headers = (suffix: string) => ({ ...authHeaders(admin), 'Idempotency-Key': `${key}-${suffix}` })

  const eventResponse = await page.request.post('/api/operations/events', {
    headers: headers('event'),
    data: {
      title: eventTitle,
      description: 'Nội dung dùng lại có kiểm soát.',
      eventType: 'MEETING',
      startsAt: '2027-08-01T08:00:00Z',
      endsAt: '2027-08-01T10:00:00Z',
      timezone: 'Asia/Ho_Chi_Minh',
    },
  })
  expect(eventResponse.status()).toBe(201)
  const sourceEvent = (await eventResponse.json()).data as { id: string }

  const taskResponse = await page.request.post('/api/operations/tasks', {
    headers: headers('task'),
    data: {
      eventId: sourceEvent.id,
      title: taskTitle,
      phase: 'PREPARATION',
      priority: 'HIGH',
      dueAt: '2027-08-01T07:00:00Z',
      isRequired: true,
    },
  })
  expect(taskResponse.status()).toBe(201)
  const sourceTask = (await taskResponse.json()).data as { id: string; version: number }

  const checklistResponse = await page.request.post(`/api/operations/tasks/${sourceTask.id}/checklist`, {
    headers: headers('checklist'),
    data: { version: sourceTask.version, label: 'Kiểm tra dụng cụ', isRequired: true, sortOrder: 10 },
  })
  expect(checklistResponse.status()).toBe(201)
  const taskVersion = (await checklistResponse.json()).data.taskVersion as number

  const assignmentResponse = await page.request.post(`/api/operations/tasks/${sourceTask.id}/assign`, {
    headers: headers('assign'),
    data: { version: taskVersion, userId: 'usr-e2e-chunhiem', assignmentRole: 'OWNER' },
  })
  expect(assignmentResponse.status()).toBe(201)

  await injectSession(page, admin)
  await page.goto('/operations')
  await page.getByRole('article').filter({ hasText: eventTitle }).getByRole('button', { name: 'Xem chi tiết' }).click()

  const sourceDialog = page.getByRole('dialog', { name: eventTitle })
  await sourceDialog.getByRole('tab', { name: 'Mẫu' }).click()
  const sourceTemplates = sourceDialog.getByRole('region', { name: 'Quản lý mẫu từ sự kiện' })
  await sourceTemplates.getByLabel('Tên mẫu sự kiện').fill(templateName)
  const saveResponsePromise = page.waitForResponse(response => response.url().endsWith(`/api/operations/events/${sourceEvent.id}/templates`) && response.request().method() === 'POST')
  await sourceTemplates.getByRole('button', { name: 'Lưu mẫu v1' }).click()
  const saveResponse = await saveResponsePromise
  expect(saveResponse.status()).toBe(201)
  const template = (await saveResponse.json()).data as { id: string; latestVersion: number }
  await sourceTemplates.getByLabel('Mẫu sự kiện cần tạo phiên bản').selectOption(template.id)
  await expect(sourceTemplates.getByLabel('Mẫu sự kiện cần tạo phiên bản')).toHaveValue(template.id)

  await sourceDialog.getByRole('button', { name: 'Đóng chi tiết' }).click()
  await page.getByRole('region', { name: 'Tiện ích điều hành' }).getByRole('tab', { name: 'Mẫu' }).click()
  const templates = page.getByRole('region', { name: 'Mẫu sự kiện' })
  await templates.getByLabel('Mẫu sự kiện cần dùng').selectOption(template.id)
  await expect(templates.getByLabel('Mẫu sự kiện cần dùng')).toHaveValue(template.id)

  await templates.getByLabel('Thời gian bắt đầu từ mẫu').fill('2027-09-01T08:00')
  const previewResponsePromise = page.waitForResponse(response => response.url().includes(`/api/operations/templates/${template.id}/preview`) && response.request().method() === 'GET')
  await templates.getByRole('button', { name: 'Xem trước' }).click()
  const previewResponse = await previewResponsePromise
  expect(previewResponse.status()).toBe(200)
  const previewPayload = (await previewResponse.json()).data as { preview: { tasks: Array<{ title: string; dueAt: string | null }> } }
  const expectedDueAt = previewPayload.preview.tasks.find(task => task.title === taskTitle)?.dueAt
  expect(expectedDueAt).toBeTruthy()
  const preview = templates.getByRole('region', { name: 'Bản xem trước mẫu sự kiện' })
  await expect(preview.getByText(taskTitle, { exact: false })).toBeVisible()
  await expect(preview).toContainText('Bản xem trước không chứa assignee')

  const instantiateResponsePromise = page.waitForResponse(response => response.url().endsWith(`/api/operations/templates/${template.id}/instantiate`) && response.request().method() === 'POST')
  await templates.getByRole('button', { name: 'Tạo bản nháp từ mẫu' }).click()
  const instantiateResponse = await instantiateResponsePromise
  expect(instantiateResponse.status()).toBe(201)
  const instantiated = (await instantiateResponse.json()).data as { event: { id: string; sourceTemplateId: string; sourceTemplateVersion: number }; tasks: Array<{ id: string; title: string; phase: string; status: string; dueAt: string | null }>; checklist: Array<{ taskId: string; label: string; isDone: boolean }> }
  expect(instantiated.event).toMatchObject({ sourceTemplateId: template.id, sourceTemplateVersion: 1 })
  expect(instantiated.tasks).toEqual(expect.arrayContaining([expect.objectContaining({ title: taskTitle, phase: 'PREPARATION', status: 'TODO', dueAt: expectedDueAt })]))
  expect(instantiated.checklist).toEqual(expect.arrayContaining([expect.objectContaining({ label: 'Kiểm tra dụng cụ', isDone: false })]))

  const readBack = await page.request.get(`/api/operations/events/${instantiated.event.id}`, { headers: authHeaders(admin) })
  expect(readBack.status()).toBe(200)
  const persisted = (await readBack.json()).data
  expect(persisted.event).toMatchObject({ status: 'DRAFT', sourceTemplateId: template.id, sourceTemplateVersion: 1 })
  expect(persisted.assignees).toEqual([])
  expect(persisted.tasks).toEqual(expect.arrayContaining([expect.objectContaining({ title: taskTitle })]))
  expect(persisted.tasks[0]).not.toHaveProperty('approvalStatus')

  const instantiatedDialog = page.getByRole('dialog', { name: eventTitle })
  await expect(instantiatedDialog.getByRole('tab', { name: 'Mẫu' })).toBeVisible()
  await instantiatedDialog.getByRole('tab', { name: 'Mẫu' }).click()
  const lifecycle = instantiatedDialog.getByRole('region', { name: 'Quản lý mẫu từ sự kiện' })
  await expect(lifecycle.getByLabel('Mẫu sự kiện cần tạo phiên bản')).toHaveValue(template.id)
  await lifecycle.getByLabel('Lý do lưu trữ mẫu sự kiện').fill('Tạm ẩn để kiểm tra quy trình E2E')
  const archiveResponsePromise = page.waitForResponse(response => response.url().endsWith(`/api/operations/templates/${template.id}/archive`) && response.request().method() === 'POST')
  await lifecycle.getByRole('button', { name: 'Lưu trữ mẫu' }).click()
  const archiveResponse = await archiveResponsePromise
  expect(archiveResponse.status()).toBe(200)
  expect((await archiveResponse.json()).data).toMatchObject({ id: template.id, latestVersion: 1, isActive: false })
  await expect(lifecycle.getByLabel('Mẫu sự kiện cần khôi phục')).toHaveValue(template.id)

  await lifecycle.getByLabel('Lý do khôi phục mẫu sự kiện').fill('Đã kiểm tra xong quy trình E2E')
  const restoreResponsePromise = page.waitForResponse(response => response.url().endsWith(`/api/operations/templates/${template.id}/restore`) && response.request().method() === 'POST')
  await lifecycle.getByRole('button', { name: 'Khôi phục mẫu' }).click()
  const restoreResponse = await restoreResponsePromise
  expect(restoreResponse.status()).toBe(200)
  expect((await restoreResponse.json()).data).toMatchObject({ id: template.id, latestVersion: 1, isActive: true })
  await expect(lifecycle.getByLabel('Mẫu sự kiện cần tạo phiên bản')).toHaveValue(template.id)
})

test('@critical Operations P3 reschedules with OCC and recipient cancellation persists', async ({ page, browser }, testInfo) => {
  test.setTimeout(90_000)
  const admin = await getAdminSession(page.request)
  const key = testKey(testInfo, 'OPS-REMINDER')
  const eventTitle = `Nhắc việc ${key}`
  const snapshotResponse = await page.request.get('/api/parish-profile', { headers: authHeaders(admin) })
  const people = (await snapshotResponse.json()).data.people as Array<{ id: string; linkedUserId: string | null }>
  if (!people.some(person => person.linkedUserId === 'usr-e2e-chunhiem')) {
    const person = await page.request.post('/api/parish-profile/people', {
      headers: { ...authHeaders(admin), 'Idempotency-Key': `${key}-person` },
      data: { linkedUserId: 'usr-e2e-chunhiem', fullName: 'E2E Chunhiem', serviceStatus: 'ACTIVE', visibility: 'STAFF' },
    })
    expect(person.status()).toBe(201)
  }
  const eventResponse = await page.request.post('/api/operations/events', {
    headers: { ...authHeaders(admin), 'Idempotency-Key': `${key}-event` },
    data: { title: eventTitle, eventType: 'MEETING', startsAt: '2027-05-01T08:00:00Z', endsAt: '2027-05-01T10:00:00Z', timezone: 'Asia/Ho_Chi_Minh', organizerUserId: 'usr-e2e-chunhiem' },
  })
  expect(eventResponse.status()).toBe(201)
  const operationEvent = (await eventResponse.json()).data as { id: string }

  await injectSession(page, admin)
  await page.goto('/operations')
  const eventCard = page.getByRole('article').filter({ hasText: eventTitle })
  await eventCard.getByRole('button', { name: 'Xem chi tiết' }).click()
  // W2/W4: a DRAFT event is creator-private; move it to PLANNING through the
  // UI so the parish-leader recipient passes assertReminderRecipientCanView
  // (DRAFT→PLANNING is not readiness-gated), then reach the reminders tab.
  const planningPromise = page.waitForResponse(value => value.url().endsWith(`/api/operations/events/${operationEvent.id}/transition`) && value.request().method() === 'POST')
  await page.getByRole('button', { name: 'Bắt đầu lập kế hoạch' }).click()
  expect((await planningPromise).status()).toBe(200)
  // W3.2 layout: reminders live behind their own modal tab now.
  await page.getByRole('tab', { name: 'Lập lịch nhắc việc' }).click()
  // W4-era fixture note: recipients must be able to VIEW the event AND hold an
  // Operations account (assertReminderRecipientCanView + assertTarget) — the
  // seeded PARISH_LEADER (usr-e2e-phuta) satisfies both for a parish event.
  const manager = page.getByRole('region', { name: 'Quản lý nhắc sự kiện' })
  await manager.getByLabel('Người nhận nhắc sự kiện').selectOption('usr-e2e-phuta')
  await manager.getByLabel('Thời điểm nhắc sự kiện').fill('2027-04-30T20:00')
  const createResponsePromise = page.waitForResponse(response => response.url().endsWith('/api/operations/reminders') && response.request().method() === 'POST')
  await manager.getByRole('button', { name: 'Lưu lịch nhắc' }).click()
  const createResponse = await createResponsePromise
  expect(createResponse.status()).toBe(201)
  const reminder = (await createResponse.json()).data as { id: string; version: number }
  expect(reminder.version).toBe(1)

  const managerRow = manager.locator(`[data-reminder-id="${reminder.id}"]`)
  await managerRow.getByRole('button', { name: 'Đổi hoặc hủy lịch' }).click()
  await managerRow.getByLabel('Giờ nhắc mới sự kiện').fill('2027-04-30T21:00')
  await managerRow.getByLabel('Lý do đổi hoặc hủy nhắc sự kiện').fill('Dời giờ tập trung')
  const rescheduleResponsePromise = page.waitForResponse(response => response.url().endsWith(`/api/operations/reminders/${reminder.id}/reschedule`) && response.request().method() === 'POST')
  await managerRow.getByRole('button', { name: 'Lưu giờ mới' }).click()
  const rescheduleResponse = await rescheduleResponsePromise
  expect(rescheduleResponse.status()).toBe(200)
  expect((await rescheduleResponse.json()).data).toMatchObject({ id: reminder.id, status: 'PENDING', version: 2 })

  await page.reload()
  // W2.2 deep-link: the ?event= URL reopens the same event modal on load, so
  // the detail is already visible behind where the card was — assert the
  // dialog instead of clicking the covered card.
  await expect(page.getByRole('dialog').filter({ hasText: eventTitle })).toBeVisible()
  await page.getByRole('tab', { name: 'Lập lịch nhắc việc' }).click()
  await expect(page.getByRole('region', { name: 'Quản lý nhắc sự kiện' }).locator(`[data-reminder-id="${reminder.id}"]`)).toBeVisible()

  const recipientContext = await browser.newContext()
  const recipientPage = await recipientContext.newPage()
  try {
    // Matches the recipient chosen above (Operations-capable staff account).
    const recipient = await apiLogin(recipientPage.request, 'e2e_phuta', process.env.E2E_ROLE_PASSWORD || 'E2e-Role-Password-1!')
    await injectSession(recipientPage, recipient)
    await recipientPage.goto('/operations')
    const inboxRow = recipientPage.locator(`[data-reminder-id="${reminder.id}"]`)
    await expect(inboxRow).toBeVisible()
    const cancelResponsePromise = recipientPage.waitForResponse(response => response.url().endsWith(`/api/operations/reminders/${reminder.id}/cancel`) && response.request().method() === 'POST')
    await inboxRow.getByRole('button', { name: 'Hủy lịch nhắc' }).click()
    const cancelResponse = await cancelResponsePromise
    expect(cancelResponse.status()).toBe(200)
    expect((await cancelResponse.json()).data).toMatchObject({ id: reminder.id, status: 'CANCELLED', version: 3 })
  } finally {
    await recipientContext.close()
  }

  const readBack = await page.request.get(`/api/operations/reminders?eventId=${operationEvent.id}`, { headers: authHeaders(admin) })
  expect(readBack.status()).toBe(200)
  expect((await readBack.json()).data).toEqual(expect.arrayContaining([expect.objectContaining({ id: reminder.id, status: 'CANCELLED', version: 3 })]))
})

test('@critical Operations P2 persists three task phases and enforces start/closure gates', async ({ page, browser }, testInfo) => {
  // This journey includes group creation/membership and two authenticated users.
  // WebKit needs ~114s locally (2.3m measured solo) vs 26s on Chromium, so
  // the journey budget is 180s; tighter budgets flake on WebKit only.
  test.setTimeout(180_000)
  const admin = await getAdminSession(page.request)
  const key = testKey(testInfo, 'OPS')
  const eventTitle = `Vận hành ${key}`
  const preparationTitle = `Chuẩn bị nghi thức ${key}`
  const executionTitle = `Phục vụ nghi thức ${key}`
  const followUpTitle = `Đúc kết sau sự kiện ${key}`

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
  await page.getByRole('button', { name: 'Tạo mới' }).click()
  await page.getByRole('menuitem', { name: /Tạo sự kiện Xứ đoàn/ }).click()
  await page.getByLabel('Tên sự kiện').fill(eventTitle)
  await page.getByLabel('Bắt đầu', { exact: true }).fill('2026-10-12T08:00')
  await page.getByLabel('Kết thúc', { exact: true }).fill('2026-10-12T12:00')
  const eventResponsePromise = page.waitForResponse(response => response.url().endsWith('/api/operations/events') && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Lưu bản nháp' }).click()
  const eventResponse = await eventResponsePromise
  expect(eventResponse.status()).toBe(201)
  const operationEvent = (await eventResponse.json()).data as { id: string; version: number }

  // Select-on-create opens the detail dialog directly; workstreams live on
  // their own tab now (Xứ đoàn event → "Mảng phụ trách" vocabulary).
  const eventDialog = page.getByRole('dialog')
  await expect(eventDialog).toContainText(eventTitle)
  const reopenDetail = async () => {
    await page.getByRole('button', { name: 'Đóng chi tiết' }).click()
    await page.getByRole('article').filter({ hasText: eventTitle }).getByRole('button', { name: 'Xem chi tiết' }).click()
    await expect(page.getByRole('dialog')).toContainText(eventTitle)
  }
  await page.getByRole('tab', { name: /Mảng phụ trách/ }).click()

  await page.getByLabel('Tên mảng phụ trách').fill('Nhóm nghi thức')
  await page.getByLabel('Mảng bắt buộc').check()
  // XU_DOAN Fields must name their owning unit (FIELD_SCOPE_REQUIRED since
  // authority hardening): pick the first available unit before creating.
  const fieldUnitSelect = page.getByLabel('Ban/Ngành phụ trách mảng')
  if (await fieldUnitSelect.count()) {
    const firstUnit = fieldUnitSelect.locator('option[value]:not([value=""])').first()
    if (await firstUnit.count()) await fieldUnitSelect.selectOption(await firstUnit.getAttribute('value') as string)
  }
  const groupResponse = page.waitForResponse(response => response.url().endsWith('/api/operations/workstreams') && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Tạo mảng', exact: true }).click()
  const groupCreated = await groupResponse
  expect(groupCreated.status()).toBe(201)
  const group = (await groupCreated.json()).data as { id: string }
  // Member/assignee selects use `person:<id>` candidate values.
  await page.getByLabel('Thành viên nhóm').selectOption(`person:${assigneePersonId}`)
  await page.getByLabel('Vai trò trong nhóm').selectOption('WORKSTREAM_LEAD')
  const memberResponse = page.waitForResponse(response => response.url().endsWith(`/workstreams/${group.id}/members`) && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Phân công vào Mảng' }).click()
  expect((await memberResponse).status()).toBe(201)
  const readyResponse = page.waitForResponse(response => response.url().endsWith(`/workstreams/${group.id}/ready`) && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Mảng đã sẵn sàng' }).click()
  expect((await readyResponse).status()).toBe(200)

  await page.getByRole('tab', { name: /Nhiệm vụ & Phân công/ }).click()
  // W4-era dispatch model: an OWNER goes through a primary invitation
  // (POST /dispatch with an acknowledgement deadline) that only sends when
  // the event reaches PLANNING; the staff user then accepts it from
  // "Việc của tôi". This mirrors the dedicated OPS-DISPATCH journey.
  const createAndInvite = async (title: string, phase: 'PREPARATION' | 'EXECUTION' | 'FOLLOW_UP', dueAt?: string) => {
    await page.getByLabel('Mảng của công việc').selectOption(group.id)
    await page.getByLabel('Tên task').fill(title)
    await page.getByLabel('Giai đoạn nhiệm vụ').selectOption(phase)
    if (dueAt) await page.getByLabel('Hạn task').fill(dueAt)
    await page.getByText('Nhiệm vụ bắt buộc').click()
    const createResponsePromise = page.waitForResponse(response => response.url().endsWith('/api/operations/tasks') && response.request().method() === 'POST')
    await page.getByRole('button', { name: 'Tạo task' }).click()
    const created = (await (await createResponsePromise).json()).data as { id: string; version: number; phase: string }
    expect(created.phase).toBe(phase)
    await page.getByLabel('Task cần phân công').selectOption(created.id)
    await page.getByLabel('Vai trò phân công').selectOption('OWNER')
    await page.getByLabel('Người thực hiện chính').selectOption(`person:${assigneePersonId}`)
    await page.getByLabel('Hạn nhận nhiệm vụ').fill('2035-01-01T12:00')
    const dispatchResponsePromise = page.waitForResponse(response => response.url().endsWith(`/api/operations/tasks/${created.id}/dispatch`) && response.request().method() === 'POST')
    await page.getByRole('button', { name: 'Gửi lời mời phụ trách' }).click()
    expect((await dispatchResponsePromise).status()).toBe(201)
    return created
  }
  const task = await createAndInvite(preparationTitle, 'PREPARATION', '2026-10-11T20:00')
  const executionTask = await createAndInvite(executionTitle, 'EXECUTION')
  const followUpTask = await createAndInvite(followUpTitle, 'FOLLOW_UP')

  // W1.7: "Checklist" opens the task detail as its own dialog above the event
  // dialog; close it again before continuing on the event surface.
  // Row-anchored: the task title text also appears inside the assign form's
  // <option> list, so a bare getByText matches twice and `../..` chains land
  // on the wrong column. Anchor on the row container (the only row-class div
  // containing this title) instead.
  const taskRow = eventDialog.locator('div.flex.items-start.justify-between', { hasText: preparationTitle })
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
  await page.getByRole('button', { name: 'Đóng checklist' }).click()

  // PLANNING sends the invitations; before that the recipient sees nothing.
  const planningResponsePromise = page.waitForResponse(value => value.url().endsWith(`/api/operations/events/${operationEvent.id}/transition`) && value.request().method() === 'POST')
  await page.getByRole('button', { name: 'Bắt đầu lập kế hoạch' }).click()
  expect((await planningResponsePromise).status()).toBe(200)

  const staffContext = await browser.newContext()
  const staffPage = await staffContext.newPage()
  try {
    const staff = await apiLogin(staffPage.request, 'e2e_chunhiem', process.env.E2E_ROLE_PASSWORD || 'E2e-Role-Password-1!')
    await injectSession(staffPage, staff)
    await staffPage.goto('/operations')
    const invitationPanel = staffPage.locator('[aria-label="Lời mời nhận nhiệm vụ"]')
    const acceptInvite = async (taskId: string, title: string) => {
      // Anchor on the invitation card (the only rounded-xl container holding
      // this title): bare `div:last` lands on the nested text column, which
      // has no button, and the title also appears in other rows' subtrees.
      const row = invitationPanel.locator('div.rounded-xl', { hasText: title })
      const response = staffPage.waitForResponse(value => value.url().includes(`/api/operations/tasks/${taskId}/dispatches/`) && value.url().endsWith('/accept') && value.request().method() === 'POST')
      await row.getByRole('button', { name: 'Nhận nhiệm vụ' }).click()
      expect((await response).status()).toBe(200)
    }
    await acceptInvite(task.id, preparationTitle)
    await acceptInvite(executionTask.id, executionTitle)
    await acceptInvite(followUpTask.id, followUpTitle)
    const completeResponse = staffPage.waitForResponse(response => response.url().endsWith(`/api/operations/tasks/${task.id}/transition`) && response.request().method() === 'POST')
    await staffPage.getByRole('article').filter({ hasText: preparationTitle }).getByRole('button', { name: 'Hoàn tất' }).click()
    expect((await completeResponse).status()).toBe(200)

    const readBack = await page.request.get(`/api/operations/tasks/${task.id}`, { headers: authHeaders(admin) })
    expect(readBack.status()).toBe(200)
    expect((await readBack.json()).data.task).toMatchObject({ id: task.id, workstreamId: group.id, phase: 'PREPARATION', status: 'DONE', parishId: 'gia-ton' })

    // Refresh the event projection after the other authenticated actor accepted/completed work.
    await reopenDetail()
    // W1.1: with two required tasks still open, the READY/LIVE gates answer
    // READINESS_BLOCKED and the manager path is the override dialog — the
    // button must NOT stay dead-disabled for an override holder.
    const transitionStep = async (label: string) => {
      const first = page.waitForResponse(value => value.url().endsWith(`/api/operations/events/${operationEvent.id}/transition`) && value.request().method() === 'POST')
      await page.getByRole('button', { name: label }).click()
      const firstResponse = await first
      if (firstResponse.status() === 200) return
      expect(((await firstResponse.json()) as { error?: { code?: string } }).error?.code).toBe('READINESS_BLOCKED')
      const retry = page.waitForResponse(value => value.url().endsWith(`/api/operations/events/${operationEvent.id}/transition`) && value.request().method() === 'POST')
      await page.getByRole('textbox', { name: 'Lý do ghi đè' }).fill('E2E: các việc phụ vẫn chạy đúng kế hoạch.')
      await page.getByRole('button', { name: 'Xác nhận Ghi đè & Chuyển' }).click()
      expect((await retry).status()).toBe(200)
    }
    await transitionStep('Chuyển sang chuẩn bị')
    await transitionStep('Đánh dấu sẵn sàng')
    await transitionStep('Bắt đầu sự kiện')
    await page.getByRole('textbox', { name: 'Tổng kết kết quả' }).fill('Hoàn tất đúng kế hoạch E2E.')
    expect(page.getByRole('button', { name: 'Hoàn tất sự kiện' })).toBeDisabled()
    await expect(eventDialog).toContainText(executionTitle)
    await expect(eventDialog).toContainText(followUpTitle)

    const completeFutureTask = async (taskId: string, title: string) => {
      const response = staffPage.waitForResponse(value => value.url().endsWith(`/api/operations/tasks/${taskId}/transition`) && value.request().method() === 'POST')
      await staffPage.getByRole('article').filter({ hasText: title }).getByRole('button', { name: 'Hoàn tất' }).click()
      expect((await response).status()).toBe(200)
    }
    await completeFutureTask(executionTask.id, executionTitle)
    await completeFutureTask(followUpTask.id, followUpTitle)

    await reopenDetail()
    // Reopening clears the modal-local outcome summary (by design), so fill
    // it again now that every required task is DONE.
    await page.getByRole('textbox', { name: 'Tổng kết kết quả' }).fill('Hoàn tất đúng kế hoạch E2E.')
    await expect(page.getByRole('button', { name: 'Hoàn tất sự kiện' })).toBeEnabled()
    const finalResponse = page.waitForResponse(value => value.url().endsWith(`/api/operations/events/${operationEvent.id}/transition`) && value.request().method() === 'POST')
    await page.getByRole('button', { name: 'Hoàn tất sự kiện' }).click()
    expect((await finalResponse).status()).toBe(200)
    const eventReadBack = await page.request.get(`/api/operations/events/${operationEvent.id}`, { headers: authHeaders(admin) })
    expect((await eventReadBack.json()).data).toMatchObject({ event: { status: 'COMPLETED' }, readiness: { percent: 100, blockers: [] } })
    for (const expected of [executionTask, followUpTask]) {
      const taskReadBack = await page.request.get(`/api/operations/tasks/${expected.id}`, { headers: authHeaders(admin) })
      expect((await taskReadBack.json()).data.task).toMatchObject({ id: expected.id, phase: expected.phase, status: 'DONE' })
    }
  } finally {
    await staffContext.close()
  }
})
