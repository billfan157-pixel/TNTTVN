import React, { useMemo, useState } from 'react'
import { Calculator, ClipboardList, Columns3, FileSpreadsheet, Grid3X3 } from 'lucide-react'
import { useStudentStore } from '../../stores/studentStore'
import { useGradeStore } from '../../stores/gradeStore'
import { useFilterStore } from '../../stores/filterStore'
import { useClassStore } from '../../stores/classStore'
import { useSemesterAccess } from '../../hooks/useSemesterAccess'
import { useAuth } from '../../hooks/useAuth'
import type { Student } from '../../types'
import { ExamSessionView } from '../exam/ExamSessionView'
import { MobileDailyGradeEntry } from './MobileDailyGradeEntry'
import { MobileGradeComparison } from './MobileGradeComparison'
import { MobileGradeMatrix } from './MobileGradeMatrix'

 type MobileGradeTab = 'cards' | 'matrix' | 'daily' | 'comparison' | 'exam'

interface MobileGradeViewProps {
  onViewReport: (student: Student) => void
}

const tabs: Array<{ id: MobileGradeTab; label: string; icon: React.ReactNode }> = [
  { id: 'cards', label: 'Thẻ điểm', icon: <FileSpreadsheet size={14} /> },
  { id: 'matrix', label: 'Ma trận', icon: <Grid3X3 size={14} /> },
  { id: 'daily', label: 'Nhập Hằng Ngày', icon: <Calculator size={14} /> },
  { id: 'comparison', label: 'So Sánh HK', icon: <Columns3 size={14} /> },
  { id: 'exam', label: 'Chấm bài', icon: <ClipboardList size={14} /> },
]

export const MobileGradeView: React.FC<MobileGradeViewProps> = ({ onViewReport }) => {
  const { role } = useAuth()
  const [activeTab, setActiveTab] = useState<MobileGradeTab>('cards')
  const students = useStudentStore(s => s.students)
  const getStudentGrade = useGradeStore(s => s.getStudentGrade)
  const calculateStudentAvg = useGradeStore(s => s.calculateStudentAvg)
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
    <div className="mobile-screen mobile-screen--stack" style={{ gap: '12px' }}>
      <section className="bg-surface-card rounded-2xl border border-surface-border shadow-card p-3 mobile-sticky-under-topbar">
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

      <nav aria-label="Các chế độ bảng điểm" className="bg-surface-card rounded-2xl border border-surface-border shadow-card p-1.5 flex gap-1 overflow-x-auto snap-x">
        {tabs.map(tab => (
          <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} aria-current={activeTab === tab.id ? 'page' : undefined} className={`shrink-0 snap-start min-h-[44px] px-3 rounded-xl flex items-center justify-center gap-1.5 text-[11px] font-extrabold transition-colors ${activeTab === tab.id ? 'bg-parish-primary text-white' : 'text-text-secondary hover:bg-surface-hover'}`}>
            {tab.icon}{tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'cards' && (
        <div className="flex flex-col gap-3">
          {filteredStudents.length === 0 ? (
            <div className="bg-surface-card rounded-2xl border border-surface-border p-8 text-center text-sm text-text-muted">Không có thiếu nhi trong bộ lọc hiện tại.</div>
          ) : filteredStudents.map(student => {
            const grade = getStudentGrade(student.id, effectiveSemester)
            const avg = calculateStudentAvg(student.id, effectiveSemester)
            const className = classes.find(item => item.id === student.classId)?.name || '—'
            return (
              <article key={student.id} className="bg-surface-card rounded-2xl border border-surface-border shadow-card overflow-hidden">
                <div className="p-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-extrabold text-parish-primary truncate"><span className="text-parish-secondary mr-1">{student.holyName}</span>{student.fullName}</div>
                    <div className="text-xs text-text-muted mt-1 truncate">{student.code} • {className}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xl font-black text-parish-primary">{avg.score ?? '—'}</div>
                    <span className="badge badge-primary text-[10px]">{avg.label || 'Chưa nhập'}</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-px bg-surface-border border-y border-surface-border">
                  {[
                    ['Miệng', grade?.scoreOral], ['15P', grade?.score15m], ['1 tiết', grade?.score1Period],
                    ['Giữa kỳ', grade?.scoreMidterm], ['Cuối kỳ', grade?.scoreFinal], ['Đạo đức', grade?.scoreDaoDuc],
                  ].map(([label, value]) => <div key={String(label)} className="bg-surface-card p-3 text-center"><div className="text-[10px] font-semibold text-text-muted">{label}</div><div className="text-sm font-black text-text-main mt-1">{value ?? '—'}</div></div>)}
                </div>
                {grade?.comments && <div className="px-4 py-2 text-xs italic text-text-muted bg-surface-app">“{grade.comments}”</div>}
                <div className="p-3 bg-surface-app"><button type="button" onClick={() => onViewReport(student)} className="btn btn-secondary w-full min-h-[44px]">Xem kết quả học tập chi tiết</button></div>
              </article>
            )
          })}
        </div>
      )}
      {activeTab === 'matrix' && <MobileGradeMatrix onViewReport={onViewReport} />}
      {activeTab === 'daily' && <MobileDailyGradeEntry onViewReport={onViewReport} />}
      {activeTab === 'comparison' && <MobileGradeComparison />}
      {activeTab === 'exam' && <div className="mobile-exam-content"><ExamSessionView /></div>}
    </div>
  )
}
