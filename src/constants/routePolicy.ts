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
  '/': { requiresAuth: false, roles: [], mobileTitle: 'Giới Thiệu' },
  '/about': { requiresAuth: false, roles: [], mobileTitle: 'Giới Thiệu Catevia' },
  '/login': { requiresAuth: false, roles: [], mobileTitle: 'Đăng Nhập' },
  '/login/nhan-su': { requiresAuth: false, roles: [], mobileTitle: 'Đăng Nhập Nhân Sự' },
  '/login/phuhuynh': { requiresAuth: false, roles: [], mobileTitle: 'Đăng Nhập Phụ Huynh' },
  '/verify': { requiresAuth: false, roles: [], mobileTitle: 'Xác Thực Chứng Nhận' },

  '/dashboard': { requiresAuth: true, roles: ALL_ROLES, mobileTitle: 'Tổng Quan Học Vụ', workspace: 'academic', desktopTab: 'dashboard', mobileTab: 'home' },
  '/students': { requiresAuth: true, roles: STAFF_ROLES, mobileTitle: 'Thiếu Nhi', workspace: 'academic', desktopTab: 'students', mobileTab: 'students' },
  '/grades': { requiresAuth: true, roles: STAFF_ROLES, mobileTitle: 'Bảng Điểm', workspace: 'academic', desktopTab: 'grades', mobileTab: 'grades' },
  '/attendance': { requiresAuth: true, roles: STAFF_ROLES, mobileTitle: 'Điểm Danh', workspace: 'academic', desktopTab: 'attendance', mobileTab: 'attendance' },
  '/reports': { requiresAuth: true, roles: STAFF_ROLES, mobileTitle: 'Báo Cáo Học Tập', workspace: 'academic', desktopTab: 'reports', mobileTab: 'reports' },
  '/parish': { requiresAuth: true, roles: STAFF_ROLES, mobileTitle: 'Tổng Quan Xứ Đoàn', workspace: 'organization', desktopTab: 'parish-home', mobileTab: 'parish-home' },
  '/notices': { requiresAuth: true, roles: ALL_ROLES, mobileTitle: 'Thông Báo', workspace: 'organization', desktopTab: 'notices', mobileTab: 'notices' },
  '/calendar': { requiresAuth: true, roles: ALL_ROLES, mobileTitle: 'Lịch Phụng Vụ', workspace: 'organization', desktopTab: 'calendar', mobileTab: 'calendar' },
  '/operations': { requiresAuth: true, roles: STAFF_ROLES, mobileTitle: 'Vận Hành', workspace: 'organization', desktopTab: 'parish-home' },
  '/parish-profile': { requiresAuth: true, roles: STAFF_ROLES, mobileTitle: 'Hồ Sơ Xứ Đoàn', workspace: 'organization', desktopTab: 'parish-profile', mobileTab: 'parish-profile' },
  '/settings': { requiresAuth: true, roles: ALL_ROLES, mobileTitle: 'Cài Đặt', workspace: 'shared', desktopTab: 'settings', mobileTab: 'settings' },
  '/feedback': { requiresAuth: true, roles: ALL_ROLES, mobileTitle: 'Thư Góp Ý', workspace: 'shared', desktopTab: 'feedback' },
  '/parent': { requiresAuth: true, roles: PARENT_ONLY, mobileTitle: 'Con Của Tôi', workspace: 'parent', desktopTab: 'parent', mobileTab: 'parent' },
  '/leave-requests': { requiresAuth: true, roles: STAFF_ROLES, mobileTitle: 'Đơn Xin Nghỉ', workspace: 'academic', desktopTab: 'attendance' },

  '/users': { requiresAuth: true, roles: ADMIN_ONLY, mobileTitle: 'Tài Khoản', workspace: 'shared', desktopTab: 'management' },
  '/classes': { requiresAuth: true, roles: ADMIN_ONLY, mobileTitle: 'Lớp Học', workspace: 'academic', desktopTab: 'students' },
  '/academic-years': { requiresAuth: true, roles: ADMIN_ONLY, mobileTitle: 'Năm Học', workspace: 'academic', desktopTab: 'management' },
  '/catechists': { requiresAuth: true, roles: STAFF_ROLES, mobileTitle: 'Giáo Lý Viên', workspace: 'organization', desktopTab: 'catechists', mobileTab: 'catechists' },
  '/audit-logs': { requiresAuth: true, roles: ADMIN_ONLY, mobileTitle: 'Nhật Ký Hệ Thống', workspace: 'shared', desktopTab: 'audit-logs' },
  '/management': { requiresAuth: true, roles: ADMIN_ONLY, mobileTitle: 'Quản Lý Hệ Thống', workspace: 'shared', desktopTab: 'management' },
  '/finances': { requiresAuth: true, roles: ADMIN_ONLY, mobileTitle: 'Quỹ & Thu Chi', workspace: 'organization', desktopTab: 'finances', mobileTab: 'finances' },
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
  academic: { label: 'Thiếu Nhi & Học Vụ', shortLabel: 'Học Vụ', landingPath: '/dashboard', roles: STAFF_ROLES },
  organization: { label: 'Xứ Đoàn & Giáo Xứ', shortLabel: 'Xứ Đoàn', landingPath: '/parish', roles: STAFF_ROLES },
  parent: { label: 'Phụ Huynh', shortLabel: 'Phụ Huynh', landingPath: '/parent', roles: PARENT_ONLY },
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
