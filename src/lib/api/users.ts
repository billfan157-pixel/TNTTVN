import { request } from './core'

// Phase 3: tách từ lib/api.ts (verbatim, chỉ đổi import core). Contract/API giữ nguyên.
export const usersApi = {
  getUsers: () => request<any[]>('GET', '/users'),
  getCatechists: () => request<any[]>('GET', '/users/catechists'),
  // ADR-027 (2026-08-12): username optional — server tự sinh `chức vụ_Tên thánh + Họ và tên`
  // từ holyName+fullName; gửi username = override thủ công (auto trùng). Phụ huynh: SĐT.
  createUser: (data: { username?: string; holyName?: string; fullName: string; phone?: string; role: string; assignedClasses?: string[]; adminPassword?: string }) =>
    request<{ id: string; username: string; tempPassword: string }>('POST', '/users', data),
  updateUserStatus: (id: string, status: string) =>
    request<{ success: boolean }>('PUT', `/users/${id}/status`, { status }),
  updateUserAssignments: (id: string, assignedClasses: string[]) =>
    request<{ id: string; assignedClasses: string[] }>('PUT', `/users/${id}/assignments`, { assignedClasses }),
  // ADR-039 (2026-08-15): admin đổi SĐT (endpoint duy nhất; PH không tự đổi).
  // Phuhuynh có username = SĐT → server đồng bộ username kèm theo.
  updateUserPhone: (id: string, phone: string, adminPassword: string) =>
    request<{ id: string; phone: string; username: string; usernameChanged: boolean }>('PUT', `/users/${id}/phone`, { phone, adminPassword }),
  // A06 (2026-08-10): reset-password cũng yêu cầu adminPassword (re-authentication)
  resetUserPassword: (id: string, adminPassword: string) =>
    request<{ username: string; tempPassword: string }>('POST', `/users/${id}/reset-password`, { adminPassword }),
  forceLogoutUser: (id: string) =>
    request<{ success: boolean }>('POST', `/users/${id}/force-logout`),
  deleteUser: (id: string, adminPassword: string) =>
    request<{ id: string; deleted: true; alreadyDeleted: boolean }>('DELETE', `/users/${id}`, { adminPassword }),
  // ADR-026 (2026-08-12): cấp tài khoản phụ huynh hàng loạt từ students.parentPhone
  getParentProvisionPreview: () =>
    request<{ total: number; candidates: Array<{ phone: string; parentName: string; childrenCount: number }>; validPhoneCount: number; existingCount: number }>('GET', '/users/parent-provision-preview'),
  provisionParentAccounts: (adminPassword: string) =>
    request<{ total: number; successCount: number; skippedCount: number; errorCount: number; results: Array<{ phone: string; fullName: string; status: string; reason?: string; username?: string; tempPassword?: string }> }>('POST', '/users/provision-parents', { adminPassword }),
}
