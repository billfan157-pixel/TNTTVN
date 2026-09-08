import { newIdempotencyKey, request } from './core'

const command = <T>(method: 'POST' | 'PUT', path: string, body?: unknown) =>
  request<T>(method, path, body, 0, { 'Idempotency-Key': newIdempotencyKey() })

export interface OperationAssignment {
  id: string
  parishId: string
  taskId: string
  userId?: string | null
  personId?: string | null
  assignmentRole: 'OWNER' | 'CONTRIBUTOR' | 'APPROVER' | 'OBSERVER'
  acknowledgementStatus: 'PENDING' | 'ACCEPTED' | 'DECLINED'
  version: number
}

export interface OperationEvent {
  id: string
  parishId: string
  title: string
  description?: string | null
  eventType: string
  startsAt: string
  endsAt: string
  timezone: string
  location?: string | null
  status: 'DRAFT' | 'PLANNING' | 'READY' | 'LIVE' | 'COMPLETED' | 'CANCELLED'
  visibility: 'INTERNAL' | 'PUBLIC_SUMMARY'
  expectedHeadcount?: number | null
  sourceParishEventId?: string | null
  scopeUnitId?: string | null
  outcomeSummary?: string | null
  version: number
}

export interface OperationTask {
  id: string
  parishId: string
  operationEventId?: string | null
  workstreamId?: string | null
  title: string
  description?: string | null
  status: 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'CANCELLED'
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  isRequired: boolean
  dueAt?: string | null
  blockedReason?: string | null
  cancellationReason?: string | null
  approvalStatus: 'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'REJECTED'
  myAssignments?: OperationAssignment[]
  version: number
}

export interface OperationChecklistItem {
  id: string
  parishId: string
  taskId: string
  label: string
  isRequired: boolean
  isDone: boolean
  completedBy?: string | null
  completedAt?: string | null
  sortOrder: number
}

export interface OperationTaskComment {
  id: string
  parishId: string
  taskId: string
  authorUserId: string
  content: string
  evidenceUrl?: string | null
  createdAt: string
}

export interface OperationTaskDetail {
  task: OperationTask
  assignees: OperationAssignment[]
  checklist: OperationChecklistItem[]
  comments: OperationTaskComment[]
  dependencies: unknown[]
  permissions: Record<string, boolean>
}

export interface OperationReadiness {
  percent: number
  blockers: Array<{ type: string; id: string; label: string }>
}

export interface OperationReminder {
  id: string
  parishId: string
  triggerAt: string
  kind: 'TASK_DUE' | 'EVENT_START' | 'OVERDUE'
  status: 'PENDING' | 'ENQUEUED' | 'SENT' | 'FAILED' | 'CANCELLED'
  readAt?: string | null
  sentAt?: string | null
  createdAt: string
}

export interface OperationWorkstream {
  id: string
  parishId: string
  operationEventId?: string | null
  name: string
  status: 'PLANNING' | 'IN_PROGRESS' | 'READY' | 'BLOCKED'
  isRequired: boolean
  version: number
}

export interface OperationWorkstreamMember {
  id: string
  parishId: string
  workstreamId: string
  userId: string | null
  personId: string | null
  operationRole: 'WORKSTREAM_LEAD' | 'CONTRIBUTOR' | 'APPROVER' | 'OBSERVER'
  startsAt: string | null
  endsAt: string | null
  version: number
}

export interface OperationWorkstreamDetail {
  workstream: OperationWorkstream
  members: OperationWorkstreamMember[]
  permissions: Record<string, boolean>
}

export interface OperationEventDetail {
  event: OperationEvent
  workstreams: OperationWorkstream[]
  tasks: OperationTask[]
  assignees: OperationAssignment[]
  readiness: OperationReadiness
  permissions: Record<string, boolean>
}

export interface OperationsListPage<T> {
  success: true
  data: T[]
  meta: { page: number; limit: number; total: number; totalPages: number }
  error: null
}

const paged = <T>(path: string, page = 1, limit = 50) => {
  const separator = path.includes('?') ? '&' : '?'
  return request<OperationsListPage<T>>('GET', `${path}${separator}page=${page}&limit=${limit}`, undefined, 0, undefined, false, 'json', true)
}

