import { request, setTokens } from './core'

// Phase 3: tách từ lib/api.ts (verbatim, chỉ đổi import core). Contract/API giữ nguyên.
export const authApi = {
  login: (username: string, password: string) =>
    request<{
      user: { id: string; username: string; fullName: string; phone?: string | null; role: string; status: string; parishId: string; mustChangePassword?: number }
      accessToken: string
    }>('POST', '/auth/login', { username, password }),

  // ADR-045 (2026-08-16): GET /auth/me — rebuild snapshot đăng nhập (PII) khi
  // snapshot mã hóa local bị thiếu/hỏng (Dexie purge, khóa rotate, LAN không có crypto).
  me: () =>
    request<{ id: string; username: string; fullName: string; phone: string | null; role: string; status: string }>('GET', '/auth/me'),

  changePassword: async (currentPassword: string, newPassword: string) => {
    const response = await request<{ success: boolean; accessToken: string }>('POST', '/auth/change-password', { currentPassword, newPassword })
    // Server đã hủy tokenVersion cũ và cấp token mới cùng response. Cập nhật
    // ngay memory token để phiên Settings/force-change không phải chờ 401+refresh.
    setTokens(response.accessToken)
    return response
  },

  // A06 (2026-08-10): admin-change-password / reset-password yêu cầu re-authentication —
  // gửi kèm adminPassword (mật khẩu HIỆN TẠI của admin đang thao tác).
  adminChangePassword: (userId: string, newPassword: string, adminPassword: string) =>
    request<{ success: boolean; message: string }>('POST', '/auth/admin-change-password', { userId, newPassword, adminPassword }),

  // ADR-087: request public chỉ tạo ticket; không tự đổi credential và response
  // không cho biết SĐT có tồn tại. Xử lý ticket vẫn là admin-only + re-auth.
  requestParentPasswordReset: (phone: string) =>
    request<{ accepted: boolean; message: string }>('POST', '/password-reset-requests', { phone }),
  getPasswordResetRequests: () =>
    request<Array<{
      id: string
      userId: string
      fullName: string
      username: string
      phone: string | null
      status: 'PENDING' | 'RESOLVED' | 'DISMISSED'
      requestCount: number
      lastRequestedAt: string
    }>>('GET', '/password-reset-requests/admin'),
  resolvePasswordResetRequest: (requestId: string, adminPassword: string) =>
    request<{ username: string; tempPassword: string; fullName: string }>('POST', `/password-reset-requests/admin/${requestId}/reset`, { adminPassword }),
  dismissPasswordResetRequest: (requestId: string) =>
    request<{ dismissed: boolean }>('PATCH', `/password-reset-requests/admin/${requestId}/dismiss`, {}),

  // ADR-039: phụ huynh không tự đổi SĐT — gửi phone undefined để server giữ nguyên
  updateProfile: (fullName: string, phone?: string) =>
    request<{ id: string; username: string; fullName: string; phone: string | null; role: string; status: string }>('PUT', '/auth/profile', { fullName, phone }),

  // A-NEW-01 (2026-08-10): JS không giữ refresh token nữa → logout không gửi body token;
  // server revoke session qua HttpOnly cookie (credentials: 'include' đã bật sẵn).
  logout: () => request<{ success: boolean }>('POST', '/auth/logout', {}),
}
