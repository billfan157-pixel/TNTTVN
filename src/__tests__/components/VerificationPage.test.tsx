import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import VerificationPage from '../../pages/VerificationPage'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, '', '/') })

describe('D10 QR verification contract', () => {
  it('forwards the signed parish and explains the identifier-only guarantee', async () => {
    window.history.replaceState({}, '', '/verify?parishId=parish-A&studentId=child&academicYear=year&certId=cert&sig=signature')
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ success: true, data: {
      verified: true, verificationScope: 'signed_identifiers',
      message: 'Không xác nhận nội dung điểm số hoặc việc cấp chứng nhận.',
    } }) })
    vi.stubGlobal('fetch', fetchMock)
    render(<VerificationPage />)
    expect(await screen.findByText('Chữ ký mã QR hợp lệ')).toBeInTheDocument()
    expect(screen.getByText('Không xác nhận nội dung điểm số hoặc việc cấp chứng nhận.')).toBeInTheDocument()
    expect(new URL(fetchMock.mock.calls[0][0], 'https://example.test').searchParams.get('parishId')).toBe('parish-A')
  })

  it('does not guess a tenant for a QR missing parishId', async () => {
    window.history.replaceState({}, '', '/verify?studentId=child&academicYear=year&certId=cert&sig=signature')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<VerificationPage />)
    expect(await screen.findByText('Thiếu tham số quét QR')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
