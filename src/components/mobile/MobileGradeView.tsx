import React, { Suspense, useMemo, useState } from 'react'
import { Calculator, ClipboardList, Columns3, Grid3X3 } from 'lucide-react'
import { useStudentStore } from '../../stores/studentStore'
import { useFilterStore } from '../../stores/filterStore'
import { useClassStore } from '../../stores/classStore'
import { useSemesterAccess } from '../../hooks/useSemesterAccess'
import { useAuth } from '../../hooks/useAuth'
import type { Student } from '../../types'
import { lazyWithRetry } from '../../utils/lazyWithRetry'
import { SkeletonCardGrid } from '../common/StateFeedback'
import { Badge } from '../common/ui/Badge'
import { FilterChips, TabPanel, Tabs } from '../common/ui/SelectionControls'

const ExamSessionView = lazyWithRetry(() => import('../exam/ExamSessionView'), 'ExamSessionView')
const MobileDailyGradeEntry = lazyWithRetry(() => import('./MobileDailyGradeEntry'), 'MobileDailyGradeEntry')
const MobileGradeComparison = lazyWithRetry(() => import('./MobileGradeComparison'), 'MobileGradeComparison')
const MobileGradeBoard = lazyWithRetry(() => import('./MobileGradeBoard'), 'MobileGradeBoard')

// C1 Unified: gộp Thẻ điểm + Ma trận → 1 tab Bảng điểm (4 tabs thay vì 5)
 type MobileGradeTab = 'board' | 'daily' | 'comparison' | 'exam'

interface MobileGradeViewProps {
  onViewReport: (student: Student) => void
}

const tabs: Array<{ id: MobileGradeTab; label: string; icon: React.ReactNode }> = [
  { id: 'board', label: 'Bảng điểm', icon: <Grid3X3 size={14} /> },
  { id: 'daily', label: 'Hằng ngày', icon: <Calculator size={14} /> },
  { id: 'comparison', label: 'So sánh', icon: <Columns3 size={14} /> },
  { id: 'exam', label: 'Chấm bài', icon: <ClipboardList size={14} /> },
]

export const MobileGradeView: React.FC<MobileGradeViewProps> = ({ onViewReport }) => {
  const { role } = useAuth()
  const [activeTab, setActiveTab] = useState<MobileGradeTab>('board')
  const students = useStudentStore(s => s.students)
  const selectedClassId = useFilterStore(s => s.selectedClassId)
  const setSelectedClassId = useFilterStore(s => s.setSelectedClassId)
  const selectedSemester = useFilterStore(s => s.selectedSemester)
  const setSelectedSemester = useFilterStore(s => s.setSelectedSemester)
  const classes = useClassStore(s => s.classes)
  const { restricted: semesterRestricted, openSemester } = useSemesterAccess()
  const effectiveSemester: 1 | 2 = semesterRestricted ? openSemester : selectedSemester

  const filteredStudents = useMemo(() => selectedClassId === 'all'
    ? students
    : students.filter(student => student.classId === selectedClassId), [selectedClassId, students])

  const selectedClassLabel = selectedClassId === 'all'
    ? 'Tất cả lớp'
    : classes.find(item => item.id === selectedClassId)?.name || 'Lớp hiện tại'
  const classItems = [
    { value: 'all', label: 'Tất cả lớp' },
    ...classes.map(item => ({ value: item.id, label: item.name })),
  ]
  const semesterValue = String(selectedSemester) as '1' | '2'
  const tabItems = tabs.map(tab => ({ value: tab.id, label: tab.label, icon: tab.icon }))

  return (
    <div className="mobile-screen mobile-screen--stack product-view">
      <section className="mobile-filter-panel mobile-sticky-under-topbar">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="min-w-0">
            <div className="text-sm font-extrabold text-parish-primary truncate">Bảng Điểm Giáo Lý</div>
            <div className="text-[11px] text-text-muted mt-0.5 truncate">{selectedClassLabel} · HK {effectiveSemester}</div>
          </div>
          <Badge tone="neutral" className="text-[10px] shrink-0">{filteredStudents.length} em</Badge>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 snap-x" style={{ WebkitOverflowScrolling: 'touch' }}>
          {/* Class chips: admin only — GLV only sees their assigned classes */}
          {role === 'admin' && (
            <>
              <FilterChips
                ariaLabel="Lọc theo lớp"
                items={classItems}
                value={selectedClassId}
                onValueChange={setSelectedClassId}
                className="shrink-0"
                appearance="pills"
              />
              <span aria-hidden="true" className="w-px bg-surface-border shrink-0" />
            </>
          )}
          {semesterRestricted ? (
            <span className="shrink-0 min-h-[44px] rounded-full px-4 inline-flex items-center bg-parish-primary text-text-inverse text-xs font-extrabold">HK {openSemester === 2 ? 'II' : 'I'}</span>
          ) : (
            <FilterChips
              ariaLabel="Lọc theo học kỳ"
              items={[
                { value: '1', label: 'HK I' },
                { value: '2', label: 'HK II' },
              ]}
              value={semesterValue}
              onValueChange={(value) => setSelectedSemester(Number(value) as 1 | 2)}
              className="shrink-0"
              appearance="pills"
            />
          )}
        </div>
      </section>

      <Tabs
        id="mobile-grade-view-tabs"
        ariaLabel="Các chế độ bảng điểm"
        items={tabItems}
        value={activeTab}
        onValueChange={setActiveTab}
      />

      <TabPanel tabsId="mobile-grade-view-tabs" value="board" activeValue={activeTab}>
        <Suspense fallback={<div className="p-2"><SkeletonCardGrid count={3} /></div>}>
          <MobileGradeBoard onViewReport={onViewReport} />
        </Suspense>
      </TabPanel>
      <TabPanel tabsId="mobile-grade-view-tabs" value="daily" activeValue={activeTab}>
        <Suspense fallback={<div className="p-2"><SkeletonCardGrid count={3} /></div>}>
          <MobileDailyGradeEntry onViewReport={onViewReport} />
        </Suspense>
      </TabPanel>
      <TabPanel tabsId="mobile-grade-view-tabs" value="comparison" activeValue={activeTab}>
        <Suspense fallback={<div className="p-2"><SkeletonCardGrid count={3} /></div>}>
          <MobileGradeComparison />
        </Suspense>
      </TabPanel>
      <TabPanel tabsId="mobile-grade-view-tabs" value="exam" activeValue={activeTab}>
        <div className="mobile-exam-content">
          <Suspense fallback={<div className="p-2"><SkeletonCardGrid count={3} /></div>}>
            <ExamSessionView />
          </Suspense>
        </div>
      </TabPanel>
    </div>
  )
}
