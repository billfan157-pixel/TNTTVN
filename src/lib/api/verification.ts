import { request } from './core'

/**
 * Verification API — ký/xác thực tuple định danh của phiếu/chứng nhận.
 *
 * Ngữ nghĩa (FRONTEND_API_CONTRACT): chữ ký CHỈ xác nhận tuple
 * (parishId, studentId, academicYear, certId) do một staff có quyền trên lớp
 * hiện hành của học sinh ký. Nó KHÔNG xác nhận điểm số, nội dung bản in, hay
 * việc chứng nhận đã được cấp. UI không được suy rộng quá ngữ nghĩa này.
 */
export interface SignedVerificationIdentifiers {
  parishId: string
  studentId: string
  academicYear: string
  certId: string
  signature: string
  verificationScope?: string
}

export const verificationApi = {
  /** POST /api/verification/sign — staff (admin|chunhiem|phuta) có quyền trên lớp hiện hành. */
  signVerificationIdentifiers: (payload: { studentId: string; academicYear: string; certId: string }) =>
    request<SignedVerificationIdentifiers>('POST', '/verification/sign', payload),
}
