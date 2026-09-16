import { useCallback, useEffect, useRef, useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { EmptyState } from '../common/StateFeedback'
import { Button, TextInput } from '../common/ui'
import { operationsApi, type OperationBlockout } from '../../lib/api/operations'
import { getTenantScope } from '../../lib/tenantScope'
import { useStableCommandKey } from '../../hooks/useStableCommandKey'

function localDateTime(iso: string) {
  const value = new Date(iso)
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

// W3.5 (U-16): readable label for one blockout row (self data — there is no
// person display name to use, so the window itself identifies it).
function blockoutRowLabel(row: OperationBlockout) {
  return `${new Date(row.startsAt).toLocaleString('vi-VN')} – ${new Date(row.endsAt).toLocaleString('vi-VN')}`
}

export function AvailabilityPanel({ enabled }: { enabled: boolean }) {
  const [rows, setRows] = useState<OperationBlockout[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [draft, setDraft] = useState({ startsAt: '', endsAt: '', reason: '' })
  const [editing, setEditing] = useState<{ id: string; startsAt: string; endsAt: string; reason: string } | null>(null)
  const alive = useRef(true)
  const inFlight = useRef(false)
  const { stableKey, releaseKey } = useStableCommandKey()
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const load = useCallback(async (preserveMessage = false) => {
    if (!enabled) return
    const scope = getTenantScope()
    if (!scope) return
    try {
      const response = await operationsApi.getMyBlockouts()
      const current = getTenantScope()
      if (!alive.current || current?.parishId !== scope.parishId || current.userId !== scope.userId) return
      if (response.data.some(row => row.parishId !== scope.parishId)) throw new Error('Máy chủ trả lịch bận sai phạm vi giáo xứ.')
      setRows(response.data); setLoaded(true); if (!preserveMessage) setMessage('')
    } catch (failure) {
      const current = getTenantScope()
      if (alive.current && current?.parishId === scope.parishId && current.userId === scope.userId) {
        setRows([]); setLoaded(false); setMessage(failure instanceof Error ? failure.message : 'Không tải được lịch bận.')
      }
    }
  }, [enabled])
  useEffect(() => { void load() }, [load])

  const mutate = async (action: () => Promise<unknown>, success: string) => {
    const scope = getTenantScope()
    if (!enabled || !scope || inFlight.current) return false
    inFlight.current = true; setBusy(true); setMessage('')
    const sameSession = () => { const current = getTenantScope(); return alive.current && current?.parishId === scope.parishId && current.userId === scope.userId }
    try {
      await action()
      if (!sameSession()) return false
      setMessage(success); setEditing(null)
      await load(true)
      return true
    } catch (failure) {
      if (sameSession()) setMessage(failure instanceof Error ? failure.message : 'Không cập nhật được lịch bận.')
      return false
    } finally { inFlight.current = false; if (sameSession()) setBusy(false) }
  }

  const validWindow = (startsAt: string, endsAt: string) => Boolean(startsAt && endsAt && new Date(endsAt).getTime() > new Date(startsAt).getTime())
  return <section className="space-y-3 rounded-xl border border-surface-border p-4" aria-label="Lịch bận của tôi">
    <div><h2 className="m-0 text-sm font-extrabold text-text-main">Lịch bận của tôi</h2><p className="mb-0 mt-1 text-xs text-text-muted">Lý do chỉ hiển thị cho bạn. Người giao việc chỉ nhận cảnh báo khoảng thời gian.</p></div>
    <form className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end" onSubmit={event => {
      event.preventDefault()
      const scope = getTenantScope()
      if (!scope || !validWindow(draft.startsAt, draft.endsAt)) return
      const payload = { userId: scope.userId, startsAt: new Date(draft.startsAt).toISOString(), endsAt: new Date(draft.endsAt).toISOString(), reason: draft.reason.trim() || null }
      const key = stableKey('blockout-create', payload)
      void mutate(async () => {
        const result = await operationsApi.createBlockout(payload, key)
        releaseKey('blockout-create')
        return result
      }, 'Đã lưu lịch bận.').then(saved => {
        if (saved && alive.current) setDraft({ startsAt: '', endsAt: '', reason: '' })
      })
    }}>
      <TextInput aria-label="Bận từ" type="datetime-local" value={draft.startsAt} disabled={!enabled || busy} required onChange={event => setDraft(value => ({ ...value, startsAt: event.target.value }))} />
      <TextInput aria-label="Bận đến" type="datetime-local" value={draft.endsAt} disabled={!enabled || busy} required onChange={event => setDraft(value => ({ ...value, endsAt: event.target.value }))} />
      <TextInput aria-label="Lý do bận riêng tư" value={draft.reason} maxLength={500} disabled={!enabled || busy} placeholder="Lý do (không bắt buộc)" onChange={event => setDraft(value => ({ ...value, reason: event.target.value }))} />
      <Button type="submit" size="sm" disabled={!enabled || busy || !validWindow(draft.startsAt, draft.endsAt)}>Báo bận</Button>
    </form>
    {loaded && rows.length === 0 && <EmptyState icon={CalendarClock} title="Bạn chưa có lịch bận." description="Thêm khoảng thời gian để người giao việc nhận cảnh báo phù hợp." className="py-5" />}
    <div className="divide-y divide-surface-border">
      {rows.map(row => <div key={row.id} data-blockout-id={row.id} className="py-3 text-sm text-text-main">
        <div className="flex flex-wrap items-center justify-between gap-2"><span>{new Date(row.startsAt).toLocaleString('vi-VN')} – {new Date(row.endsAt).toLocaleString('vi-VN')}{row.reason ? ` · ${row.reason}` : ''}</span><div className="flex gap-2"><Button variant="secondary" size="sm" disabled={!enabled || busy} onClick={() => setEditing({ id: row.id, startsAt: localDateTime(row.startsAt), endsAt: localDateTime(row.endsAt), reason: row.reason ?? '' })}>Sửa</Button><Button variant="danger" size="sm" disabled={!enabled || busy} onClick={() => {
          const key = stableKey(`blockout-revoke:${row.id}`, { id: row.id, version: row.version })
          return void mutate(async () => {
            const result = await operationsApi.revokeBlockout(row.id, row.version, key)
            releaseKey(`blockout-revoke:${row.id}`)
            return result
          }, 'Đã thu hồi lịch bận.')
        }}>Thu hồi</Button></div></div>
        {editing?.id === row.id && <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          {/* W3.5 (U-16): the blockout's own window labels the editor instead of
              the raw row id — screen readers no longer spell UUIDs. */}
          <TextInput aria-label={`Sửa bận từ của khoảng ${blockoutRowLabel(row)}`} type="datetime-local" value={editing.startsAt} disabled={busy} onChange={event => setEditing(value => value ? { ...value, startsAt: event.target.value } : value)} />
          <TextInput aria-label={`Sửa bận đến của khoảng ${blockoutRowLabel(row)}`} type="datetime-local" value={editing.endsAt} disabled={busy} onChange={event => setEditing(value => value ? { ...value, endsAt: event.target.value } : value)} />
          <TextInput aria-label={`Sửa lý do của khoảng ${blockoutRowLabel(row)}`} value={editing.reason} maxLength={500} disabled={busy} onChange={event => setEditing(value => value ? { ...value, reason: event.target.value } : value)} />
          <Button size="sm" disabled={busy || !validWindow(editing.startsAt, editing.endsAt)} onClick={() => {
            const payload = { version: row.version, startsAt: new Date(editing.startsAt).toISOString(), endsAt: new Date(editing.endsAt).toISOString(), reason: editing.reason.trim() || null }
            const key = stableKey(`blockout-update:${row.id}`, { id: row.id, ...payload })
            return void mutate(async () => {
              const result = await operationsApi.updateBlockout(row.id, payload, key)
              releaseKey(`blockout-update:${row.id}`)
              return result
            }, 'Đã cập nhật lịch bận.')
          }}>Lưu</Button>
        </div>}
      </div>)}
    </div>
    {message && <p role="status" className="text-sm text-text-main">{message}</p>}
  </section>
}
