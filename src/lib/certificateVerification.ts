import { verificationApi } from './api/verification'
import { buildCertificateId, buildCertificateVerifyUrl } from './qr'

export interface CertificateVerification {
  /** Mã chứng nhận ổn định (deterministic) dùng cho cả bản in lẫn bản xem trước. */
  certId: string
  /** URL công khai `/verify?...` (đủ tuple + chữ ký HMAC) để in vào QR. */
  verifyUrl: string
}

/**
 * Khép vòng xác thực chứng nhận: xin chữ ký HMAC cho tuple định danh rồi dựng
 * URL xác thực công khai.
 *
 * Trả về `null` khi KHÔNG ký được (offline, thiếu quyền trên lớp, năm học chưa
 * tồn tại ở parish...) — caller bắt buộc phải hiển thị trạng thái "không xác
 * thực" thay vì im lặng coi như đã ký (fail-visible, không fail-silent).
 */
export async function resolveCertificateVerification(params: {
  studentId: string
  academicYear: string
  certType: 'completion' | 'promotion'
}): Promise<CertificateVerification | null> {
  const certId = buildCertificateId(params.studentId, params.academicYear, params.certType)
  try {
    const signed = await verificationApi.signVerificationIdentifiers({
      studentId: params.studentId,
      academicYear: params.academicYear,
      certId,
    })
    // Dùng đúng tuple server trả về (server chuẩn hoá input) — URL phải chứa
    // đúng những gì đã được ký, không phải giá trị client tự suy diễn.
    return {
      certId: signed.certId,
      verifyUrl: buildCertificateVerifyUrl({
        parishId: signed.parishId,
        studentId: signed.studentId,
        academicYear: signed.academicYear,
        certId: signed.certId,
        signature: signed.signature,
      }),
    }
  } catch {
    return null
  }
}
