import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from '@tanstack/react-router'

/** Keep an editor mounted until the user explicitly saves, discards, or cancels leaving. */
export function useUnsavedChangesGuard({ isDirty, isSaving, onExit }: {
  isDirty: boolean
  isSaving: boolean
  onExit: () => void
}) {
  const router = useRouter({ warn: false })
  const [isExitRequested, setExitRequested] = useState(false)
  const pendingNavigation = useRef<(() => void) | null>(null)
  const unblockNavigation = useRef<(() => void) | null>(null)

  const resolveNavigation = useCallback((blocked: boolean) => {
    const proceed = pendingNavigation.current
    pendingNavigation.current = null
    if (!blocked && proceed) {
      // Remove only this editor's guard before replaying the confirmed action.
      // Other active navigation guards remain authoritative.
      unblockNavigation.current?.()
      unblockNavigation.current = null
      proceed()
    }
  }, [])

  const cancelExit = useCallback(() => {
    if (isSaving) return
    setExitRequested(false)
    resolveNavigation(true)
  }, [isSaving, resolveNavigation])

  const confirmExit = useCallback(() => {
    setExitRequested(false)
    onExit()
    resolveNavigation(false)
  }, [onExit, resolveNavigation])

  const requestExit = useCallback(() => {
    if (isSaving) return
    if (isDirty) setExitRequested(true)
    else onExit()
  }, [isDirty, isSaving, onExit])

  useEffect(() => {
    if (!isDirty && !isSaving) return
    // Browsers only allow their native stay/leave prompt during unload; saving
    // stays an explicit in-app action and must finish before navigation proceeds.
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [isDirty, isSaving])

  useEffect(() => {
    if (!router || (!isDirty && !isSaving)) return
    const history = router.history
    const unblock = history.block({
      enableBeforeUnload: false,
      blockerFn: ({ action, currentLocation, nextLocation }) => {
        if (isSaving || pendingNavigation.current) return true
        pendingNavigation.current = () => {
          if (action === 'PUSH') history.push(nextLocation.href, nextLocation.state)
          else if (action === 'REPLACE') history.replace(nextLocation.href, nextLocation.state)
          else history.go(nextLocation.state.__TSR_index - currentLocation.state.__TSR_index)
        }
        setExitRequested(true)
        // Roll browser Back back immediately. Waiting on a modal with the URL
        // already popped can reload the route on WebKit and destroy the draft.
        return true
      },
    })
    unblockNavigation.current = unblock
    return () => {
      unblock()
      if (unblockNavigation.current === unblock) unblockNavigation.current = null
    }
  }, [router, isDirty, isSaving])

  useEffect(() => () => resolveNavigation(true), [resolveNavigation])

  return { isExitRequested, requestExit, cancelExit, confirmExit }
}
