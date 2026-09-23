import { useMemo, useState } from 'react'
import { UploadCloud } from 'lucide-react'
import { tiniImportApi, type TiniCandidates, type TiniLink, type TiniPreview } from '../../lib/api/tiniImport'
import { useAttendanceStore } from '../../stores/attendanceStore'
import { hasUnsettledLocalAttendanceInSelectedScope } from '../../lib/tiniImportPreflight'

const classLabels: Record<string, string> = {
  new: 'Mới', identical: 'Đã trùng khớp', conflict: 'Khác dữ liệu hiện có',
  unmapped: 'Chưa liên kết', unsupported: 'Chưa hỗ trợ', locked: 'Đã khóa',
  invalid: 'Không hợp lệ', stale: 'Đã thay đổi',
}
const statusLabels: Record<string, string> = {
  Present: 'Có mặt', AbsentExcused: 'Vắng có phép', AbsentUnexcused: 'Vắng không phép',
}
const evidenceLabels: Record<string, string> = {
  class_name_exact: 'trùng tên lớp', class_link_reviewed: 'lớp đã liên kết', name_exact: 'trùng tên',
  date_of_birth_exact: 'trùng ngày sinh', date_of_birth_missing: 'thiếu ngày sinh',
  name_differs: 'khác tên', class_differs: 'khác lớp', name_similar: 'tên gần giống',
  date_of_birth_differs: 'khác ngày sinh', class_name_similar: 'tên lớp gần giống',
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Không thể xử lý tệp. Vui lòng thử lại.'
}

