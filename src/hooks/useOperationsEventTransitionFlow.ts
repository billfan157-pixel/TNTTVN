import { useState } from 'react'
import type { OperationEvent, OperationEventDetail } from '../lib/api/operations'
import { operationsErrorText } from '../lib/operationsErrors'
import { useOperationsStore } from '../stores/operationsStore'
import { useToastStore } from '../stores/toastStore'
import { useStableCommandKey } from './useStableCommandKey'

/** Phase order for the event lifecycle stepper and the adjacency check below. */
export const EVENT_STEPS: Array<{ status: OperationEvent['status']; label: string }> = [
  { status: 'DRAFT', label: 'Bản nháp' },
  { status: 'PLANNING', label: 'Kế hoạch' },
  { status: 'PREPARING', label: 'Chuẩn bị' },
  { status: 'READY', label: 'Sẵn sàng' },
  { status: 'LIVE', label: 'Diễn ra' },
  { status: 'COMPLETED', label: 'Hoàn tất' },
]

/**
 * W3.2 extraction (behavior-preserving): the event transition/cancel/rewind
 * flow with its structured-error dialogs (acceptance warning, readiness
 * override, completion blockers) and the automation-resume command.
 * State names are identical to the ones the page previously owned locally, so
 * the JSX contracts (and the page's tests) are untouched. The server remains
 * authoritative for adjacency, reasons, override and closure gates — this
 * hook only routes each error code to its dialog.
 */
