import { UserManagementPage, type UserManagementScope } from '../components/desktop/UserManagementPage'

/**
 * Wrapper trang Tài Khoản. scope mặc định 'all' (route /users xem mọi vai trò);
 * `/catechists` dùng scope `staff`; ManagementPage chỉ còn truyền `phuhuynh`.
 */
export function UsersPage({ scope, embedded = false }: { scope?: UserManagementScope; embedded?: boolean }) {
  return <UserManagementPage scope={scope} embedded={embedded} />
}

export default UsersPage
