import { newIdempotencyKey, request } from './core'

const command = <T>(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown, idempotencyKey?: string) =>
  request<T>(method, path, body, 0, { 'Idempotency-Key': idempotencyKey || newIdempotencyKey() })

export interface OperationAssignment {
  id: string
  parishId: string
  taskId: string
  userId?: string | null
  personId?: string | null
  assignmentRole: 'OWNER' | 'CONTRIBUTOR'
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
  eventScopeType?: 'XU_DOAN' | 'UNIT' | null
  expectedHeadcount?: number | null
  sourceParishEventId?: string | null
  sourceTemplateId?: string | null
  sourceTemplateVersion?: number | null
  scopeUnitId?: string | null
  organizerUserId?: string | null
  organizerPersonId?: string | null
  outcomeSummary?: string | null
  completionRecordId?: string | null
  automationPaused?: boolean
  automationPausedAt?: string | null
  automationPausedBy?: string | null
  automationPauseReason?: string | null
  version: number
  createdBy?: string
  createdAt?: string
  updatedAt?: string
  /**
   * Server-resolved display names for list rows (name only, same parish). The
   * workspace shows "who created / who is responsible" without a per-row detail
   * fetch; absent on cached/legacy payloads, so the UI must render tolerantly.
   */
  createdByName?: string | null
  organizerName?: string | null
}

