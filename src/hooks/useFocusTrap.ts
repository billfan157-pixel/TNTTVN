import { useEffect, useRef } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useFocusTrap(isActive: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  const previous = useRef<Element | null>(null)

  useEffect(() => {
    if (!isActive) return
    previous.current = document.activeElement

    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !ref.current) return
      const els = ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)
      if (els.length === 0) return
      const first = els[0]
      const last = els[els.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }

    document.addEventListener('keydown', trap)
    ref.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()

    return () => {
      document.removeEventListener('keydown', trap)
      if (previous.current instanceof HTMLElement) previous.current.focus()
    }
  }, [isActive])

  return ref
}
