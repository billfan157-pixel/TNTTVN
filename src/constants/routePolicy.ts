import type { Role } from '../types'

export type DesktopRouteTab =
  | 'dashboard'
  | 'parish-home'
  | 'students'
  | 'grades'
  | 'attendance'
  | 'reports'
  | 'calendar'
  | 'parish-profile'
  | 'notices'
  | 'users'
  | 'classes'
  | 'academic-years'
  | 'catechists'
  | 'audit-logs'
  | 'settings'
  | 'management'
  | 'parent'
  | 'finances'
  | 'feedback'

export type MobileRouteTab =
  | 'home'
  | 'attendance'
  | 'grades'
  | 'students'
  | 'reports'
  | 'settings'
  | 'parent'
  | 'notices'
  | 'parish-home'
  | 'catechists'
  | 'calendar'
  | 'parish-profile'
  | 'finances'

export type WorkspaceId = 'academic' | 'organization' | 'parent'
export type RouteWorkspace = WorkspaceId | 'shared'

export interface RoutePolicy {
  requiresAuth: boolean
  roles: readonly Role[]
  mobileTitle: string
  workspace?: RouteWorkspace
  desktopTab?: DesktopRouteTab
  mobileTab?: MobileRouteTab
}

const ALL_ROLES = ['admin', 'chunhiem', 'phuta', 'phuhuynh'] as const satisfies readonly Role[]
const STAFF_ROLES = ['admin', 'chunhiem', 'phuta'] as const satisfies readonly Role[]
const ADMIN_ONLY = ['admin'] as const satisfies readonly Role[]
const PARENT_ONLY = ['phuhuynh'] as const satisfies readonly Role[]

/**
 * Frontend route-policy SSOT (ADR-072).
 *
 * Router guards, shell titles and navigation state must derive from this map.
 * Server authorization remains the security authority; this client policy is a
 * fail-closed UX boundary so a role never enters a workspace it cannot use.
 */
export const ROUTE_POLICIES = {
  '/login': { requiresAuth: false, roles: [], mobileTitle: 'Đăng nhập' },
  '/login/nhan-su': { requiresAuth: false, roles: [], mobileTitle: 'Đăng nhập nhân sự' },
  '/login/phuhuynh': { requiresAuth: false, roles: [], mobileTitle: 'Đăng nhập phụ huynh' },
  '/verify': { requiresAuth: false, roles: [], mobileTitle: 'Xác thực chứng nhận' },

  '/dashboard': { requiresAuth: true, roles: ALL_ROLES, mobileTitle: 'Tổng quan học vụ', workspace: 'academic', desktopTab: 'dashboard', mobileTab: 'home' },
  '/students': { requiresAuth: true, roles: STAFF_ROLES, mobileTitle: 'Thiếu nhi', workspace: 'academic', desktopTab: 'students', mobileTab: 'students' },
  '/grades': { requiresAuth: true, roles: STAFF_ROLES, mobileTitle: 'Bảng điểm', workspace: 'academic', desktopTab: 'grades', mobileTab: 'grades' },
  '/attendance': { requiresAuth: true, roles: STAFF_ROLES, mobileTitle: 'Điểm danh', workspace: 'academic', desktopTab: 'attendance', mobileTab: 'attendance' },
  '/reports': { requiresAuth: true, roles: STAFF_ROLES, mobileTitle: 'Báo cáo học tập', workspace: 'academic', desktopTab: 'reports', mobileTab: 'reports' },
  '/parish': { requiresAuth: true, roles: STAFF_ROLES, mobileTitle: 'Tổng quan Xứ đoàn', workspace: 'organization', desktopTab: 'parish-home', mobileTab: 'parish-home' },
  '/notices': { requiresAuth: true, roles: ALL_ROLES, mobileTitle: 'Thông báo', workspace: 'organization', desktopTab: 'notices', mobileTab: 'notices' },
  '/calendar': { requiresAuth: true, roles: ALL_ROLES, mobileTitle: 'Lịch phụng vụ', workspace: 'organization', desktopTab: 'calendar', mobileTab: 'calendar' },
  '/parish-profile': { requiresAuth: true, roles: STAFF_ROLES, mobileTitle: 'Hồ sơ Xứ đoàn', workspace: 'organization', desktopTab: 'parish-profile', mobileTab: 'parish-profile' },
  '/settings': { requiresAuth: true, roles: ALL_ROLES, mobileTitle: 'Cài đặt', workspace: 'shared', desktopTab: 'settings', mobileTab: 'settings' },
  '/feedback': { requiresAuth: true, roles: ALL_ROLES, mobileTitle: 'Thư góp ý', workspace: 'shared', desktopTab: 'feedback' },
  '/parent': { requiresAuth: true, roles: PARENT_ONLY, mobileTitle: 'Con của tôi', workspace: 'parent', desktopTab: 'parent', mobileTab: 'parent' },
  '/leave-requests': { requiresAuth: true, roles: STAFF_ROLES, mobileTitle: 'Đơn xin nghỉ', workspace: 'academic', desktopTab: 'attendance' },

  '/users': { requiresAuth: true, roles: ADMIN_ONLY, mobileTitle: 'Tài khoản', workspace: 'shared', desktopTab: 'management' },
  '/classes': { requiresAuth: true, roles: ADMIN_ONLY, mobileTitle: 'Lớp học', workspace: 'academic', desktopTab: 'students' },
  '/academic-years': { requiresAuth: true, roles: ADMIN_ONLY, mobileTitle: 'Năm học', workspace: 'academic', desktopTab: 'management' },
  '/catechists': { requiresAuth: true, roles: STAFF_ROLES, mobileTitle: 'Giáo lý viên', workspace: 'organization', desktopTab: 'catechists', mobileTab: 'catechists' },
  '/audit-logs': { requiresAuth: true, roles: ADMIN_ONLY, mobileTitle: 'Nhật ký hệ thống', workspace: 'shared', desktopTab: 'audit-logs' },
  '/management': { requiresAuth: true, roles: ADMIN_ONLY, mobileTitle: 'Quản lý hệ thống', workspace: 'shared', desktopTab: 'management' },
  '/finances': { requiresAuth: true, roles: ADMIN_ONLY, mobileTitle: 'Quỹ và thu chi', workspace: 'organization', desktopTab: 'finances', mobileTab: 'finances' },
} as const satisfies Record<string, RoutePolicy>