export function TiniAttendanceImportPanel() {
  const [sourceFile, setSourceFile] = useState('')
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState<TiniPreview | null>(null)
  const [links, setLinks] = useState<TiniLink[]>([])
  const [candidates, setCandidates] = useState<TiniCandidates>({ classes: [], students: [] })
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [reason, setReason] = useState('')
  const [suggestedLinks, setSuggestedLinks] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [acknowledged, setAcknowledged] = useState(false)
  const [result, setResult] = useState<{ receipts: { index: number; outcome: string }[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const sourceYearId = useMemo(() => {
    try { return String(JSON.parse(sourceFile).academicYear?.externalId || '') }
    catch { return '' }
  }, [sourceFile])
  const unmappedClasses = useMemo(() => {
    const unique = new Map<string, string>()
    for (const item of preview?.items ?? []) {
      const { externalClassId, className } = item.observation
      if (externalClassId) unique.set(externalClassId, className)
    }
    return [...unique].map(([id, name]) => ({ id, name }))
  }, [preview])
  const sourceStudents = useMemo(() => {
    const unique = new Map<string, { name: string; className: string }>()
    for (const item of preview?.items ?? []) {
      unique.set(item.observation.externalStudentId, {
        name: item.observation.studentName, className: item.observation.className,
      })
    }
    return [...unique].map(([id, value]) => ({ id, ...value }))
  }, [preview])

  const loadPreview = async (raw: string) => {
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const next = await tiniImportApi.preview(raw)
      const [nextLinks, nextCandidates] = await Promise.all([
        tiniImportApi.links(), tiniImportApi.candidates(next.sourceYear),
      ])
      setPreview(next)
      setLinks(nextLinks)
      setCandidates(nextCandidates)
      setSuggestedLinks(new Set())
      setSelected(new Set())
      setAcknowledged(false)
    } catch (cause) {
      setPreview(null)
      setError(messageOf(cause))
    } finally { setBusy(false) }
  }

  const chooseFile = async (file?: File) => {
    setPreview(null)
    setSourceFile('')
    setFileName('')
    setSelected(new Set())
    setResult(null)
    setError('')
    if (!file) return
    if (file.size > 1024 * 1024) { setError('Tệp vượt giới hạn 1 MB.'); return }
    try {
      const raw = await file.text()
      setSourceFile(raw)
      setFileName(file.name)
      await loadPreview(raw)
    } catch (cause) { setError(messageOf(cause)) }
  }

  const saveLink = async (kind: 'class' | 'student', externalId: string) => {
    const scope = kind === 'class' ? sourceYearId : ''
    const key = `${kind}:${scope}:${externalId}`
    const targetId = choices[key]
    if (!targetId || reason.trim().length < 8) {
      setError('Hãy chọn đúng hồ sơ Catevia và ghi lý do đối chiếu ít nhất 8 ký tự.')
      return
    }
    const current = links.find(link => link.entityKind === kind && link.externalScope === scope
      && link.externalId === externalId)
    setBusy(true)
    setError('')
    try {
      await tiniImportApi.saveLink({ entityKind: kind, externalScope: scope, externalId,
        targetId, expectedVersion: current?.version ?? 0, reason: reason.trim(),
        ...(kind === 'class' ? { sourceYearLabel: preview!.sourceYear } : {}) })
      await loadPreview(sourceFile)
    } catch (cause) { setError(messageOf(cause)); setBusy(false) }
  }

  const retireLink = async (link: TiniLink) => {
    if (reason.trim().length < 8) {
      setError('Hãy ghi lý do ngừng liên kết ít nhất 8 ký tự.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await tiniImportApi.retireLink(link.id, link.version, reason.trim())
      await loadPreview(sourceFile)
    } catch (cause) { setError(messageOf(cause)); setBusy(false) }
  }

  const saveSuggestedLinks = async () => {
    if (!preview || suggestedLinks.size === 0 || reason.trim().length < 8) {
      setError('Hãy chọn ít nhất một đề xuất và ghi lý do duyệt ít nhất 8 ký tự.')
      return
    }
    const selectedSuggestions = preview.identityLinkSuggestions.filter(item => (
      suggestedLinks.has(`${item.entityKind}:${item.externalId}`) && item.recommendedTargetId
    ))
    setBusy(true)
    setError('')
    try {
      await tiniImportApi.saveSuggestedLinks({
        runId: preview.runId,
        sourceFile,
        selected: selectedSuggestions.map(item => ({ entityKind: item.entityKind,
          externalId: item.externalId, targetId: item.recommendedTargetId! })),
        reason: reason.trim(),
      })
      await loadPreview(sourceFile)
    } catch (cause) { setError(messageOf(cause)); setBusy(false) }
  }

  const commit = async () => {
    if (!preview || !acknowledged || selected.size === 0) return
    setBusy(true)
    setError('')
    try {
      if (await hasUnsettledLocalAttendanceInSelectedScope(preview.items, selected)) {
        setError('Thiết bị này còn điểm danh chưa đồng bộ trong cùng ngày và buổi. Hãy đồng bộ hoặc xử lý xung đột trước khi nhập TINI.')
        return
      }
      const response = await tiniImportApi.commit(preview.runId, sourceFile, [...selected].sort((a, b) => a - b))
      setResult(response)
      setAcknowledged(false)
      setSelected(new Set())
      await useAttendanceStore.getState().fetchAttendance(undefined, true)
    } catch (cause) { setError(messageOf(cause)) }
    finally { setBusy(false) }
  }

  return (
    <section className="space-y-5 rounded-card border border-surface-border bg-surface-card p-4 md:p-6" aria-label="Nhập điểm danh TINI">
      <div>
        <h2 className="text-xl font-bold text-text-main">Nhập điểm danh TINI</h2>
        <p className="mt-1 text-sm text-text-muted">Chọn tệp JSON do tiện ích xuất từ trang TINI đã mở. Dữ liệu chỉ được ghi sau khi bạn xem trước và xác nhận từng lượt.</p>
      </div>
      <div>
        <label htmlFor="tini-file-input" className="block text-sm font-semibold text-text-main mb-1.5">
          Tệp xuất từ TINI
        </label>
        <div className="flex flex-col items-center justify-center p-5 border-2 border-dashed border-surface-border hover:border-parish-primary/50 bg-surface-hover/30 hover:bg-surface-hover/60 rounded-2xl transition-colors text-center">
          <UploadCloud className="w-8 h-8 text-parish-primary/70 mb-1.5" />
          <p className="text-xs font-semibold text-text-main">
            Chọn tệp JSON do tiện ích TINI DOM Export xuất từ trình duyệt
          </p>
          <input
            id="tini-file-input"
            className="mt-2.5 block w-full max-w-sm text-xs text-text-muted file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-parish-primary file:text-white hover:file:bg-parish-primary/90 cursor-pointer"
            type="file"
            accept=".json,application/json"
            disabled={busy}
            onChange={event => void chooseFile(event.target.files?.[0])}
          />
        </div>
      </div>
      {fileName && <p className="text-sm text-text-muted">Tệp: {fileName}</p>}
      {error && <p role="alert" className="rounded-lg bg-[var(--color-parish-danger-bg)] p-3 text-sm text-[var(--color-parish-danger)]">{error}</p>}
      {busy && <p role="status" className="text-sm text-text-muted">Đang kiểm tra dữ liệu…</p>}

      {preview && <>
        <div className="rounded-lg border border-surface-border p-3 text-sm">
          <p><strong>Niên học:</strong> {preview.sourceYear} · <strong>Dòng đã tải:</strong> {preview.renderedStudentRows} · <strong>Lượt điểm danh:</strong> {preview.items.length}</p>
          <p className="mt-1">{Object.entries(preview.counts).map(([status, count]) => `${classLabels[status] ?? status}: ${count}`).join(' · ')}</p>
          {preview.partial && <p className="mt-2 font-semibold text-[var(--color-parish-warning)]">Trang nguồn còn nút “Xem thêm”. Tệp này chỉ gồm các dòng đã tải; các dòng chưa có không được xem là vắng.</p>}
          {preview.rowErrors.length > 0 && <p className="mt-2 text-[var(--color-parish-danger)]">{preview.rowErrors.length} dòng thiếu định danh hoặc nhãn đã bị bỏ qua; hãy kiểm tra trang nguồn.</p>}
          {!preview.profileComparisonAvailable && <p className="mt-2 text-[var(--color-parish-warning)]">Tệp được tạo bằng định dạng cũ nên Catevia không dùng tên/lớp trong tệp để đề xuất sửa hồ sơ. Hãy xuất lại bằng tiện ích mới nếu cần đối chiếu thông tin học viên.</p>}
        </div>

        {(preview.identityLinkSuggestions.length > 0 || preview.counts.unmapped || preview.counts.conflict) && <label className="block text-sm">Lý do duyệt liên kết
          <input className="mt-1 w-full rounded-lg border border-surface-border p-2" maxLength={500}
            value={reason} onChange={event => setReason(event.target.value)} placeholder="Ví dụ: Đã đối chiếu tên, ngày sinh và lớp" />
        </label>}

        {preview.identityLinkSuggestions.length > 0 && <section className="space-y-3" aria-label="Đề xuất đối chiếu định danh">
          <div>
            <h3 className="font-bold text-text-main">Đề xuất đối chiếu định danh</h3>
            <p className="mt-1 text-sm text-text-muted">Catevia xếp ứng viên theo độ giống tên, ngày sinh và lớp. Điểm chỉ giúp sắp thứ tự, không phải xác suất định danh. Hãy kiểm tra bằng chứng rồi tự chọn từng liên kết muốn duyệt.</p>
          </div>
          <div className="space-y-2">
            {preview.identityLinkSuggestions.map(suggestion => {
              const key = `${suggestion.entityKind}:${suggestion.externalId}`
              const selectable = Boolean(suggestion.recommendedTargetId)
              const recommended = suggestion.candidates.find(candidate => candidate.targetId === suggestion.recommendedTargetId)
              return <article key={key} className="rounded-lg border border-surface-border p-3 text-sm">
                <div className="flex items-start gap-2">
                  <input type="checkbox" aria-label={`Chọn đề xuất ${suggestion.externalId}`}
                    disabled={!selectable || busy} checked={suggestedLinks.has(key)}
                    onChange={event => setSuggestedLinks(previous => {
                      const next = new Set(previous)
                      if (event.target.checked) next.add(key); else next.delete(key)
                      return next
                    })} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-text-main">
                      {suggestion.entityKind === 'class' ? 'Lớp' : 'Học viên'} TINI {suggestion.externalId} · {suggestion.sourceName}
                    </p>
                    {suggestion.sourceDateOfBirth && <p className="text-text-muted">Ngày sinh nguồn: {suggestion.sourceDateOfBirth}</p>}
                    <p className="mt-1 font-semibold">
                      {suggestion.status === 'high_confidence' ? 'Đủ bằng chứng để đề xuất'
                        : suggestion.status === 'review' ? 'Cần quản trị viên xem lại'
                          : suggestion.status === 'ambiguous' ? 'Có nhiều hồ sơ phù hợp' : 'Chưa tìm thấy hồ sơ phù hợp'}
                    </p>
                    {recommended && <>
                      <p className="mt-1 text-text-main">Đề xuất: {recommended.targetCode} · {recommended.targetName} · {recommended.targetClassName} · điểm {recommended.score}/100</p>
                      <p className="text-xs text-text-muted">Bằng chứng: {recommended.evidence.map(item => evidenceLabels[item] ?? item).join(' · ')}</p>
                    </>}
                    {!recommended && suggestion.candidates.length > 0 && <ul className="mt-1 space-y-1 text-xs text-text-muted">
                      {suggestion.candidates.map(candidate => <li key={candidate.targetId}>
                        {candidate.score}/100 · {candidate.targetCode} · {candidate.targetName} · {candidate.targetClassName}
                        <span className="block">{candidate.evidence.map(item => evidenceLabels[item] ?? item).join(' · ')}</span>
                      </li>)}
                    </ul>}
                  </div>
                </div>
              </article>
            })}
          </div>
          <button type="button" className="btn btn-secondary" disabled={busy || suggestedLinks.size === 0 || reason.trim().length < 8}
            onClick={() => void saveSuggestedLinks()}>Duyệt {suggestedLinks.size} liên kết đề xuất</button>
        </section>}

        {(preview.counts.unmapped || preview.counts.conflict) ? <section className="space-y-3" aria-label="Liên kết định danh TINI">
          <h3 className="font-bold text-text-main">Đối chiếu định danh</h3>
          <p className="text-sm text-text-muted">Chọn hồ sơ theo mã và lớp. Tên chỉ giúp nhận diện; liên kết bền vững dùng mã TINI và ID Catevia.</p>
          {unmappedClasses.map(source => {
            const scope = sourceYearId
            const key = `class:${scope}:${source.id}`
            const current = links.find(link => link.entityKind === 'class' && link.externalScope === scope && link.externalId === source.id)
            return <div key={key} className="flex flex-wrap items-end gap-2 rounded-lg border border-surface-border p-2 text-sm">
              <label className="min-w-52 flex-1">Lớp TINI {source.name} ({source.id})
                <select className="mt-1 w-full rounded-lg border border-surface-border p-2" value={choices[key] ?? current?.targetId ?? ''}
                  onChange={event => setChoices(previous => ({ ...previous, [key]: event.target.value }))}>
                  <option value="">Chọn lớp Catevia</option>
                  {candidates.classes.map(candidate => <option key={candidate.id} value={candidate.id}
                    disabled={links.some(link => link.entityKind === 'class' && link.externalScope === scope
                      && link.targetId === candidate.id && link.externalId !== source.id)}>
                    {candidate.code} · {candidate.name}{links.some(link => link.entityKind === 'class'
                      && link.externalScope === scope && link.targetId === candidate.id
                      && link.externalId !== source.id) ? ' · đã liên kết mã TINI khác' : ''}
                  </option>)}
                </select>
              </label>
              <button type="button" className="btn btn-secondary" disabled={busy || !choices[key]} onClick={() => void saveLink('class', source.id)}>Lưu liên kết lớp</button>
              {current && <button type="button" className="btn btn-secondary" disabled={busy}
                onClick={() => void retireLink(current)}>Ngừng liên kết</button>}
            </div>
          })}
          {sourceStudents.map(source => {
            const key = `student::${source.id}`
            const current = links.find(link => link.entityKind === 'student' && link.externalId === source.id)
            return <div key={key} className="flex flex-wrap items-end gap-2 rounded-lg border border-surface-border p-2 text-sm">
              <label className="min-w-52 flex-1">Học viên TINI {source.id} · {source.name} · {source.className}
                <select className="mt-1 w-full rounded-lg border border-surface-border p-2" value={choices[key] ?? current?.targetId ?? ''}
                  onChange={event => setChoices(previous => ({ ...previous, [key]: event.target.value }))}>
                  <option value="">Chọn học viên Catevia</option>
                  {candidates.students.map(candidate => <option key={candidate.id} value={candidate.id}
                    disabled={links.some(link => link.entityKind === 'student' && link.targetId === candidate.id
                      && link.externalId !== source.id)}>
                    {candidate.code} · {candidate.fullName} · {candidates.classes.find(cls => cls.id === candidate.classId)?.name ?? ''}
                    {links.some(link => link.entityKind === 'student' && link.targetId === candidate.id
                      && link.externalId !== source.id) ? ' · đã liên kết mã TINI khác' : ''}
                  </option>)}
                </select>
              </label>
              <button type="button" className="btn btn-secondary" disabled={busy || !choices[key]} onClick={() => void saveLink('student', source.id)}>Lưu liên kết học viên</button>
              {current && <button type="button" className="btn btn-secondary" disabled={busy}
                onClick={() => void retireLink(current)}>Ngừng liên kết</button>}
            </div>
          })}
        </section> : null}

        {preview.studentProfileSuggestions.length > 0 && <section className="space-y-3" aria-label="Đề xuất đồng bộ thông tin học viên">
          <div>
            <h3 className="font-bold text-text-main">Đề xuất đồng bộ thông tin học viên</h3>
            <p className="mt-1 text-sm text-text-muted">Catevia chỉ đề xuất sau khi mã TINI đã được liên kết với đúng hồ sơ. Các đề xuất dưới đây không tự sửa dữ liệu; hãy kiểm tra hồ sơ gốc và dùng quy trình sửa học viên hiện có.</p>
          </div>
          {preview.studentProfileSuggestions.map(suggestion => <article key={suggestion.externalStudentId}
            className="rounded-lg border border-surface-border p-3 text-sm">
            <h4 className="font-semibold text-text-main">{suggestion.targetStudentCode} · mã TINI {suggestion.externalStudentId}</h4>
            <ul className="mt-2 space-y-2">
              {suggestion.differences.map(difference => <li key={difference.field} className="rounded-lg bg-surface-hover/50 p-2">
                <p className="font-semibold text-text-main">
                  {difference.field === 'displayName'
                    ? difference.kind === 'formatting' ? 'Tên khác cách viết' : 'Tên hiển thị khác nội dung'
                    : difference.field === 'dateOfBirth' ? 'Ngày sinh khác TINI' : 'Lớp đang học khác TINI'}
                </p>
                <p className="mt-1 text-text-muted">Catevia: {difference.cateviaValue || 'Chưa có'}</p>
                <p className="text-text-main">TINI: {difference.tiniValue || 'Chưa có'}</p>
                <p className="mt-1 text-xs text-text-muted">
                  {difference.recommendation === 'review_name_parts'
                    ? 'Đề xuất: kiểm tra riêng Tên thánh và Họ tên trước khi sửa hồ sơ.'
                    : difference.recommendation === 'review_birth_date'
                      ? 'Đề xuất: kiểm tra giấy tờ hoặc hồ sơ gốc rồi sửa ngày sinh theo quy trình sửa học viên.'
                      : 'Đề xuất: dùng quy trình điều chỉnh lớp, nhập lý do và tuân thủ khóa niên học.'}
                </p>
              </li>)}
            </ul>
          </article>)}
        </section>}

        <section className="space-y-2" aria-label="Kết quả đối chiếu điểm danh">
          <h3 className="font-bold text-text-main">Xem trước từng lượt</h3>
          <div className="max-h-[30rem] overflow-auto rounded-lg border border-surface-border">
            <table className="w-full min-w-[46rem] text-left text-sm">
              <thead className="sticky top-0 bg-surface-card"><tr><th className="p-2">Chọn</th><th className="p-2">Học viên TINI</th><th className="p-2">Lớp</th><th className="p-2">Ngày, loại</th><th className="p-2">Trạng thái</th><th className="p-2">Đối chiếu</th></tr></thead>
              <tbody>{preview.items.map(item => {
                const allowed = item.classification === 'new' || item.classification === 'identical'
                return <tr key={item.index} className="border-t border-surface-border">
                  <td className="p-2"><input type="checkbox" aria-label={`Chọn lượt ${item.index + 1}`} disabled={!allowed || busy || !!result}
                    checked={selected.has(item.index)} onChange={event => setSelected(previous => {
                      const next = new Set(previous)
                      if (event.target.checked) next.add(item.index); else next.delete(item.index)
                      return next
                    })} /></td>
                  <td className="p-2">{item.observation.externalStudentId} · {item.observation.studentName}</td>
                  <td className="p-2">{item.observation.className}</td>
                  <td className="p-2">{item.observation.date} · {item.normalized?.type === 'SundayMass' ? 'Thánh lễ' : item.normalized?.type === 'CatechismClass' ? 'Giáo lý' : item.observation.sourceTitle}</td>
                  <td className="p-2">{item.normalized ? statusLabels[item.normalized.status] : 'Chưa hỗ trợ'}{item.observation.late ? ' · Trễ' : ''}</td>
                  <td className="p-2 font-semibold">{classLabels[item.classification]}</td>
                </tr>
              })}</tbody>
            </table>
          </div>
        </section>
        {!result && <div className="space-y-3 rounded-lg border border-surface-border p-3">
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={acknowledged}
            onChange={event => setAcknowledged(event.target.checked)} />
            <span>Tôi đã đối chiếu các lượt được chọn. Chỉ lượt mới được thêm; lượt trùng khớp không làm đổi điểm danh hiện có.</span>
          </label>
          <button type="button" className="btn btn-primary" disabled={busy || !acknowledged || selected.size === 0}
            onClick={() => void commit()}>Xác nhận nhập {selected.size} lượt</button>
        </div>}
        {result && <div role="status" className="rounded-lg border border-surface-border p-3 text-sm">
          <strong>Đã xử lý {result.receipts.length} lượt:</strong> {result.receipts.map(receipt => `#${receipt.index + 1} ${receipt.outcome === 'created' ? 'đã thêm' : receipt.outcome === 'identical' ? 'trùng khớp' : 'đã thay đổi, cần xem trước lại'}`).join(' · ')}
          {result.receipts.some(receipt => receipt.outcome === 'stale') && <button type="button" className="btn btn-secondary mt-2" onClick={() => void loadPreview(sourceFile)}>Xem trước lại</button>}
        </div>}
      </>}
    </section>
  )
}

export default TiniAttendanceImportPanel
