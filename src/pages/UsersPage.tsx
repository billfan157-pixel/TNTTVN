import { UserManagementPage, type UserManagementScope } from '../components/desktop/UserManagementPage'

/**
 * Wrapper trang Tài Khoản. scope mặc định 'all' (route /users xem mọi vai trò);
 * ManagementPage truyền 'staff' / 'phuhuynh' để tách 2 tab riêng (2026-08-22).
 */
export function UsersPage({ scope, embedded = false }: { scope?: UserManagementScope; embedded?: boolean }) {
  return <UserManagementPage scope={scope} embedded={embedded} />
}

export default UsersPage
