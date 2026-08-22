import React from 'react'
import { UserManagementPage, type UserManagementScope } from '../components/desktop/UserManagementPage'

/**
 * Wrapper trang Tài Khoản. scope mặc định 'all' (route /users xem mọi vai trò);
 * ManagementPage truyền 'staff' / 'phuhuynh' để tách 2 tab riêng (2026-08-22).
 */
export function UsersPage({ scope }: { scope?: UserManagementScope }) {
  return <UserManagementPage scope={scope} />
}

export default UsersPage
