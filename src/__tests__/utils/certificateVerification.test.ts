import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildCertificateId, buildCertificateVerifyUrl, DEFAULT_PUBLIC_APP_URL, generateCertificateQrSvg } from '../../lib/qr'

vi.mock('../../lib/api/verification', () => ({
  verificationApi: { signVerificationIdentifiers: vi.fn() },
}))

import { verificationApi } from '../../lib/api/verification'
import { resolveCertificateVerification } from '../../lib/certificateVerification'
import { generateSacramentCertificateHTML } from '../../utils/pdfGenerator'
import type { Student } from '../../types'

const signMock = vi.mocked(verificationApi.signVerificationIdentifiers)

function params(url: string): URLSearchParams {
  return new URLSearchParams(url.slice(url.indexOf('?') + 1))
}

function makeStudent(overrides: Partial<Student> = {}): Student {
  return {
    id: 'ST-1', code: 'TN001', holyName: 'Giuse', fullName: 'Nguyễn Văn A',
    gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'Phụ Huynh A',
    parentPhone: '0901234567', address: 'X', branch: 'ThieuNhi', classId: 'CL-TN1',
    status: 'Đang học', ...overrides,
  }
}

describe('buildCertificateId — định danh chứng nhận ổn định', () => {
  it('deterministic cho cùng (học sinh, năm học, loại chứng nhận)', () => {
    const a = buildCertificateId('ST-1', '2025-2026', 'completion')
    const b = buildCertificateId('ST-1', '2025-2026', 'completion')
    expect(a).toBe(b)
    expect(a).toMatch(/^CERT-[0-9A-F]{8}$/)
  })

  it('khác nhau khi học sinh / năm học / loại chứng nhận khác', () => {
    const base = buildCertificateId('ST-1', '2025-2026', 'completion')
    expect(buildCertificateId('ST-2', '2025-2026', 'completion')).not.toBe(base)
    expect(buildCertificateId('ST-1', '2026-2027', 'completion')).not.toBe(base)
    expect(buildCertificateId('ST-1', '2025-2026', 'promotion')).not.toBe(base)
  })
})

describe('buildCertificateVerifyUrl — khớp route /verify của VerificationPage', () => {
  const parts = {
    parishId: 'gia-ton',
    studentId: 'ST-1',
    academicYear: '2025-2026',
    certId: 'CERT-1A2B3C4D',
    signature: 'f'.repeat(64),
  }

  it('mang đủ 5 tham số đúng tên mà VerificationPage + GET /api/verification/verify đọc', () => {
    const url = buildCertificateVerifyUrl(parts)
    expect(url.startsWith(`${DEFAULT_PUBLIC_APP_URL}/verify?`)).toBe(true)
    const query = params(url)
    expect(query.get('parishId')).toBe('gia-ton')
    expect(query.get('studentId')).toBe('ST-1')
    expect(query.get('academicYear')).toBe('2025-2026')
    expect(query.get('certId')).toBe('CERT-1A2B3C4D')
    expect(query.get('sig')).toBe('f'.repeat(64))
  })

  it('tôn trọng base URL override (tên miền riêng) và bỏ dấu "/" cuối', () => {
    expect(buildCertificateVerifyUrl(parts, 'https://tntt.giahop.org/')).toBe(
      `https://tntt.giahop.org/verify?${params(buildCertificateVerifyUrl(parts)).toString()}`,
    )
  })

  it('payload đủ ngắn để in QR đọc được trên giấy A4', () => {
    const url = buildCertificateVerifyUrl(parts)
    expect(url.length).toBeLessThan(300)
    // QR vẫn sinh được và là SVG hợp lệ (không ném lỗi khi payload dài).
    expect(generateCertificateQrSvg(url, 4)).toContain('<svg')
  })
})

describe('resolveCertificateVerification — chỉ tin chữ ký do server trả về', () => {
  beforeEach(() => {
    signMock.mockReset()
  })

  it('ký thành công → URL xác thực chứa đúng tuple + chữ ký của server', async () => {
    signMock.mockResolvedValue({
      parishId: 'gia-ton',
      studentId: 'ST-1',
      academicYear: '2025-2026',
      certId: 'CERT-1A2B3C4D',
      signature: 'a'.repeat(64),
      verificationScope: 'signed_identifiers',
    })

    const result = await resolveCertificateVerification({ studentId: 'ST-1', academicYear: '2025-2026', certType: 'completion' })

    expect(result).not.toBeNull()
    expect(signMock).toHaveBeenCalledWith({
      studentId: 'ST-1',
      academicYear: '2025-2026',
      certId: expect.stringMatching(/^CERT-[0-9A-F]{8}$/),
    })
    const query = params(result!.verifyUrl)
    expect(query.get('parishId')).toBe('gia-ton')
    expect(query.get('sig')).toBe('a'.repeat(64))
    expect(result!.certId).toBe('CERT-1A2B3C4D')
  })

  it('không ký được (offline / thiếu quyền / năm học chưa tồn tại) → null, KHÔNG tự bịa chữ ký', async () => {
    signMock.mockRejectedValue(new Error('offline'))
    expect(await resolveCertificateVerification({ studentId: 'ST-1', academicYear: '2025-2026', certType: 'completion' })).toBeNull()
  })
})

describe('generateSacramentCertificateHTML — QR xác thực trên bản in', () => {
  it('có verifyUrl → in khối QR xác thực kèm mã chứng nhận và nhãn giới hạn ngữ nghĩa', () => {
    const html = generateSacramentCertificateHTML(makeStudent(), {
      parishName: 'Giáo Xứ Gia Tôn',
      certId: 'CERT-1A2B3C4D',
      verifyUrl: 'https://tnttvn.vercel.app/verify?parishId=gia-ton&studentId=ST-1&academicYear=2025-2026&certId=CERT-1A2B3C4D&sig=abc',
    })
    expect(html).toContain('class="verify-block"')
    expect(html).toContain('<svg')
    expect(html).toContain('CERT-1A2B3C4D')
    expect(html).toContain('không xác nhận điểm/nội dung')
  })

  it('không có verifyUrl → bản in giữ nguyên như trước, không có khối QR', () => {
    const html = generateSacramentCertificateHTML(makeStudent(), { parishName: 'Giáo Xứ Gia Tôn' })
    expect(html).not.toContain('class="verify-block"')
    expect(html).not.toContain('<svg')
  })
})