export const operationsApi = {
  cancelReminder: (id: string, reason: string) => command<{ id: string; parishId: string; status: 'CANCELLED' }>('POST', `/operations/reminders/${encodeURIComponent(id)}/cancel`, { reason }),
  createReminder: (body: ({ eventId: string; kind: 'EVENT_START' } | { taskId: string; kind: 'TASK_DUE' }) & { recipientUserId: string; triggerAt: string }) => command<OperationReminder>('POST', '/operations/reminders', body),
  getWorkstream: (id: string) => request<OperationWorkstreamDetail>('GET', `/operations/workstreams/${encodeURIComponent(id)}`),
  createWorkstream: (body: { eventId: string; name: string; isRequired: boolean }) => command<OperationWorkstream>('POST', '/operations/workstreams', body),
  addWorkstreamMember: (id: string, body: { version: number; personId: string; operationRole: OperationWorkstreamMember['operationRole'] }) => command<OperationWorkstreamMember & { workstreamVersion: number }>('POST', `/operations/workstreams/${encodeURIComponent(id)}/members`, body),
  removeWorkstreamMember: (id: string, memberId: string, body: { version: number; memberVersion: number; reason: string }) => command<{ member: OperationWorkstreamMember; workstreamVersion: number }>('POST', `/operations/workstreams/${encodeURIComponent(id)}/members/${encodeURIComponent(memberId)}/remove`, body),
  setWorkstreamReady: (id: string, body: { version: number; status: 'READY' | 'BLOCKED'; reason?: string }) => command<OperationWorkstream>('POST', `/operations/workstreams/${encodeURIComponent(id)}/ready`, body),
  getEvents: (page = 1, limit = 50) => paged<OperationEvent>('/operations/events', page, limit),
  getTasks: (mine = false, page = 1, limit = 50) => paged<OperationTask>(`/operations/tasks${mine ? '?mine=true' : ''}`, page, limit),
  getApprovalQueue: (page = 1) => paged<OperationTask>('/operations/tasks?queue=approval', page, 50),
  getReminders: (page = 1, limit = 50) => paged<OperationReminder>('/operations/reminders/inbox', page, limit),
  getPermissions: (unitId?: string) => request<{ parishId: string; permissions: Record<string, boolean> }>('GET', `/operations/permissions${unitId ? `?unitId=${encodeURIComponent(unitId)}` : ''}`),
  getEvent: (id: string) => request<OperationEventDetail>('GET', `/operations/events/${encodeURIComponent(id)}`),
  getTask: (id: string) => request<OperationTaskDetail>('GET', `/operations/tasks/${encodeURIComponent(id)}`),
  getReadiness: (id: string) => request<OperationReadiness>('GET', `/operations/events/${encodeURIComponent(id)}/readiness`),
  createEvent: (body: { title: string; eventType: string; startsAt: string; endsAt: string; timezone: string; scopeUnitId?: string | null; organizerUserId?: string | null }) => command<OperationEvent>('POST', '/operations/events', body),
  createTask: (body: { title: string; eventId?: string | null; workstreamId?: string | null; dueAt?: string | null; priority?: OperationTask['priority']; isRequired?: boolean; requiresApproval?: boolean }) => command<OperationTask>('POST', '/operations/tasks', body),
  assignTask: (id: string, body: { version: number; userId?: string | null; personId?: string | null; assignmentRole: OperationAssignment['assignmentRole']; note?: string }) => command<{ assignment: OperationAssignment; taskVersion: number; conflictWarnings: Array<{ id: string; startsAt: string; endsAt: string; reason?: string | null }> }>('POST', `/operations/tasks/${encodeURIComponent(id)}/assign`, body),
  transitionEvent: (id: string, body: { version: number; status: OperationEvent['status']; reason?: string; outcomeSummary?: string; override?: boolean }) => command<OperationEvent>('POST', `/operations/events/${encodeURIComponent(id)}/transition`, body),
  transitionTask: (id: string, body: { version: number; status: OperationTask['status']; completionNote?: string; blockedReason?: string; cancellationReason?: string }) => command<OperationTask>('POST', `/operations/tasks/${encodeURIComponent(id)}/transition`, body),
  acknowledgeTask: (id: string, assignmentId: string, version: number, status: 'ACCEPTED' | 'DECLINED', note?: string) => command<OperationAssignment>('POST', `/operations/tasks/${encodeURIComponent(id)}/acknowledge`, { assignmentId, version, status, note }),
  createChecklistItem: (taskId: string, body: { version: number; label: string; isRequired?: boolean; sortOrder?: number }) => command<{ item: OperationChecklistItem; taskVersion: number; approvalStatus: OperationTask['approvalStatus'] }>('POST', `/operations/tasks/${encodeURIComponent(taskId)}/checklist`, body),
  updateChecklistItem: (taskId: string, itemId: string, body: { version: number; isDone: boolean }) => command<{ item: OperationChecklistItem; taskVersion: number; approvalStatus: OperationTask['approvalStatus'] }>('POST', `/operations/tasks/${encodeURIComponent(taskId)}/checklist/${encodeURIComponent(itemId)}`, body),
  markReminderRead: (id: string) => command<{ id: string; readAt: string }>('POST', `/operations/reminders/${encodeURIComponent(id)}/read`),
  approveTask: (id: string, body: { version: number; decision: 'APPROVED' | 'REJECTED'; reason?: string }) => command<OperationTask>('POST', `/operations/tasks/${encodeURIComponent(id)}/approve`, body),
  handoverTask: (id: string, body: { version: number; assignmentId: string; assignmentVersion: number; personId: string; reason: string }) => command<{ assignment: OperationAssignment; taskVersion: number; conflictWarnings: Array<{ id: string; startsAt: string; endsAt: string }> }>('POST', `/operations/tasks/${encodeURIComponent(id)}/handover`, body),
  commentTask: (id: string, body: { content: string; evidenceUrl?: string }) => command<OperationTaskComment>('POST', `/operations/tasks/${encodeURIComponent(id)}/comments`, body),
}
