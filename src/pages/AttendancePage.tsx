import React, { Suspense, useState } from 'react'
import { MobileAttendanceView } from '../components/mobile/MobileAttendanceView'
import { useEffectiveMode } from '../hooks/useEffectiveMode'
import { lazyWithRetry } from '../utils/lazyWithRetry'
import { SkeletonTable } from '../components/common/StateFeedback'
import { useAuthStore } from '../stores/authStore'
import { DesktopAppShell } from '../components/desktop/DesktopAppShell'
import { PageHeader } from '../components/common/PageHeader'
import { ArrowLeft, FileSpreadsheet } from 'lucide-react'

// Desktop grid + admin-only TINI panel stay out of the initial bundle:
// they load on demand only when actually rendered.
const DesktopAttendanceGrid = lazyWithRetry(
  () => import('../components/desktop/DesktopAttendanceGrid'),
  'DesktopAttendanceGrid'
)
const TiniAttendanceImportPanel = lazyWithRetry(
  () => import('../components/attendance/TiniAttendanceImportPanel'),
  'TiniAttendanceImportPanel'
)

export function AttendancePage() {
  const effectiveMode = useEffectiveMode()
  const isAdmin = useAuthStore(state => state.user?.role === 'admin')
  const [showTiniImport, setShowTiniImport] = useState(false)

  if (isAdmin && showTiniImport) {
    if (effectiveMode === 'desktop') {
      return (
        <DesktopAppShell width="wide">
          <PageHeader
            icon={<FileSpreadsheet className="text-parish-primary" size={24} />}
            title="Nhập Điểm Danh TINI (CCAMS)"
            description="Đối chiếu và nạp dữ liệu chuyên cần từ tệp trích xuất của tiện ích TINI Extension vào hệ thống Catevia"
            actions={
              <button
                type="button"
                onClick={() => setShowTiniImport(false)}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-surface-card hover:bg-surface-hover text-text-main border border-surface-border text-xs font-semibold shadow-xs hover:shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-parish-primary/30"
              >
                <ArrowLeft size={15} />
                <span>Quay lại sổ điểm danh</span>
              </button>
            }
          />
          <div className="mt-4" id="tini-attendance-import">
            <Suspense fallback={<SkeletonTable rows={8} cols={6} />}>
              <TiniAttendanceImportPanel />
            </Suspense>
          </div>
        </DesktopAppShell>
      )
    }

    return (
      <div className="product-view px-3 py-3 space-y-3" id="tini-attendance-import">
        <div className="flex items-center justify-between bg-surface-card p-2.5 rounded-xl border border-surface-border shadow-xs">
          <button
            type="button"
            onClick={() => setShowTiniImport(false)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-hover hover:bg-surface-border text-text-main text-xs font-semibold transition-colors"
          >
            <ArrowLeft size={14} />
            <span>Quay lại điểm danh</span>
          </button>
          <span className="px-2 py-0.5 rounded-md text-xs font-bold uppercase tracking-wider bg-parish-primary/10 text-parish-primary">
            TINI Extension
          </span>
        </div>
        <Suspense fallback={<SkeletonTable rows={6} cols={4} />}>
          <TiniAttendanceImportPanel />
        </Suspense>
      </div>
    )
  }

  return (
    <>
      {effectiveMode === 'desktop' ? (
        <Suspense fallback={<SkeletonTable rows={8} cols={6} />}>
          <DesktopAttendanceGrid
            onOpenTiniImport={isAdmin ? () => setShowTiniImport(true) : undefined}
          />
        </Suspense>
      ) : (
        <MobileAttendanceView
          onOpenTiniImport={isAdmin ? () => setShowTiniImport(true) : undefined}
        />
      )}
    </>
  )
}

export default AttendancePage
