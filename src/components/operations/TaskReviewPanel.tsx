import { useEffect, useRef, useState } from 'react'
import { Button, TextArea, TextInput } from '../common/ui'
import { operationsApi, type OperationTaskDetail } from '../../lib/api/operations'
import { getTenantScopeKey } from '../../lib/tenantScope'

export function TaskReviewPanel({ detail, enabled, refresh }: { detail: OperationTaskDetail; enabled: boolean; refresh: () => Promise<unknown> }) {
  const [content, setContent] = useState('')
  const [evidenceUrl, setEvidenceUrl] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const active = useRef(true)
  const pending = useRef(false)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const run = async (action: () => Promise<unknown>) => {
    if (!enabled || pending.current) return
    const scope = getTenantScopeKey()
    if (!scope) return
    pending.current = true; setBusy(true); setError('')
    const current = () => active.current && scope === getTenantScopeKey()
    try {
      await action()
      if (!current()) return
      setContent(''); setReason(''); setEvidenceUrl('')
      await refresh()
    } catch (failure) {
      if (current()) setError(failure instanceof Error ? failure.message : 'Không lưu được. Hãy tải lại nhiệm vụ trước khi thử lại.')
    } finally { pending.current = false; if (current()) setBusy(false) }
  }
  const canApprove = detail.permissions['operations.task.approve'] && detail.task.approvalStatus !== 'NOT_REQUIRED' && !['DONE', 'CANCELLED'].includes(detail.task.status)
  return <section className="mt-4 space-y-3" aria-label="Duyệt và trao đổi nhiệm vụ">
    {error && <div><p role="alert" className="text-sm text-text-main">{error}</p><Button variant="secondary" size="sm" disabled={!enabled || busy} onClick={() => void run(async () => undefined)}>Tải lại nhiệm vụ</Button></div>}
    {canApprove && <div className="space-y-2">
      <TextArea aria-label="Lý do quyết định duyệt" value={reason} maxLength={2000} placeholder="Lý do (bắt buộc khi yêu cầu chỉnh sửa)" onChange={event => setReason(event.target.value)} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!enabled || busy} onClick={() => void run(() => operationsApi.approveTask(detail.task.id, { version: detail.task.version, decision: 'APPROVED', reason: reason.trim() || undefined }))}>Duyệt nhiệm vụ</Button>
        <Button variant="secondary" size="sm" disabled={!enabled || busy || !reason.trim()} onClick={() => void run(() => operationsApi.approveTask(detail.task.id, { version: detail.task.version, decision: 'REJECTED', reason: reason.trim() }))}>Yêu cầu chỉnh sửa</Button>
      </div>
    </div>}
    <h3 className="m-0 text-sm font-bold text-text-main">Trao đổi</h3>
    {detail.comments.length === 0 && <p className="text-sm text-text-muted">Chưa có bình luận.</p>}
    {detail.comments.map(comment => <article key={comment.id} className="rounded-lg border border-surface-border p-3">
      <p className="m-0 whitespace-pre-wrap text-sm text-text-main">{comment.content}</p>
      <time className="text-xs text-text-muted" dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString('vi-VN')}</time>
      {comment.evidenceUrl?.startsWith('https://') && <a className="ml-2 text-sm text-parish-primary" href={comment.evidenceUrl} target="_blank" rel="noopener noreferrer">Xem minh chứng</a>}
    </article>)}
    {detail.permissions['operations.task.comment'] && <form className="space-y-2" onSubmit={event => {
      event.preventDefault()
      const evidence = evidenceUrl.trim()
      if (evidence) {
        try { if (new URL(evidence).protocol !== 'https:') throw new Error('HTTPS required') }
        catch { setError('Liên kết minh chứng phải là địa chỉ HTTPS hợp lệ.'); return }
      }
      if (content.trim()) void run(() => operationsApi.commentTask(detail.task.id, { content: content.trim(), ...(evidence ? { evidenceUrl: evidence } : {}) }))
    }}>
      <TextArea aria-label="Bình luận nhiệm vụ" value={content} maxLength={5000} required onChange={event => setContent(event.target.value)} />
      <TextInput aria-label="Liên kết minh chứng" type="url" value={evidenceUrl} maxLength={2000} placeholder="https://… (không bắt buộc)" onChange={event => setEvidenceUrl(event.target.value)} />
      <p className="text-xs text-text-muted">Chỉ chia sẻ minh chứng phù hợp với người được xem nhiệm vụ; tránh thông tin cá nhân không cần thiết.</p>
      <Button type="submit" size="sm" disabled={!enabled || busy || !content.trim()}>Gửi bình luận</Button>
    </form>}
  </section>
}
