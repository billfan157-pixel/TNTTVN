import React, { useState, useEffect } from 'react'
import {  ShieldAlert, CheckCircle2, AlertTriangle } from 'lucide-react'
import { Button } from '../components/common/ui/Button'

export default function VerificationPage() {
  const [params, setParams] = useState<{ studentId?: string; academicYear?: string; certId?: string; sig?: string }>({})
  const [loading, setLoading] = useState<boolean>(true)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const studentId = searchParams.get('studentId') || searchParams.get('s') || undefined
    const academicYear = searchParams.get('academicYear') || searchParams.get('y') || undefined
    const certId = searchParams.get('certId') || searchParams.get('c') || undefined
    const sig = searchParams.get('sig') || undefined

    setParams({ studentId, academicYear, certId, sig })

    if (studentId && academicYear && certId && sig) {
      fetch(`/api/verification/verify?studentId=${encodeURIComponent(studentId)}&academicYear=${encodeURIComponent(academicYear)}&certId=${encodeURIComponent(certId)}&sig=${encodeURIComponent(sig)}`)
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setResult(data.data)
          } else {
            setError(data.error?.message || 'Xác thực thất bại')
          }
          setLoading(false)
        })
        .catch(err => {
          setError(err.message || 'Lỗi kết nối máy chủ xác thực')
          setLoading(false)
        })
    } else {
      setLoading(false)
    }
  }, [])

  return (
    <main className="auth-page">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="w-16 h-16 rounded-3xl bg-[var(--color-parish-primary)] text-text-inverse flex items-center justify-center mx-auto shadow-lg mb-3 font-black text-2xl">
            BD
          </div>
          <h1 className="typography-page-title">Cổng Xác Thực Kết Quả Học Tập</h1>
          <p className="typography-caption">Brave Davinci Parish Management PWA</p>
        </div>

        <div className="auth-card max-w-none">
          <div className="p-6 border-b border-[var(--color-surface-border)] bg-[var(--color-surface-hover)] text-center">
            <h2 className="typography-card-title">Kết quả Kiểm tra Nguyên vẹn</h2>
          </div>
          <div className="p-6 space-y-6">
            {loading ? (
              <div className="text-center py-10">
                <div className="w-8 h-8 border-4 border-[var(--color-parish-primary)] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="typography-caption">Đang kiểm tra chữ ký HMAC trên máy chủ...</p>
              </div>
            ) : !params.studentId || !params.sig ? (
              <div className="text-center py-6 space-y-4">
                <div className="icon-container-lg mx-auto rounded-2xl bg-[var(--color-parish-warning-bg)] text-[var(--color-parish-warning)]">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="typography-card-title">Thiếu tham số quét QR</h3>
                  <p className="typography-body-sm mt-1">Đường dẫn xác thực không đầy đủ. Vui lòng quét lại mã QR trên kết quả học tập chính thức.</p>
                </div>
                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  onClick={() => window.location.href = '/'}
                >
                  Quay lại Trang Chủ
                </Button>
              </div>
            ) : error ? (
              <div className="text-center py-6 space-y-4">
                <div className="icon-container-lg mx-auto rounded-2xl bg-[var(--color-parish-danger-bg)] text-[var(--color-parish-danger)]">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="typography-card-title text-[var(--color-parish-danger)]">Lỗi Hệ thống Xác Thực</h3>
                  <p className="typography-body-sm mt-1">{error}</p>
                </div>
              </div>
            ) : result?.verified ? (
              <div className="space-y-5">
                <div className="flex items-center gap-3 p-4 rounded-2xl bg-[var(--color-parish-success-bg)] border border-[var(--color-parish-success)]/20">
                  <CheckCircle2 className="w-8 h-8 text-[var(--color-parish-success)] shrink-0" />
                  <div>
                    <h3 className="typography-card-title text-[var(--color-parish-success)]">Kết Quả Học Tập Hợp Lệ</h3>
                    <p className="typography-body-sm text-[var(--color-parish-success)] mt-0.5">{result.message}</p>
                  </div>
                </div>

                {result.student && (
                  <div className="p-4 rounded-2xl bg-[var(--color-surface-hover)] border border-[var(--color-surface-border)] space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="typography-body-sm text-[var(--color-text-muted)]">Họ và Tên:</span>
                      <span className="font-bold text-[var(--color-text-main)]">{result.student.holyName} {result.student.fullName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="typography-body-sm text-[var(--color-text-muted)]">Mã Thiếu Nhi:</span>
                      <span className="font-bold text-[var(--color-text-main)]">{result.student.code}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="typography-body-sm text-[var(--color-text-muted)]">Lớp:</span>
                      <span className="font-bold text-[var(--color-text-main)]">{result.student.className}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="typography-body-sm text-[var(--color-text-muted)]">Năm Học:</span>
                      <span className="font-bold text-[var(--color-text-main)]">{result.academicYear}</span>
                    </div>
                  </div>
                )}

                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  onClick={() => window.location.href = '/'}
                >
                  Trở về Ứng Dụng Quản Lý
                </Button>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-center gap-3 p-4 rounded-2xl bg-[var(--color-parish-danger-bg)] border border-[var(--color-parish-danger)]/20">
                  <ShieldAlert className="w-8 h-8 text-[var(--color-parish-danger)] shrink-0" />
                  <div>
                    <h3 className="typography-card-title text-[var(--color-parish-danger)]">Cảnh Báo Giả Mạo</h3>
                    <p className="typography-body-sm text-[var(--color-parish-danger)] mt-0.5">{result?.message || 'Mã QR không hợp lệ hoặc đã bị thay đổi.'}</p>
                  </div>
                </div>
                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  onClick={() => window.location.href = '/'}
                >
                  Trở về Trang Chủ
                </Button>
              </div>
            )}
          </div>
        </div>

        <p className="text-center typography-caption mt-6">
          © 2026 Brave Davinci Parish Management PWA. Secured with Server-Side HMAC-SHA256.
        </p>
      </div>
    </main>
  )
}
