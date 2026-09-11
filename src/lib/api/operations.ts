import { newIdempotencyKey, request } from './core'

const command = <T>(method: 'POST' | 'PUT', path: string, body?: unknown, idempotencyKey = newIdempotencyKey()) =>
  request<T>(method, path, body, 0, { 'Idempotency-Key': idempotencyKey })

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

export interface OperationTaskDispatch {
  id: string
  parishId: string
  taskId: string
  primaryUserId?: string | null
  primaryPersonId?: string | null
  reserveUserId?: string | null
  reservePersonId?: string | null
  acknowledgeBy: string
  primaryInvitedAt?: string | null
  reserveInviteAt?: string | null
  reserveInvitedAt?: string | null
  acceptedTarget?: 'PRIMARY' | 'RESERVE' | null
  acceptedAssignmentId?: string | null
  status: 'SCHEDULED' | 'PENDING' | 'ACCEPTED' | 'CANCELLED'
  version: number
}

export interface OperationTaskDispatchInvitation {
  id: string
  parishId: string
  taskId: string
  version: number
  target: 'PRIMARY' | 'RESERVE'
  acknowledgeBy: string
  invitedAt: string
  taskTitle: string
  eventId: string
  eventTitle: string
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
  status: 'DRAFT' | 'PLANNING' | 'PREPARING' | 'READY' | 'LIVE' | 'COMPLETED' | 'CANCELLED'
  visibility: 'INTERNAL' | 'PUBLIC_SUMMARY'
  expectedHeadcount?: number | null
  sourceParishEventId?: string | null
  sourceTemplateId?: string | null
  sourceTemplateVersion?: number | null
  scopeUnitId?: string | null
  outcomeSummary?: string | null
  completionRecordId?: string | null
  automationPaused?: boolean
  automationPausedAt?: string | null
  automationPausedBy?: string | null
  automationPauseReason?: string | null
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
  phase: 'PREPARATION' | 'EXECUTION' | 'FOLLOW_UP'
  isRequired: boolean
  dueAt?: string | null
  scheduledStartAt?: string | null
  scheduledEndAt?: string | null
  blockedReason?: string | null
  cancellationReason?: string | null
  approvalStatus: 'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'REJECTED'
  myAssignments?: OperationAssignment[]
  version: number
}

export interface OperationEventTemplate {
  id: string
  parishId: string
  scopeUnitId: string | null
  name: string
  description?: string | null
  latestVersion: number
  version: number
  isActive: boolean
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
}

export interface OperationEventTemplatePreview {
  template: OperationEventTemplate
  version: number
  preview: {
    event: {
      title: string
      description: string | null
      eventType: string
      durationMinutes: number
      location: string | null
      expectedHeadcount: number | null
      startsAt: string
      endsAt: string
    }
    tasks: Array<{
      index: number
      title: string
      description: string | null
      phase: OperationTask['phase']
      priority: OperationTask['priority']
      isRequired: boolean
      requiresApproval: boolean
      dueOffsetMinutes: number | null
      dueAt: string | null
      scheduledStartOffsetMinutes?: number | null
      scheduledEndOffsetMinutes?: number | null
      scheduledStartAt?: string | null
      scheduledEndAt?: string | null
      checklist: Array<{ label: string; isRequired: boolean; sortOrder: number }>
    }>
  }
}

export interface OperationEventRetrospective {
  parishId: string
  eventId: string
  lessonsLearned: string
  improvementNotes?: string | null
  version: number
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
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
  taskId?: string | null
  eventId?: string | null
  recipientUserId?: string
  triggerAt: string
  kind: 'TASK_DUE' | 'EVENT_START' | 'OVERDUE'
  status: 'PENDING' | 'ENQUEUED' | 'SENT' | 'FAILED' | 'CANCELLED'
  version: number
  readAt?: string | null
  sentAt?: string | null
  createdAt: string
}

export interface OperationBlockout {
  id: string
  parishId: string
  userId: string | null
  personId: string | null
  startsAt: string
  endsAt: string
  reason: string | null
  version: number
  createdAt: string
}

export interface OperationWorkstream {
  id: string
  parishId: string
  operationEventId?: string | null
  sourceUnitId: string | null
  name: string
  status: 'PLANNING' | 'IN_PROGRESS' | 'READY' | 'BLOCKED'
  isRequired: boolean
  version: number
}

