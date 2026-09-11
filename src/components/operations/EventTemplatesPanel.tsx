import { useCallback, useEffect, useRef, useState } from 'react'
import { CalendarPlus, CopyCheck, LayoutTemplate } from 'lucide-react'
import { EmptyState } from '../common/StateFeedback'
import { Badge, Button, Select, TextArea, TextInput } from '../common/ui'
import { operationsApi, type OperationEventDetail, type OperationEventTemplate, type OperationEventTemplatePreview } from '../../lib/api/operations'
import { newIdempotencyKey } from '../../lib/api/core'
import { getTenantScope, getTenantScopeKey } from '../../lib/tenantScope'

type StableCommandKey = { fingerprint: string; key: string }

function keyForPayload(ref: { current: StableCommandKey | null }, payload: unknown) {
  const fingerprint = JSON.stringify(payload)
  if (ref.current?.fingerprint !== fingerprint) ref.current = { fingerprint, key: newIdempotencyKey() }
  return ref.current.key
}

export function EventTemplatesPanel({
  enabled,
  sourceEvent,
  onEventCreated,
  mode = sourceEvent ? 'source' : 'catalog',
  canPublishPublic = false,
  refreshToken = 0,
  onTemplatesChanged,
}: {
  enabled: boolean
  sourceEvent: OperationEventDetail | null
  onEventCreated: (eventId: string) => Promise<unknown> | unknown
  mode?: 'catalog' | 'source'
  canPublishPublic?: boolean
  refreshToken?: number
  onTemplatesChanged?: () => void
}) {
  const [templates, setTemplates] = useState<OperationEventTemplate[]>([])
  const [archivedTemplates, setArchivedTemplates] = useState<OperationEventTemplate[]>([])
  const [templateId, setTemplateId] = useState('')
  const [archivedTemplateId, setArchivedTemplateId] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [publicSummary, setPublicSummary] = useState(false)
  const [preview, setPreview] = useState<OperationEventTemplatePreview | null>(null)
  const [templateName, setTemplateName] = useState('')
  const [templateDescription, setTemplateDescription] = useState('')
  const [versionReason, setVersionReason] = useState('')
  const [archiveReason, setArchiveReason] = useState('')
  const [restoreReason, setRestoreReason] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [projectionScopeKey, setProjectionScopeKey] = useState<string | null>(null)
  const generation = useRef(0)
  const inFlight = useRef(false)
  const snapshotCommand = useRef<StableCommandKey | null>(null)
  const versionCommand = useRef<StableCommandKey | null>(null)
  const instantiateCommand = useRef<StableCommandKey | null>(null)
  const archiveCommand = useRef<StableCommandKey | null>(null)
  const restoreCommand = useRef<StableCommandKey | null>(null)
  const scopeKey = getTenantScopeKey()
  const projectionIsCurrent = Boolean(enabled && scopeKey && projectionScopeKey === scopeKey)
  const visibleTemplates = projectionIsCurrent ? templates : []
  const visibleArchivedTemplates = projectionIsCurrent ? archivedTemplates : []
  const selectedTemplate = visibleTemplates.find(template => template.id === templateId) ?? null
  const selectedArchivedTemplate = visibleArchivedTemplates.find(template => template.id === archivedTemplateId) ?? null
  const canSnapshotSource = Boolean(sourceEvent?.permissions['operations.event.create'])
  const sourceMatchesTemplate = Boolean(sourceEvent && selectedTemplate && sourceEvent.event.scopeUnitId === selectedTemplate.scopeUnitId)

  const loadTemplates = useCallback(async () => {
    void refreshToken
    const scope = getTenantScopeKey(); const parishId = getTenantScope()?.parishId
    if (!enabled || !scope || !parishId) return
    const token = generation.current
    try {
      const [page, archivedPage] = await Promise.all([
        operationsApi.getEventTemplates(),
        mode === 'source' ? operationsApi.getEventTemplates(1, 100, true) : Promise.resolve(null),
      ])
      if (token !== generation.current || scope !== getTenantScopeKey()) return
      if (page.data.some(template => template.parishId !== parishId || !template.isActive)) throw new Error('Máy chủ trả mẫu sự kiện sai phạm vi hoặc trạng thái.')
      if (archivedPage?.data.some(template => template.parishId !== parishId || template.isActive)) throw new Error('Máy chủ trả mẫu lưu trữ sai phạm vi hoặc trạng thái.')
      setTemplates(page.data)
      setArchivedTemplates(archivedPage?.data ?? [])
      setProjectionScopeKey(scope)
      setTemplateId(current => page.data.some(template => template.id === current) ? current : page.data[0]?.id ?? '')
      setArchivedTemplateId(current => archivedPage?.data.some(template => template.id === current) ? current : archivedPage?.data[0]?.id ?? '')
    } catch (error) {
      if (token === generation.current && scope === getTenantScopeKey()) {
        setProjectionScopeKey(null)
        setTemplates([])
        setArchivedTemplates([])
        setTemplateId('')
        setArchivedTemplateId('')
        setPreview(null)
        setMessage(error instanceof Error ? error.message : 'Không tải được mẫu sự kiện.')
      }
    }
  }, [enabled, mode, refreshToken])

  useEffect(() => {
    const currentGeneration = generation
    currentGeneration.current++
    snapshotCommand.current = null
    versionCommand.current = null
    instantiateCommand.current = null
    archiveCommand.current = null
    restoreCommand.current = null
    void loadTemplates()
    return () => { currentGeneration.current++ }
  }, [loadTemplates, scopeKey])

  const run = async (action: (current: () => boolean) => Promise<void>) => {
    const scope = getTenantScopeKey()
    if (!enabled || !scope || inFlight.current) return
    const token = generation.current; const current = () => token === generation.current && scope === getTenantScopeKey()
    inFlight.current = true; setBusy(true); setMessage('')
    try { await action(current) } catch (error) {
      if (current()) setMessage(error instanceof Error ? error.message : 'Không cập nhật được mẫu sự kiện.')
    } finally {
      inFlight.current = false
      if (current()) setBusy(false)
    }
  }

  const previewSelected = () => {
    if (!selectedTemplate || !startsAt) return
    const instant = new Date(startsAt).toISOString()
    void run(async current => {
      const result = await operationsApi.previewEventTemplate(selectedTemplate.id, instant, selectedTemplate.latestVersion)
      if (!current()) return
      if (result.template.id !== selectedTemplate.id || result.template.parishId !== getTenantScope()?.parishId || result.version !== selectedTemplate.latestVersion) throw new Error('Bản xem trước không khớp mẫu đã chọn.')
      setPreview(result)
    })
  }

  const isCatalog = mode === 'catalog'

  return <section className="space-y-4 rounded-xl border border-surface-border p-4" aria-label={isCatalog ? 'Mẫu sự kiện' : 'Quản lý mẫu từ sự kiện'}>
    <div className="flex items-start gap-3">
      <LayoutTemplate aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-parish-primary" />
      <div>
        <h2 className="m-0 text-sm font-extrabold text-text-main">{isCatalog ? 'Tạo sự kiện từ mẫu' : 'Quản lý mẫu từ sự kiện này'}</h2>
        <p className="mb-0 mt-1 text-xs text-text-muted">Mẫu chỉ sao chép nội dung, phase, checklist và hạn tương đối. Nhân sự, quyền, phản hồi, duyệt và lịch nhắc luôn bắt đầu lại.</p>
      </div>
    </div>

    {isCatalog && (visibleTemplates.length === 0
      ? <EmptyState icon={LayoutTemplate} title="Chưa có mẫu trong phạm vi của bạn." description="Mẫu sẽ xuất hiện khi người có quyền trong Ban/Ngành tạo và duyệt nội dung." className="py-5" />
      : <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold text-text-main">Mẫu
          <Select aria-label="Mẫu sự kiện cần dùng" className="mt-1 w-full" value={templateId} disabled={busy} onChange={event => { setTemplateId(event.target.value); setPreview(null) }}>
            {visibleTemplates.map(template => <option key={template.id} value={template.id}>{template.name} · v{template.latestVersion}</option>)}
          </Select>
        </label>
        <label className="text-sm font-semibold text-text-main">Bắt đầu sự kiện mới
          <TextInput aria-label="Thời gian bắt đầu từ mẫu" className="mt-1 w-full" type="datetime-local" value={startsAt} disabled={busy} onChange={event => { setStartsAt(event.target.value); setPreview(null) }} />
        </label>
        <fieldset className="sm:col-span-2">
          <legend className="mb-1 text-sm font-semibold text-text-main">Hiển thị sự kiện</legend>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Hiển thị sự kiện từ mẫu">
            <Button type="button" variant={!publicSummary ? 'primary' : 'secondary'} size="sm" disabled={busy} onClick={() => setPublicSummary(false)}>Nội bộ</Button>
            <Button type="button" variant={publicSummary ? 'primary' : 'secondary'} size="sm" disabled={busy || !canPublishPublic} title={!canPublishPublic ? 'Chỉ Trưởng Xứ đoàn được công khai sự kiện.' : undefined} onClick={() => setPublicSummary(true)}>Công khai</Button>
          </div>
          <p className="mb-0 mt-1 text-xs text-text-muted">{canPublishPublic ? 'Công khai tự sinh bản chiếu Lịch và thông báo phụ huynh;' : 'Bạn chỉ được tạo bản nội bộ; Trưởng Xứ đoàn duyệt việc công khai;'} task, phân công và hậu kiểm luôn nội bộ.</p>
        </fieldset>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button variant="secondary" size="sm" disabled={busy || !startsAt || !selectedTemplate} onClick={previewSelected}>Xem trước</Button>
          <Button size="sm" leadingIcon={<CalendarPlus className="h-4 w-4" />} disabled={busy || !preview || preview.template.id !== selectedTemplate?.id || preview.version !== selectedTemplate?.latestVersion} onClick={() => {
            if (!preview || !selectedTemplate || !startsAt) return
            void run(async current => {
              const scope = getTenantScope()
              if (!scope?.userId) throw new Error('Phiên người dùng chưa sẵn sàng.')
              const payload = {
                templateVersion: preview.version,
                startsAt: new Date(startsAt).toISOString(),
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh',
                visibility: publicSummary ? 'PUBLIC_SUMMARY' : 'INTERNAL',
                organizerUserId: scope.userId,
              } as const
              const created = await operationsApi.instantiateEventTemplate(selectedTemplate.id, payload, keyForPayload(instantiateCommand, { templateId: selectedTemplate.id, ...payload }))
              if (!current()) return
              if (created.event.parishId !== scope.parishId || created.event.sourceTemplateId !== selectedTemplate.id || created.event.sourceTemplateVersion !== preview.version) throw new Error('Không thể xác nhận event được tạo từ mẫu hiện tại.')
              instantiateCommand.current = null
              setMessage(`Đã tạo bản nháp “${created.event.title}” với ${created.tasks.length} task; chưa có người được phân công.`)
              await loadTemplates()
              await onEventCreated(created.event.id)
            })
          }}>Tạo bản nháp từ mẫu</Button>
        </div>
      </div>)}

    {isCatalog && preview && <div role="region" className="space-y-2 rounded-lg bg-surface-sunken p-3" aria-label="Bản xem trước mẫu sự kiện">
      <div className="flex flex-wrap items-center gap-2"><h3 className="m-0 text-sm font-extrabold text-text-main">{preview.preview.event.title}</h3><Badge tone="neutral">Phiên bản {preview.version}</Badge></div>
      <p className="m-0 text-xs text-text-muted">{new Date(preview.preview.event.startsAt).toLocaleString('vi-VN')} – {new Date(preview.preview.event.endsAt).toLocaleString('vi-VN')} · {preview.preview.tasks.length} task</p>
      {preview.preview.tasks.map(task => <div key={task.index} className="rounded-lg border border-surface-border bg-surface-card p-2 text-sm text-text-main">
        <p className="m-0 font-bold">{task.title}{task.isRequired ? ' · Bắt buộc' : ''}</p>
        <p className="mb-0 mt-1 text-xs text-text-muted">{task.phase} · {task.scheduledStartAt && task.scheduledEndAt ? `Ca ${new Date(task.scheduledStartAt).toLocaleString('vi-VN')} – ${new Date(task.scheduledEndAt).toLocaleString('vi-VN')}` : task.dueAt ? `Hạn ${new Date(task.dueAt).toLocaleString('vi-VN')}` : 'Không có lịch'} · {task.checklist.length} mục checklist</p>
      </div>)}
      <p className="m-0 text-xs font-semibold text-parish-warning">Bản xem trước không chứa assignee, acceptance, approval result, comment hoặc reminder.</p>
    </div>}

    {!isCatalog && canSnapshotSource && sourceEvent && <form className="grid gap-3 border-t border-surface-border pt-4 sm:grid-cols-2" onSubmit={event => {
      event.preventDefault()
      if (!templateName.trim()) return
      void run(async current => {
        const payload = { eventVersion: sourceEvent.event.version, name: templateName.trim(), description: templateDescription.trim() || null }
        const created = await operationsApi.createEventTemplate(sourceEvent.event.id, payload, keyForPayload(snapshotCommand, { eventId: sourceEvent.event.id, ...payload }))
        if (!current()) return
        snapshotCommand.current = null
        setTemplateName(''); setTemplateDescription(''); setMessage('Đã lưu snapshot v1; thay đổi event sau này không sửa mẫu này.')
        await loadTemplates(); setTemplateId(created.id); setPreview(null); onTemplatesChanged?.()
      })
    }}>
      <div className="sm:col-span-2"><h3 className="m-0 text-sm font-extrabold text-text-main">Lưu sự kiện đang mở thành mẫu</h3><p className="mb-0 mt-1 text-xs text-text-muted">Task đã hủy và toàn bộ identity/quyền vận hành không được đưa vào snapshot.</p></div>
      <TextInput aria-label="Tên mẫu sự kiện" value={templateName} maxLength={200} required disabled={busy} placeholder="Ví dụ: Mẫu sinh hoạt ngành" onChange={event => setTemplateName(event.target.value)} />
      <TextInput aria-label="Mô tả mẫu sự kiện" value={templateDescription} maxLength={3000} disabled={busy} placeholder="Phạm vi áp dụng của mẫu" onChange={event => setTemplateDescription(event.target.value)} />
      <Button type="submit" size="sm" leadingIcon={<CopyCheck className="h-4 w-4" />} disabled={busy || !templateName.trim()}>Lưu mẫu v1</Button>
    </form>}

    {!isCatalog && visibleTemplates.length > 0 && <label className="block text-sm font-semibold text-text-main">Mẫu cần cập nhật
      <Select aria-label="Mẫu sự kiện cần tạo phiên bản" className="mt-1 w-full" value={templateId} disabled={busy} onChange={event => setTemplateId(event.target.value)}>
        {visibleTemplates.map(template => <option key={template.id} value={template.id}>{template.name} · v{template.latestVersion}</option>)}
      </Select>
      {selectedTemplate && !sourceMatchesTemplate && <span className="mt-1 block text-xs text-parish-warning">Event và mẫu phải cùng phạm vi Ban/Ngành để tạo phiên bản mới.</span>}
    </label>}

    {!isCatalog && canSnapshotSource && sourceEvent && selectedTemplate && sourceMatchesTemplate && <form className="grid gap-3 border-t border-surface-border pt-4 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={event => {
      event.preventDefault()
      if (!versionReason.trim()) return
      void run(async current => {
        const payload = { expectedVersion: selectedTemplate.version, expectedLatestVersion: selectedTemplate.latestVersion, sourceEventId: sourceEvent.event.id, sourceEventVersion: sourceEvent.event.version, reason: versionReason.trim() }
        const changed = await operationsApi.createEventTemplateVersion(selectedTemplate.id, payload, keyForPayload(versionCommand, { templateId: selectedTemplate.id, ...payload }))
        if (!current()) return
        versionCommand.current = null
        setVersionReason(''); setPreview(null); setMessage(`Đã tạo phiên bản ${changed.latestVersion}; các event cũ vẫn giữ snapshot trước.`)
        await loadTemplates(); onTemplatesChanged?.()
      })
    }}>
      <label className="text-sm font-semibold text-text-main">Lý do tạo phiên bản mới
        <TextArea aria-label="Lý do tạo phiên bản mẫu" className="mt-1 min-h-20 w-full" value={versionReason} maxLength={2000} required disabled={busy} placeholder="Điểm nào trong event hiện tại cần trở thành chuẩn mới?" onChange={event => setVersionReason(event.target.value)} />
      </label>
      <Button type="submit" variant="secondary" size="sm" disabled={busy || !versionReason.trim()}>Tạo phiên bản mới</Button>
    </form>}

    {!isCatalog && canSnapshotSource && selectedTemplate && <form className="grid gap-3 border-t border-surface-border pt-4 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={event => {
      event.preventDefault()
      if (!archiveReason.trim()) return
      void run(async current => {
        const payload = { expectedVersion: selectedTemplate.version, expectedLatestVersion: selectedTemplate.latestVersion, reason: archiveReason.trim() }
        await operationsApi.archiveEventTemplate(selectedTemplate.id, payload, keyForPayload(archiveCommand, { templateId: selectedTemplate.id, ...payload }))
        if (!current()) return
        archiveCommand.current = null
        setArchiveReason(''); setPreview(null); setMessage('Đã lưu trữ mẫu. Event đã tạo trước đây vẫn giữ nguyên provenance và snapshot.')
        await loadTemplates(); onTemplatesChanged?.()
      })
    }}>
      <label className="text-sm font-semibold text-text-main">Lý do lưu trữ mẫu
        <TextArea aria-label="Lý do lưu trữ mẫu sự kiện" className="mt-1 min-h-20 w-full" value={archiveReason} maxLength={2000} required disabled={busy} placeholder="Ví dụ: tạm ẩn để rà soát nội dung" onChange={event => setArchiveReason(event.target.value)} />
      </label>
      <Button type="submit" variant="danger" size="sm" disabled={busy || !archiveReason.trim()}>Lưu trữ mẫu</Button>
    </form>}

    {!isCatalog && canSnapshotSource && visibleArchivedTemplates.length > 0 && <form className="grid gap-3 border-t border-surface-border pt-4 sm:grid-cols-2" onSubmit={event => {
      event.preventDefault()
      if (!selectedArchivedTemplate || !restoreReason.trim()) return
      void run(async current => {
        const payload = { expectedVersion: selectedArchivedTemplate.version, expectedLatestVersion: selectedArchivedTemplate.latestVersion, reason: restoreReason.trim() }
        await operationsApi.restoreEventTemplate(selectedArchivedTemplate.id, payload, keyForPayload(restoreCommand, { templateId: selectedArchivedTemplate.id, ...payload }))
        if (!current()) return
        restoreCommand.current = null
        setRestoreReason(''); setMessage('Đã khôi phục mẫu vào catalog hoạt động.')
        await loadTemplates(); onTemplatesChanged?.()
      })
    }}>
      <div className="sm:col-span-2"><h3 className="m-0 text-sm font-extrabold text-text-main">Mẫu đang lưu trữ</h3><p className="mb-0 mt-1 text-xs text-text-muted">Mẫu lưu trữ không thể xem trước, tạo phiên bản hay tạo event mới cho đến khi được khôi phục.</p></div>
      <label className="text-sm font-semibold text-text-main">Mẫu cần khôi phục
        <Select aria-label="Mẫu sự kiện cần khôi phục" className="mt-1 w-full" value={archivedTemplateId} disabled={busy} onChange={event => setArchivedTemplateId(event.target.value)}>
          {visibleArchivedTemplates.map(template => <option key={template.id} value={template.id}>{template.name} · v{template.latestVersion}</option>)}
        </Select>
      </label>
      <label className="text-sm font-semibold text-text-main">Lý do khôi phục
        <TextArea aria-label="Lý do khôi phục mẫu sự kiện" className="mt-1 min-h-20 w-full" value={restoreReason} maxLength={2000} required disabled={busy} placeholder="Nội dung đã được rà soát như thế nào?" onChange={event => setRestoreReason(event.target.value)} />
      </label>
      <Button type="submit" variant="secondary" size="sm" disabled={busy || !selectedArchivedTemplate || !restoreReason.trim()}>Khôi phục mẫu</Button>
    </form>}

    {message && <p role="status" className="m-0 text-sm text-text-main">{message}</p>}
  </section>
}