export function useEventTransitionFlow(input: {
  selectedEvent: OperationEventDetail | null
  canMutate: boolean
}) {
  const { selectedEvent, canMutate } = input
  const transitionEvent = useOperationsStore(s => s.transitionEvent)
  const resumeEventAutomation = useOperationsStore(s => s.resumeEventAutomation)
  const restoreEvent = useOperationsStore(s => s.restoreEvent)
  const selectEvent = useOperationsStore(s => s.selectEvent)
  const { stableKey: stableCommandKey, releaseKey: releaseCommandKey } = useStableCommandKey()

  const [eventReason, setEventReason] = useState('')
  const [showCancelPrompt, setShowCancelPrompt] = useState(false)
  const [showRewindPrompt, setShowRewindPrompt] = useState(false)
  const [showRestorePrompt, setShowRestorePrompt] = useState(false)
  const [restoreReason, setRestoreReason] = useState('')
  const [acceptanceWarning, setAcceptanceWarning] = useState<Array<{ id: string; label: string }> | null>(null)
  const [outcomeSummary, setOutcomeSummary] = useState('')
  const [transitioningEvent, setTransitioningEvent] = useState(false)
  const [readinessBlockers, setReadinessBlockers] = useState<Array<{ id?: string; label?: string; code?: string }> | null>(null)
  const [completionBlockers, setCompletionBlockers] = useState<Array<{ type?: string; id?: string; label?: string }> | null>(null)
  const [pendingTargetStatus, setPendingTargetStatus] = useState<OperationEvent['status'] | null>(null)
  const [overrideReason, setOverrideReason] = useState('')

  const handleEventTransition = async (status: OperationEvent['status'], override = false, customReason?: string) => {
    if (!selectedEvent || selectedEvent.event.status === 'CANCELLED' || !canMutate || transitioningEvent) return
    const currentIndex = EVENT_STEPS.findIndex(step => step.status === selectedEvent.event.status)
    const targetIndex = EVENT_STEPS.findIndex(step => step.status === status)
    const backwards = currentIndex >= 0 && targetIndex >= 0 && targetIndex < currentIndex
    const requiresReason = status === 'CANCELLED' || backwards
    const requiresOutcome = status === 'COMPLETED'
    const finalReason = (customReason || eventReason).trim()
    if ((requiresReason && !finalReason) || (requiresOutcome && !outcomeSummary.trim())) return
    setTransitioningEvent(true)
    try {
      const payload = {
        reason: finalReason || undefined,
        outcomeSummary: outcomeSummary.trim() || undefined,
        ...(override ? { override: true } : {}),
      }
      const key = stableCommandKey(`event-transition:${selectedEvent.event.id}`, { id: selectedEvent.event.id, version: selectedEvent.event.version, status, ...payload })
      await transitionEvent(selectedEvent.event.id, status, selectedEvent.event.version, {
        ...payload,
      }, key)
      releaseCommandKey(`event-transition:${selectedEvent.event.id}`)
      setEventReason('')
      setShowCancelPrompt(false)
      setShowRewindPrompt(false)
      setAcceptanceWarning(null)
      setReadinessBlockers(null)
      setCompletionBlockers(null)
      setPendingTargetStatus(null)
      setOverrideReason('')
      setOutcomeSummary('')
      await selectEvent(selectedEvent.event.id)
    } catch (error: any) {
      const errCode = error?.code
      if (errCode === 'TASK_ACCEPTANCE_PENDING') {
        const details = error?.details
        setAcceptanceWarning(Array.isArray(details) ? details : [])
      } else if (errCode === 'READINESS_BLOCKED') {
        const details = error?.details
        setReadinessBlockers(Array.isArray(details) ? details : [])
        setPendingTargetStatus(status)
      } else if (errCode === 'COMPLETION_BLOCKED') {
        const details = error?.details
        setCompletionBlockers(Array.isArray(details) ? details : [])
      } else {
        useToastStore.getState().addToast(operationsErrorText(errCode, error?.message || 'Không thể chuyển giai đoạn sự kiện'), 'error')
      }
    } finally { setTransitioningEvent(false) }
  }

  const handleResumeAutomation = async () => {
    if (!selectedEvent?.event.automationPaused || !canMutate) return
    setTransitioningEvent(true)
    try {
      const reason = 'Người quản lý chủ động tiếp tục tự động chuyển giai đoạn.'
      const key = stableCommandKey(`event-resume:${selectedEvent.event.id}`, { id: selectedEvent.event.id, version: selectedEvent.event.version, reason })
      await resumeEventAutomation(selectedEvent.event.id, selectedEvent.event.version, reason, key)
      releaseCommandKey(`event-resume:${selectedEvent.event.id}`)
      await selectEvent(selectedEvent.event.id)
    } catch (error: any) {
      useToastStore.getState().addToast(operationsErrorText(error?.code, error?.message || 'Không thể tiếp tục tự động chuyển giai đoạn'), 'error')
    } finally { setTransitioningEvent(false) }
  }

  const handleEventRestore = async () => {
    if (!selectedEvent || selectedEvent.event.status !== 'CANCELLED' || !canMutate || transitioningEvent) return
    const finalReason = restoreReason.trim()
    if (!finalReason) return
    setTransitioningEvent(true)
    try {
      const key = stableCommandKey(`event-restore:${selectedEvent.event.id}`, { id: selectedEvent.event.id, version: selectedEvent.event.version, reason: finalReason })
      await restoreEvent(selectedEvent.event.id, selectedEvent.event.version, finalReason, key)
      releaseCommandKey(`event-restore:${selectedEvent.event.id}`)
      useToastStore.getState().addToast('Đã khôi phục sự kiện về Kế hoạch.', 'success')
      setShowRestorePrompt(false)
      setRestoreReason('')
      await selectEvent(selectedEvent.event.id)
    } catch (error: any) {
      useToastStore.getState().addToast(operationsErrorText(error?.code, error?.message || 'Không thể khôi phục sự kiện'), 'error')
    } finally { setTransitioningEvent(false) }
  }

  return {
    eventReason, setEventReason,
    showCancelPrompt, setShowCancelPrompt,
    showRewindPrompt, setShowRewindPrompt,
    showRestorePrompt, setShowRestorePrompt,
    restoreReason, setRestoreReason,
    acceptanceWarning, setAcceptanceWarning,
    outcomeSummary, setOutcomeSummary,
    transitioningEvent,
    readinessBlockers, setReadinessBlockers,
    completionBlockers, setCompletionBlockers,
    pendingTargetStatus, setPendingTargetStatus,
    overrideReason, setOverrideReason,
    handleEventTransition,
    handleResumeAutomation,
    handleEventRestore,
  }
}

export type EventTransitionFlow = ReturnType<typeof useEventTransitionFlow>
