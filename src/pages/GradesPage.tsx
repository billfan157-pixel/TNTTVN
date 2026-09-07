import { useCallback, Suspense } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { MobileGradeView } from '../components/mobile/MobileGradeView'
import { useUIStore } from '../stores/uiStore'
import { useEffectiveMode } from '../hooks/useEffectiveMode'
import { Grid3X3, FileSpreadsheet, Columns3, Calculator, ClipboardList, LibraryBig } from 'lucide-react'
import { lazyWithRetry } from '../utils/lazyWithRetry'
import type { Student } from '../types'
import { TabPanel, Tabs } from '../components/common/ui/SelectionControls'
import { SkeletonTable, SkeletonCardGrid } from '../components/common/StateFeedback'

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
  { id: 'bank', label: 'Ngân Hàng Đề Thi', icon: <LibraryBig size={16} />, desc: 'Câu hỏi + ma trận đề' },
]

export function GradesPage() {
  const navigate = useNavigate()
  const search = useSearch({ from: '/grades' })
  const effectiveMode = useEffectiveMode()
  const { openReport, openReportForPrint } = useUIStore()
  const viewMode = (search.view as GradeViewMode) || 'matrix'

  const handleViewChange = useCallback((newView: GradeViewMode) => {
    navigate({
      to: '/grades',
      search: (prev: any) => ({ ...prev, view: newView }),
      replace: true,
    })
  }, [navigate])

  const viewItems = VIEW_TABS.map(tab => ({
    value: tab.id,
    icon: tab.icon,
    label: (
      <>
        <span>{tab.label}</span>
        <span className={`text-xs hidden 2xl:inline ${viewMode === tab.id ? 'opacity-80' : 'text-text-muted'}`}>
          {tab.desc}
        </span>
      </>
    ),
    ariaLabel: `${tab.label}: ${tab.desc}`,
  }))

  if (effectiveMode === 'desktop') {
    return (
      <div className="flex flex-col gap-4">
        {/* View Mode Tabs — Cùng hàng không ngắt dòng */}
        <Tabs
          id="desktop-grade-view-tabs"
          ariaLabel="Chế độ quản lý điểm"
          items={viewItems}
          value={viewMode}
          onValueChange={handleViewChange}
          className="self-start max-w-full flex-nowrap"
        />

        {/* Active View with Suspense */}
        <TabPanel tabsId="desktop-grade-view-tabs" value="matrix" activeValue={viewMode}>
          <Suspense fallback={<SkeletonTable rows={8} cols={7} />}><DesktopGradeMatrix /></Suspense>
        </TabPanel>
        <TabPanel tabsId="desktop-grade-view-tabs" value="cards" activeValue={viewMode}>
          <Suspense fallback={<SkeletonCardGrid count={6} />}><DesktopGradeCards onViewReport={openReport} onPrintReport={openReportForPrint} /></Suspense>
        </TabPanel>
        <TabPanel tabsId="desktop-grade-view-tabs" value="comparison" activeValue={viewMode}>
          <Suspense fallback={<SkeletonTable rows={8} cols={6} />}><DesktopGradeComparison /></Suspense>
        </TabPanel>
        <TabPanel tabsId="desktop-grade-view-tabs" value="daily" activeValue={viewMode}>
          <Suspense fallback={<SkeletonTable rows={8} cols={5} />}><DesktopDailyGradeEntry /></Suspense>
        </TabPanel>
        <TabPanel tabsId="desktop-grade-view-tabs" value="exam" activeValue={viewMode}>
          <Suspense fallback={<SkeletonCardGrid count={4} />}><ExamSessionView /></Suspense>
        </TabPanel>
        <TabPanel tabsId="desktop-grade-view-tabs" value="bank" activeValue={viewMode}>
          <Suspense fallback={<SkeletonTable rows={6} cols={5} />}><QuestionBankView /></Suspense>
        </TabPanel>
      </div>
    )
  }

  return <MobileGradeView onViewReport={openReport} />
}

export default GradesPage
