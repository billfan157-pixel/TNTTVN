import { AlertTriangle, Check, CheckCircle2, Play, XCircle } from 'lucide-react'
import { Badge, Button, TextArea } from '../common/ui'
import type { OperationEventDetail } from '../../lib/api/operations'
import { statusLabel, nextEventStatus, previousEventStatus } from './operationsViewHelpers'
import { EVENT_STEPS, type EventTransitionFlow } from '../../hooks/useOperationsEventTransitionFlow'

/**
 * W3.2 extraction: the event lifecycle hub (stepper, readiness bar + blockers,
 * closure gate, automation-paused notice and the cancel/rewind prompts) that
 * previously lived inline in OperationsPage. Everything it renders is derived
 * from `detail` plus the transition-flow state it receives; the flow handlers
 * stay in the hook so OCC/idempotency semantics are unchanged. Pure values
 * (current step index, closure lists) are recomputed here from `detail` rather
 * than threaded through props, so there is a single source of truth.
 */
export function EventLifecycleHub({
  detail,
  flow,
  canMutate,
  onShowTasksTab,
}: {
  detail: OperationEventDetail
  flow: EventTransitionFlow
  canMutate: boolean
  onShowTasksTab: () => void
}) {
  const {
    eventReason, setEventReason,
    showCancelPrompt, setShowCancelPrompt,
    showRewindPrompt, setShowRewindPrompt,
    showRestorePrompt, setShowRestorePrompt,
    restoreReason, setRestoreReason,
    outcomeSummary, setOutcomeSummary,
    transitioningEvent,
    handleEventTransition,
    handleResumeAutomation,
    handleEventRestore,
  } = flow

  const currentStepIndex = detail.event.status === 'CANCELLED' ? -1 : EVENT_STEPS.findIndex(step => step.status === detail.event.status)
  const closureTasks = detail.tasks.filter(task => task.isRequired && task.status !== 'DONE')
  const closureBlockers = detail.closure?.blockers
    ?? detail.tasks.filter(task => task.isRequired && task.status !== 'DONE').map(task => ({ type: 'TASK_INCOMPLETE', id: task.id, label: task.title }))
    ?? []

  return (
    <div className="rounded-2xl border border-surface-border bg-surface-ground/40 p-4 sm:p-5 space-y-4 shadow-xs" aria-label="Vòng đời sự kiện">
      {/* Trạng thái bị hủy / Lưu trữ */}
      {detail.event.status === 'CANCELLED' ? (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-parish-danger/30 bg-parish-danger-bg/20 p-3.5 text-text-main">
            <div className="flex items-start gap-3">
              <XCircle className="h-5 w-5 text-parish-danger shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="m-0 text-sm font-bold text-parish-danger">Sự kiện đã bị hủy &amp; chuyển vào Lưu trữ</p>
                <p className="mb-0 mt-1 text-xs text-text-muted">Lịch sử sự kiện và nhật ký được bảo lưu. Bạn có thể khôi phục sự kiện về giai đoạn Kế hoạch.</p>
              </div>
            </div>
            {detail.permissions['operations.event.transition'] && !showRestorePrompt && (
              <Button
                variant="primary"
                size="sm"
                className="shrink-0 self-start sm:self-center"
                disabled={!canMutate}
                onClick={() => setShowRestorePrompt(true)}
              >
                Khôi phục sự kiện
              </Button>
            )}
          </div>

          {showRestorePrompt && detail.permissions['operations.event.transition'] && (
            <div className="rounded-xl border border-parish-warning/30 bg-parish-warning-bg/20 p-3 sm:p-4 space-y-2.5">
              <label className="block text-sm font-semibold text-text-main">
                Lý do khôi phục sự kiện (bắt buộc)
                <TextArea
                  className="mt-1 min-h-20 w-full"
                  value={restoreReason}
                  maxLength={1000}
                  placeholder="Nhập lý do khôi phục sự kiện về Kế hoạch..."
                  onChange={event => setRestoreReason(event.target.value)}
                  autoFocus
                />
              </label>
              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setShowRestorePrompt(false)
                    setRestoreReason('')
                  }}
                >
                  Không khôi phục nữa
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  loading={transitioningEvent}
                  disabled={!canMutate || !restoreReason.trim()}
                  onClick={() => void handleEventRestore()}
                >
                  Xác nhận khôi phục
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Visual Lifecycle Stepper */
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Giai đoạn sự kiện</span>
            <span className="text-xs font-semibold text-text-muted">
              Trạng thái hiện tại: <span className="font-bold text-text-main">{statusLabel[detail.event.status] || detail.event.status}</span>
            </span>
          </div>

          <div className="relative flex items-center justify-between px-2 sm:px-6 py-2">
            {/* Background Connecting Track */}
            <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-1 bg-surface-border -z-0 rounded-full" />
            {/* Active Progress Connecting Track */}
            <div
              className="absolute left-6 top-1/2 -translate-y-1/2 h-1 bg-parish-primary transition-[width] duration-300 -z-0 rounded-full"
              style={{
                width: currentStepIndex > 0 ? `${(currentStepIndex / (EVENT_STEPS.length - 1)) * 100}%` : '0%',
                maxWidth: 'calc(100% - 48px)',
              }}
            />

            {EVENT_STEPS.map((step, index) => {
              const isPast = currentStepIndex > index
              const isCurrent = currentStepIndex === index

              return (
                <div key={step.status} className="relative z-10 flex flex-col items-center gap-1">
                  <div
                    className={`flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full text-xs font-bold transition-colors duration-150 ${
                      isPast
                        ? 'bg-parish-success text-text-inverse shadow-xs'
                        : isCurrent
                          ? 'bg-parish-primary text-text-inverse ring-4 ring-parish-primary/25 shadow-sm'
                          : 'border-2 border-surface-border bg-surface-card text-text-muted'
                    }`}
                  >
                    {isPast ? <Check className="h-3.5 w-3.5 stroke-[3]" /> : index + 1}
                  </div>
                  {/* W3.6 (MB-02): six nowrap labels overflow 320–390px
                      sheets (~340px+ of text). Below sm each label wraps
                      to two short lines inside a capped column; sm+
                      keeps the original single-line presentation. */}
                  <span
                    className={`w-11 text-center text-xs leading-tight sm:w-auto sm:text-xs sm:leading-normal sm:whitespace-nowrap ${
                      isCurrent
                        ? 'font-extrabold text-parish-primary'
                        : isPast
                          ? 'font-semibold text-text-main'
                          : 'text-text-muted'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Thanh Tiến Độ Sẵn Sàng (Readiness Bar) */}
      <div className="space-y-1.5 pt-1">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-text-main flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-parish-primary" />
            Tiến độ chuẩn bị sự kiện
          </span>
          <span className={`font-bold ${detail.readiness.percent === 100 ? 'text-parish-success' : detail.readiness.percent >= 50 ? 'text-parish-primary' : 'text-parish-warning'}`}>
            {detail.readiness.percent}%
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-surface-border/70 overflow-hidden">
          <div
            className={`h-full rounded-full transition-[width] duration-300 ${detail.readiness.percent === 100 ? 'bg-parish-success' : detail.readiness.percent >= 50 ? 'bg-parish-primary' : 'bg-parish-warning'}`}
            style={{ width: `${Math.min(100, Math.max(0, detail.readiness.percent))}%` }}
          />
        </div>
      </div>

      {/* Điểm chặn Readiness Blockers */}
      {detail.readiness.blockers.length > 0 && (
        <div className="rounded-xl border border-parish-warning/30 bg-parish-warning-bg/40 p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-parish-warning">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Điểm chặn cần giải quyết trước khi chuyển trạng thái ({detail.readiness.blockers.length}):</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {detail.readiness.blockers.map(blocker => (
              <div key={`${blocker.type}:${blocker.id}`} className="rounded-lg border border-surface-border/80 bg-surface-card px-3 py-2 text-xs text-text-main flex items-center justify-between gap-2 shadow-xs">
                <span className="font-semibold">{blocker.label}</span>
                <Badge tone="neutral" className="text-xs uppercase font-bold shrink-0">{blocker.type}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {(nextEventStatus[detail.event.status] === 'READY' || nextEventStatus[detail.event.status] === 'LIVE') && detail.readiness.blockers.length > 0 && (
        <p className="mb-0 text-xs font-semibold text-parish-warning">
          {detail.permissions['operations.event.override_readiness']
            ? 'Còn điểm chặn readiness — bấm chuyển giai đoạn để nhập lý do Ghi đè (override).'
            : 'Cần xử lý hết điểm chặn readiness trước khi chuyển trạng thái.'}
        </p>
      )}

      {nextEventStatus[detail.event.status] === 'COMPLETED' && (
        <div className={`rounded-xl border p-3 space-y-2 ${closureBlockers.length > 0 || !outcomeSummary.trim() ? 'border-parish-warning/30 bg-parish-warning-bg/40' : 'border-parish-success/30 bg-parish-success-bg/40'}`}>
          <p className="m-0 text-xs font-bold text-text-main">Điều kiện đóng sự kiện</p>
          {!outcomeSummary.trim() && <p className="m-0 text-xs text-parish-warning">Chưa nhập tổng kết kết quả.</p>}
          {closureBlockers.map(blocker => (
            <button
              key={`${blocker.type}:${blocker.id}`}
              type="button"
              className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-surface-border bg-surface-card px-3 py-2 text-left text-xs text-text-main"
              onClick={onShowTasksTab}
            >
              <span className="font-semibold">{blocker.label}</span>
              <Badge tone="neutral" className="shrink-0 text-xs uppercase font-bold">{blocker.type}</Badge>
            </button>
          ))}
          {outcomeSummary.trim() && closureBlockers.length === 0 && <p className="m-0 text-xs font-semibold text-parish-success">Đã đủ điều kiện đóng sự kiện.</p>}
        </div>
      )}

      {detail.event.automationPaused && (
        <div role="status" className="rounded-xl border border-parish-warning/30 bg-parish-warning-bg/40 p-3 text-sm text-text-main">
          <p className="m-0 font-bold">Tự động chuyển giai đoạn đang tạm dừng</p>
          <p className="mb-0 mt-1 text-xs">{detail.event.automationPauseReason || 'Sự kiện đã được lùi giai đoạn thủ công.'}</p>
          {detail.permissions['operations.event.transition'] && (
            <Button className="mt-2" size="sm" variant="secondary" loading={transitioningEvent} disabled={!canMutate} leadingIcon={<Play className="h-4 w-4" />} onClick={() => void handleResumeAutomation()}>
              Tiếp tục tự động chuyển
            </Button>
          )}
        </div>
      )}

      {/* Status & Readiness summary line */}
      {detail.event.status !== 'CANCELLED' && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-surface-border/80 text-xs text-text-muted">
          <span>Trạng thái hiện tại: <span className="font-semibold text-text-main">{statusLabel[detail.event.status] || detail.event.status}</span></span>
          <span>Tiến độ chuẩn bị: <span className="font-semibold text-parish-primary">{detail.readiness.percent}%</span></span>
        </div>
      )}

      {/* Hộp xác nhận hủy sự kiện */}
      {showCancelPrompt
        && (detail.event.status === 'DRAFT' || detail.event.status === 'PLANNING' || detail.event.status === 'PREPARING' || detail.event.status === 'READY')
        && detail.permissions['operations.event.cancel']
        && (detail.event.visibility !== 'PUBLIC_SUMMARY' || detail.permissions['operations.event.publish_public']) && (
        <div className="rounded-xl border border-parish-danger/30 bg-parish-danger-bg/20 p-3 sm:p-4 space-y-2.5">
          <label className="block text-sm font-semibold text-text-main">
            Lý do hủy sự kiện (bắt buộc)
            <TextArea
              className="mt-1 min-h-20 w-full"
              value={eventReason}
              maxLength={1000}
              placeholder="Nhập lý do hủy sự kiện..."
              onChange={event => setEventReason(event.target.value)}
              autoFocus
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setShowCancelPrompt(false)
                setEventReason('')
              }}
            >
              Không hủy nữa
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={transitioningEvent}
              disabled={!canMutate || !eventReason.trim()}
              onClick={() => void handleEventTransition('CANCELLED')}
            >
              Xác nhận hủy sự kiện
            </Button>
          </div>
        </div>
      )}

      {showRewindPrompt && previousEventStatus[detail.event.status] && detail.permissions['operations.event.transition'] && (
        <div className="rounded-xl border border-parish-warning/30 bg-parish-warning-bg/20 p-3 sm:p-4 space-y-2.5">
          <label className="block text-sm font-semibold text-text-main">
            Lý do lùi về {statusLabel[previousEventStatus[detail.event.status]!]}
            <TextArea className="mt-1 min-h-20 w-full" value={eventReason} maxLength={2000} placeholder="Nêu lý do để lưu vào lịch sử sự kiện..." onChange={event => setEventReason(event.target.value)} autoFocus />
          </label>
          <p className="m-0 text-xs text-text-muted">Task và xác nhận nhận việc được giữ nguyên. Tự động chuyển theo giờ sẽ tạm dừng cho tới khi người quản lý bật lại.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => { setShowRewindPrompt(false); setEventReason('') }}>Không lùi nữa</Button>
            <Button variant="primary" size="sm" loading={transitioningEvent} disabled={!canMutate || !eventReason.trim()} onClick={() => void handleEventTransition(previousEventStatus[detail.event.status]!)}>Xác nhận lùi giai đoạn</Button>
          </div>
        </div>
      )}

      {/* Form tổng kết khi LIVE */}
      {detail.event.status === 'LIVE' && detail.permissions['operations.event.transition'] && (
        <label className="mt-3 block text-sm font-semibold text-text-main">
          Tổng kết kết quả
          <TextArea
            className="mt-1 min-h-24 w-full"
            value={outcomeSummary}
            maxLength={4000}
            required
            placeholder="Bắt buộc trước khi hoàn tất sự kiện"
            onChange={event => setOutcomeSummary(event.target.value)}
          />
        </label>
      )}

      {/* Cảnh báo closure tasks khi LIVE */}
      {detail.event.status === 'LIVE' && closureTasks.length > 0 && (
        <div role="status" className="rounded-lg border border-parish-warning/30 bg-parish-warning-bg p-3 text-sm text-text-main">
          <p className="m-0 font-bold">Chưa thể đóng sự kiện: còn nhiệm vụ bắt buộc chưa hoàn tất.</p>
          <ul className="mb-0 mt-2 list-disc pl-5">
            {closureTasks.map(task => <li key={task.id}>{task.title} · {statusLabel[task.status] || task.status}</li>)}
          </ul>
          <p className="mb-0 mt-2 text-xs">Nhiệm vụ đã hủy không được tính là hoàn tất. Máy chủ kiểm tra lại khi đóng sự kiện.</p>
        </div>
      )}
    </div>
  )
}
