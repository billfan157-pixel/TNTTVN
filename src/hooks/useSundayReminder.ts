import { useEffect, useRef } from 'react'

const REMINDER_KEY = 'sunday_reminder_last_shown'

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
        new Notification('⛪ Thánh Lễ Thiếu Nhi', {
          body: 'Hôm nay là Chúa Nhật. Các em nhớ đi Lễ Thiếu Nhi lúc 8h00 nhé!',
          icon: '/pwa-icon.svg',
        })
      }
    }
  }, [])
}
