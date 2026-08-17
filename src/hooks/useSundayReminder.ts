import { useEffect, useRef } from 'react'
import { useSettingsStore } from '../stores/settingsStore'

const REMINDER_KEY = 'sunday_reminder_last_shown'

/** '08:00' → '8h00' (hiển thị tiếng Việt). */
function formatHourMinute(hhmm: string): string {
  const [h, m] = hhmm.split(':')
  const hour = parseInt(h || '8', 10)
  const minute = parseInt(m || '0', 10)
  return minute === 0 ? `${hour}h00` : `${hour}h${String(minute).padStart(2, '0')}`
}

export function useSundayReminder() {
  const checked = useRef(false)

  useEffect(() => {
    if (checked.current) return
    checked.current = true

    const now = new Date()
    const dayOfWeek = now.getDay()
    const today = now.toDateString()

    const lastShown = localStorage.getItem(REMINDER_KEY)

    if (dayOfWeek === 0 && lastShown !== today) {
      localStorage.setItem(REMINDER_KEY, today)

      if ('Notification' in window && Notification.permission === 'granted') {
        // Giờ lễ lấy từ parish settings (server SSOT) — mặc định 08:00.
        const sundayMassTime = useSettingsStore.getState().settings.sundayMassTime || '08:00'
        new Notification('⛪ Thánh Lễ Thiếu Nhi', {
          body: `Hôm nay là Chúa Nhật. Các em nhớ đi Lễ Thiếu Nhi lúc ${formatHourMinute(sundayMassTime)} nhé!`,
          icon: '/pwa-icon.svg',
        })
      }
    }
  }, [])
}
