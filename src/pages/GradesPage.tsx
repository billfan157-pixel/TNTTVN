import { useState, Suspense } from 'react'
import { MobileGradeView } from '../components/mobile/MobileGradeView'
import { useUIStore } from '../stores/uiStore'
import { useEffectiveMode } from '../hooks/useEffectiveMode'
import { Grid3X3, FileSpreadsheet, Columns3, Calculator, ClipboardList } from 'lucide-react'
import { lazyWithRetry } from '../utils/lazyWithRetry'
import type { Student } from '../types'

const DesktopGradeMatrix = lazyWithRetry(() => import('../components/desktop/DesktopGradeMatrix'), 'DesktopGradeMatrix')
const DesktopGradeCards = lazyWithRetry<React.FC<{
  onViewReport: (student: Student) => void
  onPrintReport: (student: Student) => void
}>>(() => import('../components/desktop/DesktopGradeCards'), 'DesktopGradeCards')
const DesktopGradeComparison = lazyWithRetry(() => import('../components/desktop/DesktopGradeComparison'), 'DesktopGradeComparison')
const DesktopDailyGradeEntry = lazyWithRetry(() => import('../components/desktop/DesktopDailyGradeEntry'), 'DesktopDailyGradeEntry')
const ExamSessionView = lazyWithRetry(() => import('../components/exam/ExamSessionView'), 'ExamSessionView')

type GradeViewMode = 'matrix' | 'cards' | 'comparison' | 'daily' | 'exam'

const VIEW_TABS: { id: GradeViewMode; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: 'matrix', label: 'Ma Trận', icon: <Grid3X3 size={16} />, desc: 'Nhập điểm hàng loạt' },
  { id: 'cards', label: 'Thẻ Điểm', icon: <FileSpreadsheet size={16} />, desc: 'Xem từng em' },
  { id: 'comparison', label: 'So Sánh', icon: <Columns3 size={16} />, desc: 'HK I vs HK II' },
  { id: 'daily', label: 'Hằng Ngày', icon: <Calculator size={16} />, desc: 'Nhập nhiều lần' },
  { id: 'exam', label: 'Chấm Bài', icon: <ClipboardList size={16} />, desc: 'QR + nhập nhanh' },
]

export function GradesPage() {
  const effectiveMode = useEffectiveMode()
  const { openReport, openReportForPrint } = useUIStore()
  const [viewMode, setViewMode] = useState<GradeViewMode>('matrix')

  if (effectiveMode === 'desktop') {
    return (
      <div className="flex flex-col gap-4">
        {/* View Mode Tabs */}
        <div className="bg-surface-hover border border-surface-border rounded-2xl p-1.5 inline-flex self-start gap-1">
          {VIEW_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setViewMode(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                viewMode === tab.id
                  ? 'bg-parish-primary text-white shadow-sm'
                  : 'text-text-secondary hover:bg-surface-hover'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              <span className={`text-[10px] hidden sm:inline ${viewMode === tab.id ? 'text-white/80' : 'text-text-muted'}`}>
                {tab.desc}
              </span>
            </button>
          ))}
        </div>

        {/* Active View with Suspense */}
        <Suspense fallback={<div className="flex items-center justify-center h-64 text-text-secondary text-sm font-medium">Đang tải phân vùng điểm...</div>}>
          {viewMode === 'matrix' && <DesktopGradeMatrix />}
          {viewMode === 'cards' && <DesktopGradeCards onViewReport={openReport} onPrintReport={openReportForPrint} />}
          {viewMode === 'comparison' && <DesktopGradeComparison />}
          {viewMode === 'daily' && <DesktopDailyGradeEntry />}
          {viewMode === 'exam' && <ExamSessionView />}
        </Suspense>
      </div>
    )
  }

  return <MobileGradeView onViewReport={openReport} />
}

export default GradesPage