export type AppRoutePath = keyof typeof ROUTE_POLICIES
export type ProtectedRoutePath = {
  [Path in AppRoutePath]: (typeof ROUTE_POLICIES)[Path]['requiresAuth'] extends true ? Path : never
}[AppRoutePath]

export const DESKTOP_TAB_PATHS = {
  dashboard: '/dashboard',
  'parish-home': '/parish',
  students: '/students',
  grades: '/grades',
  attendance: '/attendance',
  reports: '/reports',
  calendar: '/calendar',
  'parish-profile': '/parish-profile',
  notices: '/notices',
  users: '/users',
  classes: '/classes',
  'academic-years': '/academic-years',
  catechists: '/catechists',
  'audit-logs': '/audit-logs',
  settings: '/settings',
  management: '/management',
  parent: '/parent',
  finances: '/finances',
  feedback: '/feedback',
} as const satisfies Record<DesktopRouteTab, ProtectedRoutePath>

export const WORKSPACE_DEFINITIONS = {
  academic: { label: 'Thiếu nhi & Học vụ', shortLabel: 'Học vụ', landingPath: '/dashboard', roles: STAFF_ROLES },
  organization: { label: 'Xứ đoàn & Giáo xứ', shortLabel: 'Xứ đoàn', landingPath: '/parish', roles: STAFF_ROLES },
  parent: { label: 'Phụ huynh', shortLabel: 'Phụ huynh', landingPath: '/parent', roles: PARENT_ONLY },
} as const satisfies Record<WorkspaceId, { label: string; shortLabel: string; landingPath: ProtectedRoutePath; roles: readonly Role[] }>

export function getAccessibleWorkspaces(role: Role | null | undefined): WorkspaceId[] {
  if (!role) return []
  return (Object.keys(WORKSPACE_DEFINITIONS) as WorkspaceId[])
    .filter(workspace => WORKSPACE_DEFINITIONS[workspace].roles.some(allowed => allowed === role))
}

export function resolveActiveWorkspace(pathname: string, role: Role | null | undefined, remembered: WorkspaceId): WorkspaceId {
  if (role === 'phuhuynh') return 'parent'
  const workspace = getRoutePolicy(pathname)?.workspace
  return workspace && workspace !== 'shared' ? workspace : remembered
}

export const MOBILE_TAB_PATHS = {
  home: '/dashboard',
  attendance: '/attendance',
  grades: '/grades',
  students: '/students',
  reports: '/reports',
  settings: '/settings',
  parent: '/parent',
  notices: '/notices',
  'parish-home': '/parish',
  catechists: '/catechists',
  calendar: '/calendar',
  'parish-profile': '/parish-profile',
  finances: '/finances',
} as const satisfies Record<MobileRouteTab, ProtectedRoutePath>

export const MOBILE_PRIMARY_TABS = [
  'home',
  'attendance',
  'grades',
  'students',
  'parent',
  'reports',
] as const satisfies readonly MobileRouteTab[]

export function getRoutePolicy(pathname: string): RoutePolicy | undefined {
  return ROUTE_POLICIES[pathname as AppRoutePath]
}

export function canRoleAccessRoute(pathname: AppRoutePath, role: Role | null | undefined): boolean {
  const policy = ROUTE_POLICIES[pathname]
  if (!policy.requiresAuth) return true
  return Boolean(role && policy.roles.some(allowedRole => allowedRole === role))
}

/** Mobile destinations whose code chunks may be prefetched for the active role. */
export function getMobilePreloadPaths(role: Role | null | undefined): ProtectedRoutePath[] {
  if (!role) return []
  return [...new Set(MOBILE_PRIMARY_TABS.map(tab => MOBILE_TAB_PATHS[tab]))]
    .filter(path => canRoleAccessRoute(path, role))
}