export interface OperationUnitOption {
  id: string
  parishId: string
  parentId: string | null
  name: string
  unitType: 'BOARD' | 'COMMITTEE' | 'BRANCH' | 'CHAPTER' | 'OTHER'
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

export interface OperationCandidate {
  parishId: string
  personId: string | null
  userId: string | null
  displayName: string
  eligibility: 'ACTIONABLE' | 'PLANNING_ONLY' | 'INELIGIBLE'
  inResourceScope: boolean | null
}

export type OperationCandidateTarget = { taskId: string } | { workstreamId: string } | { eventId: string }
export type OperationAssignmentTarget = { personId: string; userId?: never } | { userId: string; personId?: never }

export interface OperationEventDetail {
  event: OperationEvent
  retrospective?: OperationEventRetrospective | null
  workstreams: OperationWorkstream[]
  tasks: OperationTask[]
  assignees: OperationAssignment[]
  readiness: OperationReadiness
  closure?: { blockers: Array<{ type: string; id: string; label: string }> }
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
  getMyBlockouts: (page = 1, limit = 500) => paged<OperationBlockout>('/operations/blockouts/mine', page, limit),
  createBlockout: (body: { userId: string; startsAt: string; endsAt: string; reason?: string | null }) => command<OperationBlockout>('POST', '/operations/blockouts', body),
  updateBlockout: (id: string, body: { version: number; startsAt: string; endsAt: string; reason: string | null }) => command<OperationBlockout>('PUT', `/operations/blockouts/${encodeURIComponent(id)}`, body),
  revokeBlockout: (id: string, version: number) => command<{ id: string; parishId: string; version: number; deletedAt: string }>('POST', `/operations/blockouts/${encodeURIComponent(id)}/revoke`, { version }),
  getCandidates: (target: OperationCandidateTarget, page = 1, limit = 500) => {
    const [field, value] = Object.entries(target)[0]
    return paged<OperationCandidate>(`/operations/candidates?${field}=${encodeURIComponent(value)}`, page, limit)
  },
  getAssignableUnits: (page = 1, limit = 500) => paged<OperationUnitOption>('/operations/units', page, limit),
  getEventTemplates: (page = 1, limit = 100, archived = false) => paged<OperationEventTemplate>(`/operations/templates?archived=${archived}`, page, limit),
  previewEventTemplate: (id: string, startsAt: string, version?: number) => request<OperationEventTemplatePreview>('GET', `/operations/templates/${encodeURIComponent(id)}/preview?startsAt=${encodeURIComponent(startsAt)}${version ? `&version=${version}` : ''}`),
  createEventTemplate: (eventId: string, body: { eventVersion: number; name: string; description?: string | null }, idempotencyKey?: string) => command<OperationEventTemplate>('POST', `/operations/events/${encodeURIComponent(eventId)}/templates`, body, idempotencyKey),
  createEventTemplateVersion: (id: string, body: { expectedVersion: number; expectedLatestVersion: number; sourceEventId: string; sourceEventVersion: number; reason: string }, idempotencyKey?: string) => command<OperationEventTemplate>('POST', `/operations/templates/${encodeURIComponent(id)}/versions`, body, idempotencyKey),
  archiveEventTemplate: (id: string, body: { expectedVersion: number; expectedLatestVersion: number; reason: string }, idempotencyKey?: string) => command<OperationEventTemplate>('POST', `/operations/templates/${encodeURIComponent(id)}/archive`, body, idempotencyKey),
  restoreEventTemplate: (id: string, body: { expectedVersion: number; expectedLatestVersion: number; reason: string }, idempotencyKey?: string) => command<OperationEventTemplate>('POST', `/operations/templates/${encodeURIComponent(id)}/restore`, body, idempotencyKey),
  instantiateEventTemplate: (id: string, body: { templateVersion: number; startsAt: string; timezone: string; visibility?: OperationEvent['visibility']; organizerUserId?: string | null; organizerPersonId?: string | null }, idempotencyKey?: string) => command<{ event: OperationEvent; tasks: OperationTask[]; checklist: OperationChecklistItem[]; template: { id: string; name: string; version: number } }>('POST', `/operations/templates/${encodeURIComponent(id)}/instantiate`, body, idempotencyKey),
  getStandaloneWorkstreams: (page = 1, limit = 500) => paged<OperationWorkstream>('/operations/workstreams?standalone=true', page, limit),
  cancelReminder: (id: string, expectedVersion: number, reason: string) => command<{ id: string; parishId: string; status: 'CANCELLED'; version: number }>('POST', `/operations/reminders/${encodeURIComponent(id)}/cancel`, { expectedVersion, reason }),
  rescheduleReminder: (id: string, body: { expectedVersion: number; triggerAt: string; reason: string }) => command<OperationReminder>('POST', `/operations/reminders/${encodeURIComponent(id)}/reschedule`, body),
  createReminder: (body: ({ eventId: string; kind: 'EVENT_START' } | { taskId: string; kind: 'TASK_DUE' }) & { recipientUserId: string; triggerAt: string }) => command<OperationReminder>('POST', '/operations/reminders', body),
  getResourceReminders: (target: { taskId: string } | { eventId: string }, page = 1, limit = 50) => paged<OperationReminder>(`/operations/reminders?${'taskId' in target ? `taskId=${encodeURIComponent(target.taskId)}` : `eventId=${encodeURIComponent(target.eventId)}`}`, page, limit),
  getWorkstream: (id: string) => request<OperationWorkstreamDetail>('GET', `/operations/workstreams/${encodeURIComponent(id)}`),
  createWorkstream: (body: { eventId?: string | null; sourceUnitId?: string | null; name: string; isRequired: boolean }) => command<OperationWorkstream>('POST', '/operations/workstreams', body),
  addWorkstreamMember: (id: string, body: { version: number; operationRole: OperationWorkstreamMember['operationRole'] } & OperationAssignmentTarget) => command<OperationWorkstreamMember & { workstreamVersion: number }>('POST', `/operations/workstreams/${encodeURIComponent(id)}/members`, body),
  removeWorkstreamMember: (id: string, memberId: string, body: { version: number; memberVersion: number; reason: string }) => command<{ member: OperationWorkstreamMember; workstreamVersion: number }>('POST', `/operations/workstreams/${encodeURIComponent(id)}/members/${encodeURIComponent(memberId)}/remove`, body),
  replaceWorkstreamLead: (id: string, body: {
    version: number
    currentLeadMemberId?: string | null
    currentLeadMemberVersion?: number | null
    endsAt?: string | null
    reason: string
  } & OperationAssignmentTarget) => command<{ previousLead: OperationWorkstreamMember | null; newLead: OperationWorkstreamMember; workstreamVersion: number }>('POST', `/operations/workstreams/${encodeURIComponent(id)}/lead/replace`, body),
  updateWorkstreamMemberValidity: (id: string, memberId: string, body: { version: number; memberVersion: number; startsAt: string | null; endsAt: string | null; reason: string }) => command<{ member: OperationWorkstreamMember; workstreamVersion: number }>('PUT', `/operations/workstreams/${encodeURIComponent(id)}/members/${encodeURIComponent(memberId)}/validity`, body),
  setWorkstreamReady: (id: string, body: { version: number; status: 'READY' | 'BLOCKED'; reason?: string }) => command<OperationWorkstream>('POST', `/operations/workstreams/${encodeURIComponent(id)}/ready`, body),
  getEvents: (page = 1, limit = 50) => paged<OperationEvent>('/operations/events', page, limit),
  getTasks: (mine = false, page = 1, limit = 50) => paged<OperationTask>(`/operations/tasks${mine ? '?mine=true' : ''}`, page, limit),
  getDispatchInbox: (page = 1, limit = 100) => paged<OperationTaskDispatchInvitation>('/operations/dispatches/inbox', page, limit),
  getWorkstreamTasks: (workstreamId: string, page = 1, limit = 50) => paged<OperationTask>(`/operations/tasks?workstreamId=${encodeURIComponent(workstreamId)}`, page, limit),
  getApprovalQueue: (page = 1) => paged<OperationTask>('/operations/tasks?queue=approval', page, 50),
  getReminders: (page = 1, limit = 50) => paged<OperationReminder>('/operations/reminders/inbox', page, limit),
  getPermissions: (unitId?: string) => request<{ parishId: string; permissions: Record<string, boolean> }>('GET', `/operations/permissions${unitId ? `?unitId=${encodeURIComponent(unitId)}` : ''}`),
  getEvent: (id: string) => request<OperationEventDetail>('GET', `/operations/events/${encodeURIComponent(id)}`),
  getTask: (id: string) => request<OperationTaskDetail>('GET', `/operations/tasks/${encodeURIComponent(id)}`),
  getReadiness: (id: string) => request<OperationReadiness>('GET', `/operations/events/${encodeURIComponent(id)}/readiness`),
  createEvent: (body: { title: string; eventType: string; startsAt: string; endsAt: string; timezone: string; location?: string | null; visibility?: OperationEvent['visibility']; scopeUnitId?: string | null; organizerUserId?: string | null }) => command<OperationEvent>('POST', '/operations/events', body),
  updateEvent: (id: string, body: { version: number; title?: string; eventType?: string; startsAt?: string; endsAt?: string; timezone?: string; location?: string | null; visibility?: OperationEvent['visibility'] }) => command<OperationEvent>('PUT', `/operations/events/${encodeURIComponent(id)}`, body),
  createTask: (body: { title: string; eventId?: string | null; workstreamId?: string | null; dueAt?: string | null; scheduledStartAt?: string | null; scheduledEndAt?: string | null; priority?: OperationTask['priority']; phase?: OperationTask['phase']; isRequired?: boolean; requiresApproval?: boolean }) => command<OperationTask>('POST', '/operations/tasks', body),
  assignTask: (id: string, body: { version: number; assignmentRole: OperationAssignment['assignmentRole']; note?: string } & OperationAssignmentTarget) => command<{ assignment: OperationAssignment; taskVersion: number; conflictWarnings: Array<{ id: string; startsAt: string; endsAt: string; reason?: string | null }> }>('POST', `/operations/tasks/${encodeURIComponent(id)}/assign`, body),
  createTaskDispatch: (id: string, body: { version: number; acknowledgeBy: string; primaryUserId?: string; primaryPersonId?: string; reserveUserId?: string; reservePersonId?: string }) => command<{ dispatch: OperationTaskDispatch; taskVersion: number }>('POST', `/operations/tasks/${encodeURIComponent(id)}/dispatch`, body),
  acceptTaskDispatch: (taskId: string, dispatchId: string, body: { version: number; target: 'PRIMARY' | 'RESERVE' }) => command<{ dispatch: OperationTaskDispatch; assignment: OperationAssignment; taskVersion: number }>('POST', `/operations/tasks/${encodeURIComponent(taskId)}/dispatches/${encodeURIComponent(dispatchId)}/accept`, body),
  transitionEvent: (id: string, body: { version: number; status: OperationEvent['status']; reason?: string; outcomeSummary?: string; override?: boolean }) => command<OperationEvent>('POST', `/operations/events/${encodeURIComponent(id)}/transition`, body),
  resumeEventAutomation: (id: string, body: { version: number; reason: string }) => command<OperationEvent>('POST', `/operations/events/${encodeURIComponent(id)}/automation/resume`, body),
  saveEventRetrospective: (id: string, body: { expectedVersion: number | null; lessonsLearned: string; improvementNotes?: string | null }) => command<OperationEventRetrospective>('PUT', `/operations/events/${encodeURIComponent(id)}/retrospective`, body),
  createEventFollowUp: (id: string, body: { eventVersion: number; title: string; description?: string | null; dueAt: string; priority?: OperationTask['priority'] } & OperationAssignmentTarget) => command<{ task: OperationTask; assignment: OperationAssignment; eventVersion: number; conflictWarnings: Array<{ id: string; startsAt: string; endsAt: string }> }>('POST', `/operations/events/${encodeURIComponent(id)}/follow-ups`, body),
  transitionTask: (id: string, body: { version: number; status: OperationTask['status']; completionNote?: string; blockedReason?: string; cancellationReason?: string }) => command<OperationTask>('POST', `/operations/tasks/${encodeURIComponent(id)}/transition`, body),
  restoreTask: (id: string, body: { version: number; reason: string }) => command<OperationTask>('POST', `/operations/tasks/${encodeURIComponent(id)}/restore`, body),
  acknowledgeTask: (id: string, assignmentId: string, version: number, status: 'ACCEPTED' | 'DECLINED', note?: string) => command<OperationAssignment>('POST', `/operations/tasks/${encodeURIComponent(id)}/acknowledge`, { assignmentId, version, status, note }),
  createChecklistItem: (taskId: string, body: { version: number; label: string; isRequired?: boolean; sortOrder?: number }) => command<{ item: OperationChecklistItem; taskVersion: number; approvalStatus: OperationTask['approvalStatus'] }>('POST', `/operations/tasks/${encodeURIComponent(taskId)}/checklist`, body),
  updateChecklistItem: (taskId: string, itemId: string, body: { version: number; isDone: boolean }) => command<{ item: OperationChecklistItem; taskVersion: number; approvalStatus: OperationTask['approvalStatus'] }>('POST', `/operations/tasks/${encodeURIComponent(taskId)}/checklist/${encodeURIComponent(itemId)}`, body),
  markReminderRead: (id: string) => command<{ id: string; readAt: string }>('POST', `/operations/reminders/${encodeURIComponent(id)}/read`),
  approveTask: (id: string, body: { version: number; decision: 'APPROVED' | 'REJECTED'; reason?: string }) => command<OperationTask>('POST', `/operations/tasks/${encodeURIComponent(id)}/approve`, body),
  handoverTask: (id: string, body: { version: number; assignmentId: string; assignmentVersion: number; reason: string } & OperationAssignmentTarget) => command<{ assignment: OperationAssignment; taskVersion: number; conflictWarnings: Array<{ id: string; startsAt: string; endsAt: string }> }>('POST', `/operations/tasks/${encodeURIComponent(id)}/handover`, body),
  commentTask: (id: string, body: { content: string; evidenceUrl?: string }) => command<OperationTaskComment>('POST', `/operations/tasks/${encodeURIComponent(id)}/comments`, body),
}