export interface OperationTask {
  id: string
  parishId: string
  operationEventId?: string | null
  workstreamId?: string | null
  scopeUnitId?: string | null
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

/** W4.2b: GET /tasks/:id now ships dependency edges enriched with the
 *  depends-on task's title/status (server LEFT JOIN; a soft-deleted source
 *  resolves to null title/status but the edge still explains the block). */
export interface OperationTaskDependency {
  taskId: string
  dependsOnTaskId: string
  dependencyType: 'BLOCKED_BY'
  dependsOnTitle: string | null
  dependsOnStatus: OperationTask['status'] | null
}

export interface OperationTaskDetail {
  task: OperationTask
  assignees: OperationAssignment[]
  checklist: OperationChecklistItem[]
  comments: OperationTaskComment[]
  dependencies: OperationTaskDependency[]
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
  kind: 'TASK_DUE' | 'EVENT_START' | 'OVERDUE' | 'MANAGER_PREP'
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
  // W2.5 (S-03): server detail rows already carry these; declaring them lets
  // the edit form prefill and the list surface a BLOCKED group's reason.
  description?: string | null
  blockedReason?: string | null
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
  operationRole: 'WORKSTREAM_LEAD' | 'OBSERVER'
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

export interface OperationEventParticipant {
  id: string
  parishId: string
  eventId: string
  userId: string | null
  personId: string | null
  participantRole: string
  attendanceStatus: 'PLANNED' | 'CONFIRMED' | 'DECLINED' | 'ATTENDED' | 'ABSENT'
  version: number
  createdAt: string
}

export interface OperationEventHeadcount {
  expected: number | null
  total: number
  confirmed: number
  attended: number
}

export interface OperationEventDetail {
  event: OperationEvent
  organizer?: { userId: string | null; personId: string | null; displayName: string | null } | null
  /** Creator account of the event aggregate (detail header badge); name only. */
  creator?: { userId: string | null; displayName: string | null } | null
  retrospective?: OperationEventRetrospective | null
  workstreams: OperationWorkstream[]
  tasks: OperationTask[]
  assignees: OperationAssignment[]
  /** W4.2a: server detail already returned this; the client type was missing it. */
  participants?: OperationEventParticipant[]
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

/** Business creation options for the "+ Tạo mới" menu — server-authoritative (O8: codes EN, UI maps to VI). */
export type OperationsPositionCode = 'PARISH_LEADER' | 'PARISH_SECRETARY' | 'PARISH_DEPUTY' | 'BRANCH_LEADER' | 'BRANCH_DEPUTY' | 'COMMITTEE_LEADER' | 'COMMITTEE_DEPUTY'
export const OPERATIONS_POSITION_LABELS_VI: Record<OperationsPositionCode, string> = {
  PARISH_LEADER: 'Xứ đoàn trưởng',
  PARISH_SECRETARY: 'Thư ký Xứ đoàn',
  PARISH_DEPUTY: 'Phó Xứ đoàn',
  BRANCH_LEADER: 'Trưởng Ngành',
  BRANCH_DEPUTY: 'Phó Ngành',
  COMMITTEE_LEADER: 'Trưởng Ban',
  COMMITTEE_DEPUTY: 'Phó Ban',
}
export interface OperationsOrganizerOption {
  userId: string
  displayName: string
  positionCode: string
}
export interface OperationsCreationUnitOption {
  id: string
  name: string
  unitType: 'BRANCH' | 'COMMITTEE'
  canCreateEvent: boolean
  canCreateTask: boolean
  organizers: OperationsOrganizerOption[]
  myRole: string | null
}
export interface OperationsCreationOptions {
  canCreateXuDoanEvent: boolean
  xuDoanOrganizers: OperationsOrganizerOption[]
  units: OperationsCreationUnitOption[]
}

const paged = <T>(path: string, page = 1, limit = 50) => {
  const separator = path.includes('?') ? '&' : '?'
  return request<OperationsListPage<T>>('GET', `${path}${separator}page=${page}&limit=${limit}`, undefined, 0, undefined, false, 'json', true)
}

export const operationsApi = {
  getMyBlockouts: (page = 1, limit = 500) => paged<OperationBlockout>('/operations/blockouts/mine', page, limit),
  createBlockout: (body: { userId: string; startsAt: string; endsAt: string; reason?: string | null }, idempotencyKey?: string) => command<OperationBlockout>('POST', '/operations/blockouts', body, idempotencyKey),
  updateBlockout: (id: string, body: { version: number; startsAt: string; endsAt: string; reason: string | null }, idempotencyKey?: string) => command<OperationBlockout>('PUT', `/operations/blockouts/${encodeURIComponent(id)}`, body, idempotencyKey),
  revokeBlockout: (id: string, version: number, idempotencyKey?: string) => command<{ id: string; parishId: string; version: number; deletedAt: string }>('POST', `/operations/blockouts/${encodeURIComponent(id)}/revoke`, { version }, idempotencyKey),
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
  cancelReminder: (id: string, expectedVersion: number, reason: string, idempotencyKey?: string) => command<{ id: string; parishId: string; status: 'CANCELLED'; version: number }>('POST', `/operations/reminders/${encodeURIComponent(id)}/cancel`, { expectedVersion, reason }, idempotencyKey),
  rescheduleReminder: (id: string, body: { expectedVersion: number; triggerAt: string; reason: string }, idempotencyKey?: string) => command<OperationReminder>('POST', `/operations/reminders/${encodeURIComponent(id)}/reschedule`, body, idempotencyKey),
  createReminder: (body: ({ eventId: string; kind: 'EVENT_START' } | { taskId: string; kind: 'TASK_DUE' }) & { recipientUserId: string; triggerAt: string }, idempotencyKey?: string) => command<OperationReminder>('POST', '/operations/reminders', body, idempotencyKey),
  getResourceReminders: (target: { taskId: string } | { eventId: string }, page = 1, limit = 50) => paged<OperationReminder>(`/operations/reminders?${'taskId' in target ? `taskId=${encodeURIComponent(target.taskId)}` : `eventId=${encodeURIComponent(target.eventId)}`}`, page, limit),
  getWorkstream: (id: string) => request<OperationWorkstreamDetail>('GET', `/operations/workstreams/${encodeURIComponent(id)}`),
  createWorkstream: (body: { eventId?: string | null; sourceUnitId?: string | null; name: string; isRequired: boolean; autoAssignLeader?: boolean }, idempotencyKey?: string) => command<OperationWorkstream>('POST', '/operations/workstreams', body, idempotencyKey),
  // W2.5: edit name/description/isRequired (sourceUnitId change needs create
  // authority on the new unit — server enforces; UI only sends name/description).
  updateWorkstream: (id: string, body: { version: number; name?: string; description?: string | null; isRequired?: boolean }, idempotencyKey?: string) => command<OperationWorkstream>('PUT', `/operations/workstreams/${encodeURIComponent(id)}`, body, idempotencyKey),
  deleteWorkstream: (id: string, body: { version: number; reason?: string }, idempotencyKey?: string) => command<{ id: string; parishId: string; deletedAt: string }>('DELETE', `/operations/workstreams/${encodeURIComponent(id)}`, body, idempotencyKey),
  addWorkstreamMember: (id: string, body: { version: number; operationRole: OperationWorkstreamMember['operationRole'] } & OperationAssignmentTarget, idempotencyKey?: string) => command<OperationWorkstreamMember & { workstreamVersion: number }>('POST', `/operations/workstreams/${encodeURIComponent(id)}/members`, body, idempotencyKey),
  removeWorkstreamMember: (id: string, memberId: string, body: { version: number; memberVersion: number; reason: string }, idempotencyKey?: string) => command<{ member: OperationWorkstreamMember; workstreamVersion: number }>('POST', `/operations/workstreams/${encodeURIComponent(id)}/members/${encodeURIComponent(memberId)}/remove`, body, idempotencyKey),
  replaceWorkstreamLead: (id: string, body: {
    version: number
    currentLeadMemberId?: string | null
    currentLeadMemberVersion?: number | null
    endsAt?: string | null
    reason: string
  } & OperationAssignmentTarget, idempotencyKey?: string) => command<{ previousLead: OperationWorkstreamMember | null; newLead: OperationWorkstreamMember; workstreamVersion: number }>('POST', `/operations/workstreams/${encodeURIComponent(id)}/lead/replace`, body, idempotencyKey),
  updateWorkstreamMemberValidity: (id: string, memberId: string, body: { version: number; memberVersion: number; startsAt: string | null; endsAt: string | null; reason: string }, idempotencyKey?: string) => command<{ member: OperationWorkstreamMember; workstreamVersion: number }>('PUT', `/operations/workstreams/${encodeURIComponent(id)}/members/${encodeURIComponent(memberId)}/validity`, body, idempotencyKey),
  setWorkstreamReady: (id: string, body: { version: number; status: 'READY' | 'BLOCKED'; reason?: string }, idempotencyKey?: string) => command<OperationWorkstream>('POST', `/operations/workstreams/${encodeURIComponent(id)}/ready`, body, idempotencyKey),
  // W2.13: server-side search (q = title/location substring; status/scope).
  getEvents: (page = 1, limit = 50, filters?: { q?: string; status?: string; scope?: string }) => {
    const params = new URLSearchParams()
    if (filters?.q?.trim()) params.set('q', filters.q.trim())
    if (filters?.status) params.set('status', filters.status)
    if (filters?.scope) params.set('scope', filters.scope)
    const query = params.toString()
    return paged<OperationEvent>(`/operations/events${query ? `?${query}` : ''}`, page, limit)
  },
  getTasks: (mine = false, page = 1, limit = 50) => paged<OperationTask>(`/operations/tasks${mine ? '?mine=true' : ''}`, page, limit),
  getDispatchInbox: (page = 1, limit = 100) => paged<OperationTaskDispatchInvitation>('/operations/dispatches/inbox', page, limit),
  getWorkstreamTasks: (workstreamId: string, page = 1, limit = 50) => paged<OperationTask>(`/operations/tasks?workstreamId=${encodeURIComponent(workstreamId)}`, page, limit),
  getReminders: (page = 1, limit = 50) => paged<OperationReminder>('/operations/reminders/inbox', page, limit),
  // W2.11: `timezone` carries the parish's IANA zone so forms default to it
  // instead of the creator's browser zone (server still validates the sent value).
  getPermissions: (unitId?: string) => request<{ parishId: string; timezone?: string; permissions: Record<string, boolean> }>('GET', `/operations/permissions${unitId ? `?unitId=${encodeURIComponent(unitId)}` : ''}`),
  getEvent: (id: string, signal?: AbortSignal) => request<OperationEventDetail>('GET', `/operations/events/${encodeURIComponent(id)}`, undefined, 0, undefined, false, 'json', false, signal),
  getTask: (id: string, signal?: AbortSignal) => request<OperationTaskDetail>('GET', `/operations/tasks/${encodeURIComponent(id)}`, undefined, 0, undefined, false, 'json', false, signal),
  getReadiness: (id: string) => request<OperationReadiness>('GET', `/operations/events/${encodeURIComponent(id)}/readiness`),
  // W4.2a: participants surface — the server commands existed since the
  // first Operations release; this client only reaches them. add/status are
  // idempotent commands with OCC (`version`) exactly like other mutations.
  getEventHeadcount: (id: string) => request<OperationEventHeadcount>('GET', `/operations/events/${encodeURIComponent(id)}/headcount`),
  addEventParticipant: (eventId: string, body: OperationAssignmentTarget & { participantRole?: string }, idempotencyKey?: string) => command<OperationEventParticipant>('POST', `/operations/events/${encodeURIComponent(eventId)}/participants`, body, idempotencyKey),
  setEventParticipantStatus: (eventId: string, participantId: string, body: { version: number; status: OperationEventParticipant['attendanceStatus'] }, idempotencyKey?: string) => command<OperationEventParticipant>('POST', `/operations/events/${encodeURIComponent(eventId)}/participants/${encodeURIComponent(participantId)}/status`, body, idempotencyKey),
  // W2.1: description + expectedHeadcount were already in the server create
  // schema but never reachable from the UI.
  createEvent: (body: { title: string; eventType: string; startsAt: string; endsAt: string; timezone: string; description?: string | null; location?: string | null; visibility?: OperationEvent['visibility']; eventScopeType?: 'XU_DOAN' | 'UNIT'; scopeUnitId?: string | null; organizerUserId?: string | null; organizerPersonId?: string | null; expectedHeadcount?: number | null }, idempotencyKey?: string) => command<OperationEvent>('POST', '/operations/events', body, idempotencyKey),
  // W2.1: updateEvent now exposes description/expectedHeadcount and the
  // organizer swap the server route supports (leader rules re-checked there;
  // swapping from a person organizer must send organizerPersonId: null too).
  updateEvent: (id: string, body: { version: number; title?: string; description?: string | null; eventType?: string; startsAt?: string; endsAt?: string; timezone?: string; location?: string | null; visibility?: OperationEvent['visibility']; organizerUserId?: string | null; organizerPersonId?: string | null; expectedHeadcount?: number | null }, idempotencyKey?: string) => command<OperationEvent>('PUT', `/operations/events/${encodeURIComponent(id)}`, body, idempotencyKey),
  getCreationOptions: () => request<{ success: true; data: OperationsCreationOptions; error: null }>('GET', '/operations/creation-options', undefined, 0, undefined, false, 'json', true).then(response => response.data),
  createTask: (body: { title: string; description?: string | null; eventId?: string | null; workstreamId?: string | null; scopeUnitId?: string | null; dueAt?: string | null; scheduledStartAt?: string | null; scheduledEndAt?: string | null; priority?: OperationTask['priority']; phase?: OperationTask['phase']; isRequired?: boolean }, idempotencyKey?: string) => command<OperationTask>('POST', '/operations/tasks', body, idempotencyKey),
  // Server classifies important changes itself; the response reports whether
  // ACCEPTED acknowledgements were reopened so the UI never guesses.
  updateTask: (id: string, body: { version: number; title?: string; description?: string | null; priority?: OperationTask['priority']; dueAt?: string | null; scheduledStartAt?: string | null; scheduledEndAt?: string | null; isRequired?: boolean }, idempotencyKey?: string) => command<{ task: OperationTask; acknowledgementReset: boolean; resetAssignments: Array<{ id: string }> }>('PUT', `/operations/tasks/${encodeURIComponent(id)}`, body, idempotencyKey),
  assignTask: (id: string, body: { version: number; assignmentRole: OperationAssignment['assignmentRole']; note?: string } & OperationAssignmentTarget, idempotencyKey?: string) => command<{ assignment: OperationAssignment; taskVersion: number; conflictWarnings: Array<{ id: string; startsAt: string; endsAt: string; reason?: string | null }> }>('POST', `/operations/tasks/${encodeURIComponent(id)}/assign`, body, idempotencyKey),
  // W2.4: revoke one assignment (mandatory reason, OCC on task + assignment).
  removeTaskAssignment: (id: string, assignmentId: string, body: { version: number; assignmentVersion: number; reason: string }, idempotencyKey?: string) => command<{ assignment: OperationAssignment; taskVersion: number }>('POST', `/operations/tasks/${encodeURIComponent(id)}/assignments/${encodeURIComponent(assignmentId)}/remove`, body, idempotencyKey),
  createTaskDispatch: (id: string, body: { version: number; acknowledgeBy: string; primaryUserId?: string; primaryPersonId?: string; reserveUserId?: string; reservePersonId?: string }, idempotencyKey?: string) => command<{ dispatch: OperationTaskDispatch; taskVersion: number }>('POST', `/operations/tasks/${encodeURIComponent(id)}/dispatch`, body, idempotencyKey),
  acceptTaskDispatch: (taskId: string, dispatchId: string, body: { version: number; target: 'PRIMARY' | 'RESERVE' }, idempotencyKey?: string) => command<{ dispatch: OperationTaskDispatch; assignment: OperationAssignment; taskVersion: number }>('POST', `/operations/tasks/${encodeURIComponent(taskId)}/dispatches/${encodeURIComponent(dispatchId)}/accept`, body, idempotencyKey),
  // W2.3: full dispatch history of one task (newest first) for the manager view.
  getTaskDispatches: (taskId: string) => request<OperationTaskDispatch[]>('GET', `/operations/tasks/${encodeURIComponent(taskId)}/dispatches`),
  transitionEvent: (id: string, body: { version: number; status: OperationEvent['status']; reason?: string; outcomeSummary?: string; override?: boolean }, idempotencyKey?: string) => command<OperationEvent>('POST', `/operations/events/${encodeURIComponent(id)}/transition`, body, idempotencyKey),
  resumeEventAutomation: (id: string, body: { version: number; reason: string }, idempotencyKey?: string) => command<OperationEvent>('POST', `/operations/events/${encodeURIComponent(id)}/automation/resume`, body, idempotencyKey),
  restoreEvent: (id: string, body: { version: number; reason: string }, idempotencyKey?: string) => command<OperationEvent>('POST', `/operations/events/${encodeURIComponent(id)}/restore`, body, idempotencyKey),
  saveEventRetrospective: (id: string, body: { expectedVersion: number | null; lessonsLearned: string; improvementNotes?: string | null }, idempotencyKey?: string) => command<OperationEventRetrospective>('PUT', `/operations/events/${encodeURIComponent(id)}/retrospective`, body, idempotencyKey),
  createEventFollowUp: (id: string, body: { eventVersion: number; title: string; description?: string | null; dueAt: string; priority?: OperationTask['priority'] } & OperationAssignmentTarget, idempotencyKey?: string) => command<{ task: OperationTask; assignment: OperationAssignment; eventVersion: number; conflictWarnings: Array<{ id: string; startsAt: string; endsAt: string }> }>('POST', `/operations/events/${encodeURIComponent(id)}/follow-ups`, body, idempotencyKey),
  transitionTask: (id: string, body: { version: number; status: OperationTask['status']; completionNote?: string; blockedReason?: string; cancellationReason?: string }, idempotencyKey?: string) => command<OperationTask>('POST', `/operations/tasks/${encodeURIComponent(id)}/transition`, body, idempotencyKey),
  restoreTask: (id: string, body: { version: number; reason: string }, idempotencyKey?: string) => command<OperationTask>('POST', `/operations/tasks/${encodeURIComponent(id)}/restore`, body, idempotencyKey),
  acknowledgeTask: (id: string, assignmentId: string, version: number, status: 'ACCEPTED' | 'DECLINED', note?: string, idempotencyKey?: string) => command<OperationAssignment>('POST', `/operations/tasks/${encodeURIComponent(id)}/acknowledge`, { assignmentId, version, status, note }, idempotencyKey),
  createChecklistItem: (taskId: string, body: { version: number; label: string; isRequired?: boolean; sortOrder?: number }, idempotencyKey?: string) => command<{ item: OperationChecklistItem; taskVersion: number }>('POST', `/operations/tasks/${encodeURIComponent(taskId)}/checklist`, body, idempotencyKey),
  updateChecklistItem: (taskId: string, itemId: string, body: { version: number; isDone: boolean }, idempotencyKey?: string) => command<{ item: OperationChecklistItem; taskVersion: number }>('POST', `/operations/tasks/${encodeURIComponent(taskId)}/checklist/${encodeURIComponent(itemId)}`, body, idempotencyKey),
  markReminderRead: (id: string, expectedVersion?: number, idempotencyKey?: string) => command<{ id: string; readAt: string; version: number }>('POST', `/operations/reminders/${encodeURIComponent(id)}/read`, expectedVersion !== undefined ? { expectedVersion } : {}, idempotencyKey),
  handoverTask: (id: string, body: { version: number; assignmentId: string; assignmentVersion: number; reason: string } & OperationAssignmentTarget, idempotencyKey?: string) => command<{ assignment: OperationAssignment; taskVersion: number; conflictWarnings: Array<{ id: string; startsAt: string; endsAt: string }> }>('POST', `/operations/tasks/${encodeURIComponent(id)}/handover`, body, idempotencyKey),
  commentTask: (id: string, body: { content: string; evidenceUrl?: string }, idempotencyKey?: string) => command<OperationTaskComment>('POST', `/operations/tasks/${encodeURIComponent(id)}/comments`, body, idempotencyKey),
  getEventsPublicSummary: (page = 1, limit = 500) => paged<{ id: string; operationEventId: string; title: string }>('/operations/events/public-summary', page, limit),
  addTaskDependency: (taskId: string, body: { version: number; dependsOnTaskId: string }, idempotencyKey?: string) => command<{ parishId: string; taskId: string; dependsOnTaskId: string; dependencyType: 'BLOCKED_BY'; taskVersion: number }>('POST', `/operations/tasks/${encodeURIComponent(taskId)}/dependencies`, body, idempotencyKey),
  removeTaskDependency: (taskId: string, dependsOnTaskId: string, body: { version: number; reason: string }, idempotencyKey?: string) => command<{ taskVersion: number }>('POST', `/operations/tasks/${encodeURIComponent(taskId)}/dependencies/${encodeURIComponent(dependsOnTaskId)}/remove`, body, idempotencyKey),
}
