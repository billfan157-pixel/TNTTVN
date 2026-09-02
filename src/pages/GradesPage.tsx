import { useState, Suspense } from 'react'
import { MobileGradeView } from '../components/mobile/MobileGradeView'
import { useUIStore } from '../stores/uiStore'
import { useEffectiveMode } from '../hooks/useEffectiveMode'
import { Grid3X3, FileSpreadsheet, Columns3, Calculator, ClipboardList, LibraryBig } from 'lucide-react'
import { lazyWithRetry } from '../utils/lazyWithRetry'
import type { Student } from '../types'
import { TabPanel, Tabs } from '../components/common/ui/SelectionControls'

const DesktopGradeMatrix = lazyWithRetry(() => import('../components/desktop/DesktopGradeMatrix'), 'DesktopGradeMatrix')
const DesktopGradeCards = lazyWithRetry<React.FC<{
  onViewReport: (student: Student) => void
  onPrintReport: (student: Student) => void
}>>(() => import('../components/desktop/DesktopGradeCards'), 'DesktopGradeCards')
const DesktopGradeComparison = lazyWithRetry(() => import('../components/desktop/DesktopGradeComparison'), 'DesktopGradeComparison')
const DesktopDailyGradeEntry = lazyWithRetry(() => import('../components/desktop/DesktopDailyGradeEntry'), 'DesktopDailyGradeEntry')
const ExamSessionView = lazyWithRetry(() => import('../components/exam/ExamSessionView'), 'ExamSessionView')
const QuestionBankView = lazyWithRetry(() => import('../components/exam/QuestionBankView'), 'QuestionBankView')

type GradeViewMode = 'matrix' | 'cards' | 'comparison' | 'daily' | 'exam' | 'bank'

const VIEW_TABS: { id: GradeViewMode; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: 'matrix', label: 'Ma Trận', icon: <Grid3X3 size={16} />, desc: 'Nhập điểm hàng loạt' },
  { id: 'cards', label: 'Thẻ Điểm', icon: <FileSpreadsheet size={16} />, desc: 'Xem từng em' },
  { id: 'comparison', label: 'So Sánh', icon: <Columns3 size={16} />, desc: 'HK I vs HK II' },
  { id: 'daily', label: 'Hằng Ngày', icon: <Calculator size={16} />, desc: 'Nhập nhiều lần' },
  { id: 'exam', label: 'Chấm Bài', icon: <ClipboardList size={16} />, desc: 'QR + nhập nhanh' },
  { id: 'bank', label: 'Ngân Hàng', icon: <LibraryBig size={16} />, desc: 'Câu hỏi + ma trận đề' },
]

export function GradesPage() {
  const effectiveMode = useEffectiveMode()
  const { openReport, openReportForPrint } = useUIStore()
  const [viewMode, setViewMode] = useState<GradeViewMode>('matrix')
  const viewItems = VIEW_TABS.map(tab => ({
    value: tab.id,
    icon: tab.icon,
    label: (
      <>
        <span>{tab.label}</span>
        <span className={`text-[10px] hidden sm:inline ${viewMode === tab.id ? 'text-white/80' : 'text-text-muted'}`}>
          {tab.desc}
        </span>
      </>
    ),
    ariaLabel: `${tab.label}: ${tab.desc}`,
  }))

  if (effectiveMode === 'desktop') {
    return (
      <div className="flex flex-col gap-4">
        {/* View Mode Tabs — PHA 4: flex-wrap để không tràn ngang @1024px */}
        <Tabs
          id="desktop-grade-view-tabs"
          ariaLabel="Chế độ quản lý điểm"
          items={viewItems}
          value={viewMode}
          onValueChange={setViewMode}
          className="self-start flex-wrap"
        />

        {/* Active View with Suspense */}
        <TabPanel tabsId="desktop-grade-view-tabs" value="matrix" activeValue={viewMode}>
          <Suspense fallback={<div className="flex items-center justify-center h-64 text-text-secondary text-sm font-medium">Đang tải phân vùng điểm...</div>}><DesktopGradeMatrix /></Suspense>
        </TabPanel>
        <TabPanel tabsId="desktop-grade-view-tabs" value="cards" activeValue={viewMode}>
          <Suspense fallback={<div className="flex items-center justify-center h-64 text-text-secondary text-sm font-medium">Đang tải phân vùng điểm...</div>}><DesktopGradeCards onViewReport={openReport} onPrintReport={openReportForPrint} /></Suspense>
        </TabPanel>
        <TabPanel tabsId="desktop-grade-view-tabs" value="comparison" activeValue={viewMode}>
          <Suspense fallback={<div className="flex items-center justify-center h-64 text-text-secondary text-sm font-medium">Đang tải phân vùng điểm...</div>}><DesktopGradeComparison /></Suspense>
        </TabPanel>
        <TabPanel tabsId="desktop-grade-view-tabs" value="daily" activeValue={viewMode}>
          <Suspense fallback={<div className="flex items-center justify-center h-64 text-text-secondary text-sm font-medium">Đang tải phân vùng điểm...</div>}><DesktopDailyGradeEntry /></Suspense>
        </TabPanel>
        <TabPanel tabsId="desktop-grade-view-tabs" value="exam" activeValue={viewMode}>
          <Suspense fallback={<div className="flex items-center justify-center h-64 text-text-secondary text-sm font-medium">Đang tải phân vùng điểm...</div>}><ExamSessionView /></Suspense>
        </TabPanel>
        <TabPanel tabsId="desktop-grade-view-tabs" value="bank" activeValue={viewMode}>
          <Suspense fallback={<div className="flex h-64 items-center justify-center text-sm font-medium text-text-secondary">Đang tải ngân hàng câu hỏi...</div>}><QuestionBankView /></Suspense>
        </TabPanel>
      </div>
    )
  }

  return <MobileGradeView onViewReport={openReport} />
}

export default GradesPage
