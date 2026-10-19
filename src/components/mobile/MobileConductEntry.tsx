import React, { useMemo, useRef, useState } from 'react'
import type { Student } from '../../types'
import { useDailyGradeStore } from '../../stores/dailyGradeStore'
import { useGradeStore } from '../../stores/gradeStore'
import { useToastStore } from '../../stores/toastStore'
import { normalizeAcademicYear } from '../../utils/academicYear'
import { StudentName } from '../common/StudentName'
import { NoResultState } from '../common/StateFeedback'

const formatScore = (value: number) => value.toLocaleString('vi-VN')

interface Props {
  students: Student[]
  semester: 1 | 2
  academicYear: string
  canEdit: boolean
}

export function MobileConductEntry({ students, semester, academicYear, canEdit }: Props) {
  const entries = useDailyGradeStore(s => s.conductEntries)
  const addDeduction = useDailyGradeStore(s => s.addConductDeduction)
  const grades = useGradeStore(s => s.grades)
  const [drafts, setDrafts] = useState<Record<string, { value: number; reason: string }>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const savingRef = useRef(false)
  const [announcement, setAnnouncement] = useState('')
  const scopedEntries = useMemo(() => entries.filter(e => e.semester === semester && normalizeAcademicYear(e.academicYear) === normalizeAcademicYear(academicYear)), [entries, semester, academicYear])

  const save = async (student: Student) => {
    const draft = drafts[student.id]
    if (!canEdit || savingRef.current || !draft?.reason.trim()) return
    savingRef.current = true
    setSaving(student.id)
    try {
      await addDeduction(student.id, draft.value, draft.reason, semester)
      setDrafts(previous => { const next = { ...previous }; delete next[student.id]; return next })
      setAnnouncement(`Đã lưu lần trừ ${formatScore(draft.value)} điểm của ${student.fullName} trên thiết bị, đang chờ đồng bộ.`)
    } catch {
      useToastStore.getState().addToast('Chưa lưu được lần trừ điểm. Lý do vẫn được giữ để thử lại.', 'error')
    } finally {
      savingRef.current = false
      setSaving(null)
    }
  }

  return <section className="flex flex-col gap-3" aria-label="Điểm đạo đức">
    <p className="text-sm text-text-secondary">Mặc định 10 điểm mỗi học kỳ. Mỗi lần trừ cần ghi rõ lý do. Điểm đã có được giữ lại.</p>
    <div className="sr-only" role="status">{announcement}</div>
    {students.length === 0 && <NoResultState title="Không có thiếu nhi" description="Không có thiếu nhi trong lớp hiện tại." />}
    {students.map(student => {
      const history = scopedEntries.filter(e => e.studentId === student.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
      const grade = grades.find(g => g.studentId === student.id && g.semester === semester && normalizeAcademicYear(g.academicYear) === normalizeAcademicYear(academicYear))
      const latest = history.find(e => !e.pending && e.afterScore !== undefined)
      const baseline = latest && (!grade?.updatedAt || latest.createdAt >= grade.updatedAt) ? latest.afterScore! : grade?.scoreDaoDuc ?? 10
      const pending = history.filter(e => e.pending)
      const score = Math.max(0, baseline - pending.reduce((sum, e) => sum + e.value, 0))
      const draft = drafts[student.id]
      return <article key={student.id} className="entity-card p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <StudentName holyName={student.holyName} fullName={student.fullName} size="base" />
          <strong className="shrink-0 whitespace-nowrap text-lg text-parish-primary tabular-nums" aria-label={`Điểm đạo đức của ${student.fullName}`}>{formatScore(score)} / 10</strong>
        </div>
        {pending.length > 0 && <p className="text-xs text-parish-warning">{pending.length} lần trừ đang chờ đồng bộ; điểm hiển thị tạm tính. Xem trạng thái đồng bộ nếu máy chủ từ chối.</p>}
        {canEdit && <>
          <div className="grid grid-cols-3 gap-2" aria-label={`Trừ điểm của ${student.fullName}`}>
            {[0.5, 1, 2].map(value => <button key={value} type="button" className={`btn min-h-[44px] ${draft?.value === value ? 'btn-primary' : 'btn-secondary'}`} disabled={saving !== null || score < value} aria-pressed={draft?.value === value} onClick={() => setDrafts(previous => ({ ...previous, [student.id]: { value, reason: previous[student.id]?.reason || '' } }))}>−{formatScore(value)} đ</button>)}
          </div>
          {draft && <form className="flex flex-col gap-3" onSubmit={event => { event.preventDefault(); void save(student) }}>
            <label className="text-sm font-semibold flex flex-col gap-2">
              Lý do trừ {formatScore(draft.value)} điểm của {student.fullName}
              <textarea className="form-input min-h-[88px]" value={draft.reason} required maxLength={500} disabled={saving !== null} onChange={event => setDrafts(previous => ({ ...previous, [student.id]: { ...draft, reason: event.target.value } }))} placeholder="Ví dụ: Nói chuyện riêng trong giờ học" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="btn btn-secondary min-h-[44px]" disabled={saving !== null} onClick={() => setDrafts(previous => { const next = { ...previous }; delete next[student.id]; return next })}>Hủy</button>
              <button type="submit" className="btn btn-primary min-h-[44px]" disabled={saving !== null || !draft.reason.trim() || score < draft.value}>{saving === student.id ? 'Đang lưu…' : 'Lưu lần trừ'}</button>
            </div>
          </form>}
        </>}
        {history.length > 0 && <details>
          <summary className="min-h-[44px] flex items-center text-sm font-semibold cursor-pointer">Lịch sử trừ điểm ({history.length})</summary>
          <ul className="flex flex-col gap-3 text-sm">
            {history.map(entry => <li key={entry.id} className="border-t border-surface-border pt-2">
              <div className="flex justify-between gap-2"><strong className="text-parish-danger">−{formatScore(entry.value)} đ</strong><time className="text-xs text-text-muted">{entry.date.split('-').reverse().join('/')}</time></div>
              <p className="text-text-secondary whitespace-pre-wrap break-words">{entry.reason}</p>
              {entry.pending && <span className="text-xs text-parish-warning">Chờ đồng bộ</span>}
            </li>)}
          </ul>
        </details>}
      </article>
    })}
  </section>
}
