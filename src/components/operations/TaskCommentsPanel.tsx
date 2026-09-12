import { useEffect, useRef, useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { Button, TextArea, TextInput } from '../common/ui'
import { EmptyState } from '../common/StateFeedback'
import { operationsApi, type OperationTaskDetail } from '../../lib/api/operations'
import { operationsErrorText } from '../../lib/operationsErrors'
import { getTenantScopeKey } from '../../lib/tenantScope'
import { useStableCommandKey } from '../../hooks/useStableCommandKey'

export function TaskCommentsPanel({ detail, enabled, refresh }: { detail: OperationTaskDetail; enabled: boolean; refresh: () => Promise<unknown> }) {
  const [content, setContent] = useState('')
  const [evidenceUrl, setEvidenceUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { stableKey, releaseKey } = useStableCommandKey()
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
      setContent(''); setEvidenceUrl('')
      await refresh()
    } catch (failure) {
      if (current()) setError(operationsErrorText((failure as { code?: string })?.code, failure instanceof Error ? failure.message : 'Không lưu được. Hãy tải lại nhiệm vụ trước khi thử lại.'))
    } finally { pending.current = false; if (current()) setBusy(false) }
  }
  return <section className="mt-4 space-y-3" aria-label="Trao đổi nhiệm vụ">
    {error && <div><p role="alert" className="text-sm text-text-main">{error}</p><Button variant="secondary" size="sm" disabled={!enabled || busy} onClick={() => void run(async () => undefined)}>Tải lại nhiệm vụ</Button></div>}
    <h3 className="m-0 text-sm font-bold text-text-main">Trao đổi</h3>
    {detail.comments.length === 0 && <EmptyState icon={MessageSquare} title="Chưa có bình luận." description="Trao đổi về nhiệm vụ sẽ hiện ở đây." className="py-5" />}
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
      if (content.trim()) {
        const payload = { content: content.trim(), ...(evidence ? { evidenceUrl: evidence } : {}) }
        const key = stableKey('task-comment', { id: detail.task.id, ...payload })
        void run(async () => {
          const result = await operationsApi.commentTask(detail.task.id, payload, key)
          releaseKey('task-comment')
          return result
        })
      }
    }}>
      <TextArea aria-label="Bình luận nhiệm vụ" value={content} maxLength={5000} required onChange={event => setContent(event.target.value)} />
      <TextInput aria-label="Liên kết minh chứng" type="url" value={evidenceUrl} maxLength={2000} placeholder="https://… (không bắt buộc)" onChange={event => setEvidenceUrl(event.target.value)} />
      <p className="text-xs text-text-muted">Chỉ chia sẻ minh chứng phù hợp với người được xem nhiệm vụ; tránh thông tin cá nhân không cần thiết.</p>
      <Button type="submit" size="sm" disabled={!enabled || busy || !content.trim()}>Gửi bình luận</Button>
    </form>}
  </section>
}
