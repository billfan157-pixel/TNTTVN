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

  return (
    <div className="mobile-screen mobile-screen--stack product-view">
      <section className="mobile-filter-panel mobile-sticky-under-topbar">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="min-w-0">
            <div className="text-sm font-extrabold text-parish-primary truncate">Bảng Điểm Giáo Lý</div>
            <div className="text-[11px] text-text-muted mt-0.5 truncate">{selectedClassLabel} · HK {effectiveSemester}</div>
          </div>
          <span className="badge badge-neutral text-[10px] shrink-0">{filteredStudents.length} em</span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 snap-x" style={{ WebkitOverflowScrolling: 'touch' }}>
          {/* Class chips: admin only — GLV only sees their assigned classes */}
          {role === 'admin' && (<>
          <button type="button" onClick={() => setSelectedClassId('all')} className={`shrink-0 snap-start min-h-[44px] rounded-full px-4 text-xs font-extrabold ${selectedClassId === 'all' ? 'bg-parish-primary text-white' : 'bg-surface-hover text-text-secondary'}`}>Tất cả lớp</button>
          {classes.map(item => (
            <button key={item.id} type="button" onClick={() => setSelectedClassId(item.id)} className={`shrink-0 snap-start min-h-[44px] rounded-full px-4 text-xs font-extrabold ${selectedClassId === item.id ? 'bg-parish-primary text-white' : 'bg-surface-hover text-text-secondary'}`}>{item.name}</button>
          ))}
          <span className="w-px bg-surface-border shrink-0" />
          </>)}
          {semesterRestricted ? (
            <span className="shrink-0 min-h-[44px] rounded-full px-4 inline-flex items-center bg-parish-primary text-white text-xs font-extrabold">HK {openSemester === 2 ? 'II' : 'I'}</span>
          ) : [1, 2].map(semester => (
            <button key={semester} type="button" onClick={() => setSelectedSemester(semester as 1 | 2)} className={`shrink-0 min-h-[44px] rounded-full px-4 text-xs font-extrabold ${selectedSemester === semester ? 'bg-parish-primary text-white' : 'bg-surface-hover text-text-secondary'}`}>HK {semester === 1 ? 'I' : 'II'}</button>
          ))}
        </div>
      </section>

      <nav aria-label="Các chế độ bảng điểm" className="view-tabs">
        {tabs.map(tab => (
          <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} aria-current={activeTab === tab.id ? 'page' : undefined} className={`view-tab ${activeTab === tab.id ? 'is-active' : ''}`}>
            {tab.icon}{tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'board' && (
        <Suspense fallback={<div className="p-2"><SkeletonCardGrid count={3} /></div>}>
          <MobileGradeBoard onViewReport={onViewReport} />
        </Suspense>
      )}
      {activeTab === 'daily' && (
        <Suspense fallback={<div className="p-2"><SkeletonCardGrid count={3} /></div>}>
          <MobileDailyGradeEntry onViewReport={onViewReport} />
        </Suspense>
      )}
      {activeTab === 'comparison' && (
        <Suspense fallback={<div className="p-2"><SkeletonCardGrid count={3} /></div>}>
          <MobileGradeComparison />
        </Suspense>
      )}
      {activeTab === 'exam' && (
        <div className="mobile-exam-content">
          <Suspense fallback={<div className="p-2"><SkeletonCardGrid count={3} /></div>}>
            <ExamSessionView />
          </Suspense>
        </div>
      )}
    </div>
  )
}
