import { useEffect, useRef } from 'react'
import { useGradeStore } from '../stores/gradeStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useAcademicYearStore } from '../stores/academicYearStore'
import { useClassStore } from '../stores/classStore'
import { useNoticeStore } from '../stores/noticeStore'
import { useToastStore } from '../stores/toastStore'

function isNetworkError(msg: string): boolean {
  const lower = msg.toLowerCase()
  return lower.includes('failed to fetch') || lower.includes('network error') || lower.includes('network request failed')
}

/**
 * A3 (polish plan 2026-08-14): store `error` fields (grade/settings/academicYear)
 * từng được set nhưng không component nào subscribe — lỗi tải dữ liệu vô hình
 * với người dùng. Hook này nghe các error field và phát toast 1 lần mỗi chuỗi
 * lỗi mới (không spam trên re-render).
 */
export function useStoreErrorWatcher() {
  const gradeError = useGradeStore((s) => s.error)
  const settingsError = useSettingsStore((s) => s.error)
  const yearError = useAcademicYearStore((s) => s.error)
  const classError = useClassStore((s) => s.error)
  const noticeError = useNoticeStore((s) => s.error)

  const lastShown = useRef<Record<string, string>>({})

  useEffect(() => {
    const sources: Array<[string, string | null, string]> = [
      ['grade', gradeError, 'Không thể tải điểm số'],
      ['settings', settingsError, 'Không thể tải cấu hình giáo xứ'],
      ['academicYear', yearError, 'Không thể tải danh sách năm học'],
      ['class', classError, 'Không thể tải danh sách lớp học'],
      ['notice', noticeError, 'Không thể tải danh sách thông báo'],
    ]
    for (const [key, err, fallback] of sources) {
      if (err && err !== lastShown.current[key]) {
        lastShown.current[key] = err
        const msg = isNetworkError(err)
          ? `${fallback} — mất kết nối mạng, đang dùng dữ liệu offline.`
          : `${fallback}: ${err}`
        useToastStore.getState().addToast(msg, 'error')
      } else if (!err) {
        lastShown.current[key] = ''
      }
    }
  }, [gradeError, settingsError, yearError, classError, noticeError])
}