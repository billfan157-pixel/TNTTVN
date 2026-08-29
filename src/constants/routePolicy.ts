import type { Role } from '../types'

export type DesktopRouteTab =
  | 'dashboard'
  | 'students'
  | 'grades'
  | 'attendance'
  | 'reports'
  | 'calendar'
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

export type MobileRouteTab =
  | 'home'
  | 'attendance'
  | 'grades'
  | 'students'
  | 'reports'
  | 'settings'
  | 'parent'
  | 'notices'

export interface RoutePolicy {
  requiresAuth: boolean
  roles: readonly Role[]
  mobileTitle: string
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

  '/dashboard': { requiresAuth: true, roles: ALL_ROLES, mobileTitle: 'Tổng quan', desktopTab: 'dashboard', mobileTab: 'home' },
  '/students': { requiresAuth: true, roles: STAFF_ROLES, mobileTitle: 'Thiếu nhi', desktopTab: 'students', mobileTab: 'students' },
  '/grades': { requiresAuth: true, roles: STAFF_ROLES, mobileTitle: 'Bảng điểm', desktopTab: 'grades', mobileTab: 'grades' },
  '/attendance': { requiresAuth: true, roles: STAFF_ROLES, mobileTitle: 'Điểm danh', desktopTab: 'attendance', mobileTab: 'attendance' },
  '/reports': { requiresAuth: true, roles: STAFF_ROLES, mobileTitle: 'Báo cáo học tập', desktopTab: 'reports', mobileTab: 'reports' },
  '/notices': { requiresAuth: true, roles: ALL_ROLES, mobileTitle: 'Thông báo', desktopTab: 'notices', mobileTab: 'notices' },
  '/calendar': { requiresAuth: true, roles: ALL_ROLES, mobileTitle: 'Lịch phụng vụ', desktopTab: 'calendar' },
  '/settings': { requiresAuth: true, roles: ALL_ROLES, mobileTitle: 'Cài đặt', desktopTab: 'settings', mobileTab: 'settings' },
  '/parent': { requiresAuth: true, roles: PARENT_ONLY, mobileTitle: 'Con của tôi', desktopTab: 'parent', mobileTab: 'parent' },
  '/leave-requests': { requiresAuth: true, roles: STAFF_ROLES, mobileTitle: 'Đơn xin nghỉ', desktopTab: 'attendance' },

  '/users': { requiresAuth: true, roles: ADMIN_ONLY, mobileTitle: 'Tài khoản', desktopTab: 'management' },
  '/classes': { requiresAuth: true, roles: ADMIN_ONLY, mobileTitle: 'Lớp học', desktopTab: 'management' },
  '/academic-years': { requiresAuth: true, roles: ADMIN_ONLY, mobileTitle: 'Năm học', desktopTab: 'management' },
  '/catechists': { requiresAuth: true, roles: ADMIN_ONLY, mobileTitle: 'Giáo lý viên', desktopTab: 'catechists' },
  '/audit-logs': { requiresAuth: true, roles: ADMIN_ONLY, mobileTitle: 'Nhật ký hệ thống', desktopTab: 'audit-logs' },
  '/management': { requiresAuth: true, roles: ADMIN_ONLY, mobileTitle: 'Quản lý hệ thống', desktopTab: 'management' },
  '/finances': { requiresAuth: true, roles: ADMIN_ONLY, mobileTitle: 'Quỹ và thu chi', desktopTab: 'finances' },
} as const satisfies Record<string, RoutePolicy>

export type AppRoutePath = keyof typeof ROUTE_POLICIES
export type ProtectedRoutePath = {
  [Path in AppRoutePath]: (typeof ROUTE_POLICIES)[Path]['requiresAuth'] extends true ? Path : never
}[AppRoutePath]

export const DESKTOP_TAB_PATHS = {
  dashboard: '/dashboard',
  students: '/students',
  grades: '/grades',
  attendance: '/attendance',
  reports: '/reports',
  calendar: '/calendar',
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
} as const satisfies Record<DesktopRouteTab, ProtectedRoutePath>

export const MOBILE_TAB_PATHS = {
  home: '/dashboard',
  attendance: '/attendance',
  grades: '/grades',
  students: '/students',
  reports: '/reports',
  settings: '/settings',
  parent: '/parent',
  notices: '/notices',
} as const satisfies Record<MobileRouteTab, ProtectedRoutePath>

export function getRoutePolicy(pathname: string): RoutePolicy | undefined {
  return ROUTE_POLICIES[pathname as AppRoutePath]
}

export function canRoleAccessRoute(pathname: AppRoutePath, role: Role | null | undefined): boolean {
  const policy = ROUTE_POLICIES[pathname]
  if (!policy.requiresAuth) return true
  return Boolean(role && policy.roles.some(allowedRole => allowedRole === role))
}
