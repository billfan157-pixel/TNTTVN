import { useEffect, useId } from 'react'
import { useFocusTrap } from './useFocusTrap'
import { isTopModal, popModal, pushModal } from '../lib/modalStack'

let bodyLockCount = 0
let previousOverflow = ''
let previousPaddingRight = ''

function lockBodyScroll() {
  if (bodyLockCount === 0) {
    previousOverflow = document.body.style.overflow
    previousPaddingRight = document.body.style.paddingRight
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    document.body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`
  }
  bodyLockCount += 1
}

function unlockBodyScroll() {
  bodyLockCount = Math.max(0, bodyLockCount - 1)
  if (bodyLockCount === 0) {
    document.body.style.overflow = previousOverflow
    document.body.style.paddingRight = previousPaddingRight
  }
}

/**
 * Shared lifecycle for custom dialogs: focus trap/restore, scroll lock and
 * top-most Escape arbitration. Dialog markup still owns role/aria-labelledby.
 */
export function useAccessibleDialog(isOpen: boolean, onClose: () => void) {
  const dialogRef = useFocusTrap(isOpen)
  const titleId = useId()
  const instanceId = useId()

  useEffect(() => {
    if (!isOpen) return

    pushModal(instanceId)
    lockBodyScroll()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isTopModal(instanceId)) onClose()
    }
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      popModal(instanceId)
      unlockBodyScroll()
    }
  }, [instanceId, isOpen, onClose])

  return { dialogRef, titleId }
}
