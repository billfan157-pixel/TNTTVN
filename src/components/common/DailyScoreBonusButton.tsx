import { useRef, useState } from 'react'
import type { DailyScoreType, Student } from '../../types'
import { useDailyGradeStore } from '../../stores/dailyGradeStore'
import { useToastStore } from '../../stores/toastStore'
import { Button } from './ui/Button'

interface Props {
  student: Student
  scoreType: DailyScoreType
  semester: 1 | 2
  academicYear: string
}

export function DailyScoreBonusButton({ student, scoreType, semester, academicYear }: Props) {
  const addScoreBonus = useDailyGradeStore(state => state.addScoreBonus)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const scoreLabel = scoreType === 'oral' ? 'miệng' : scoreType === 'prayer' ? 'khảo kinh' : scoreType === '15m' ? '15 phút' : '1 tiết'
  const label = `Cộng 1 điểm ${scoreLabel} cho ${student.fullName}`

  const addBonus = async () => {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    try {
      await addScoreBonus(student.id, scoreType, 1, semester, academicYear)
      useToastStore.getState().addToast(`Đã ghi nhận yêu cầu +1 điểm ${scoreLabel} cho ${student.fullName}, đang chờ đồng bộ.`, 'success')
    } catch {
      useToastStore.getState().addToast(`Chưa lưu được yêu cầu +1 điểm cho ${student.fullName}. Bấm lại để thử.`, 'error')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return <Button
    variant="secondary"
    size="sm"
    className="shrink-0 min-w-[44px] tabular-nums"
    aria-label={label}
    title={`${label}. Bỏ qua lần đã 10 điểm, tối đa 10.`}
    loading={saving}
    onClick={() => void addBonus()}
  >+1</Button>
}
