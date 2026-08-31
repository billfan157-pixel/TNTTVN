import { useMemo, useState } from 'react'
import { Archive, Building2, CalendarRange, FileClock, Landmark, UserRound } from 'lucide-react'
import { ModalShell } from '../common/ModalShell'
import { Button, Select, TextArea, TextInput } from '../common/ui'
import { useParishProfileStore } from '../../stores/parishProfileStore'
import { useToastStore } from '../../stores/toastStore'
import type {
  ParishArchiveAsset,
  ParishOrganizationUnit,
  ParishPerson,
  ParishProfileSnapshot,
  ParishRecord,
  ParishServiceTerm,
} from '../../types/parishProfile'

export type ParishEditorRequest =
  | { kind: 'profile' }
  | { kind: 'person'; value?: ParishPerson }
  | { kind: 'unit'; value?: ParishOrganizationUnit; parentId?: string }
  | { kind: 'term'; value?: ParishServiceTerm; personId?: string; unitId?: string }
  | { kind: 'record'; value?: ParishRecord; recordType?: ParishRecord['recordType'] }
  | { kind: 'asset'; value?: ParishArchiveAsset }

interface Props {
  editor: ParishEditorRequest
  snapshot: ParishProfileSnapshot
  onClose: () => void
}

const today = () => new Date().toISOString().slice(0, 10)
const normalize = (value: string) => value.trim() || null

const modalMeta = {
  profile: { title: 'Thông tin Xứ đoàn', icon: Landmark },
  person: { title: 'Hồ sơ Huynh trưởng / GLV', icon: UserRound },
  unit: { title: 'Đơn vị tổ chức', icon: Building2 },
  term: { title: 'Nhiệm kỳ phục vụ', icon: CalendarRange },
  record: { title: 'Bản ghi Xứ đoàn', icon: FileClock },
  asset: { title: 'Tư liệu Xứ đoàn', icon: Archive },
} as const

export function ParishProfileEditorModal({ editor, snapshot, onClose }: Props) {
  const store = useParishProfileStore()
  const addToast = useToastStore(state => state.addToast)
  const meta = modalMeta[editor.kind]
  const Icon = meta.icon

  const personValue = editor.kind === 'person' ? editor.value : undefined
  const [person, setPerson] = useState({
    linkedUserId: personValue?.linkedUserId ?? '', holyName: personValue?.holyName ?? '',
    fullName: personValue?.fullName ?? '', birthYear: personValue?.birthYear?.toString() ?? '',
    biography: personValue?.biography ?? '', serviceStatus: personValue?.serviceStatus ?? 'ACTIVE',
    visibility: personValue?.visibility ?? 'STAFF',
  })

  const unitValue = editor.kind === 'unit' ? editor.value : undefined
  const [unit, setUnit] = useState({
    parentId: unitValue?.parentId ?? (editor.kind === 'unit' ? editor.parentId ?? '' : ''),
    name: unitValue?.name ?? '', unitType: unitValue?.unitType ?? 'COMMITTEE',
    description: unitValue?.description ?? '', sortOrder: unitValue?.sortOrder?.toString() ?? '0',
    isActive: unitValue?.isActive ?? true,
  })

  const termValue = editor.kind === 'term' ? editor.value : undefined
  const [term, setTerm] = useState({
    personId: termValue?.personId ?? (editor.kind === 'term' ? editor.personId ?? '' : ''),
    unitId: termValue?.unitId ?? (editor.kind === 'term' ? editor.unitId ?? '' : ''),
    positionTitle: termValue?.positionTitle ?? '', rankTitle: termValue?.rankTitle ?? '',
    startDate: termValue?.startDate ?? today(), endDate: termValue?.endDate ?? '', notes: termValue?.notes ?? '',
  })

  const recordValue = editor.kind === 'record' ? editor.value : undefined
  const [record, setRecord] = useState({
    recordType: recordValue?.recordType ?? (editor.kind === 'record' ? editor.recordType ?? 'MILESTONE' : 'MILESTONE'),
    title: recordValue?.title ?? '', summary: recordValue?.summary ?? '', content: recordValue?.content ?? '',
    occurredOn: recordValue?.occurredOn ?? today(), endedOn: recordValue?.endedOn ?? '',
    location: recordValue?.location ?? '', status: recordValue?.status ?? 'DRAFT',
    visibility: recordValue?.visibility ?? 'STAFF', showOnTimeline: recordValue?.showOnTimeline ?? true,
    sourceEventId: recordValue?.sourceEventId ?? '', personIds: recordValue?.personIds ?? [],
    assetIds: recordValue?.assetIds ?? [],
  })

  const assetValue = editor.kind === 'asset' ? editor.value : undefined
  const linkedRecordIds = useMemo(() => assetValue
    ? snapshot.records.filter(item => item.assetIds.includes(assetValue.id)).map(item => item.id)
    : [], [assetValue, snapshot.records])
  const [asset, setAsset] = useState({
    assetType: assetValue?.assetType ?? 'IMAGE', title: assetValue?.title ?? '',
    description: assetValue?.description ?? '', capturedOn: assetValue?.capturedOn ?? '',
    visibility: assetValue?.visibility ?? 'STAFF', storageMode: 'EXTERNAL' as 'EXTERNAL' | 'UPLOAD',
    externalUrl: assetValue?.externalUrl ?? '', recordIds: linkedRecordIds,
  })
  const [file, setFile] = useState<File | null>(null)

  const [profile, setProfile] = useState({
    displayName: snapshot.profile.displayName,
    patronName: snapshot.profile.patronName ?? '',
    foundedDate: snapshot.profile.foundedDate ?? '',
    motto: snapshot.profile.motto ?? '',
    description: snapshot.profile.description ?? '',
  })

  const toggleId = (ids: string[], id: string) => ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id]

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    let ok = false
    if (editor.kind === 'profile') {
      ok = await store.saveProfile({
        displayName: profile.displayName, patronName: normalize(profile.patronName),
        foundedDate: profile.foundedDate || null, motto: normalize(profile.motto), description: normalize(profile.description),
      })
    } else if (editor.kind === 'person') {
      const payload = {
        linkedUserId: normalize(person.linkedUserId), holyName: normalize(person.holyName), fullName: person.fullName,
        birthYear: person.birthYear ? Number(person.birthYear) : null, biography: normalize(person.biography),
        serviceStatus: person.serviceStatus as ParishPerson['serviceStatus'], visibility: person.visibility as ParishPerson['visibility'],
      }
      ok = editor.value ? await store.updatePerson(editor.value.id, payload) : await store.createPerson(payload)
    } else if (editor.kind === 'unit') {
      const payload = {
        parentId: normalize(unit.parentId), name: unit.name, unitType: unit.unitType as ParishOrganizationUnit['unitType'],
        description: normalize(unit.description), sortOrder: Number(unit.sortOrder) || 0, isActive: unit.isActive,
      }
      ok = editor.value ? await store.updateUnit(editor.value.id, payload) : await store.createUnit(payload)
    } else if (editor.kind === 'term') {
      const payload = {
        personId: term.personId, unitId: normalize(term.unitId), positionTitle: term.positionTitle,
        rankTitle: normalize(term.rankTitle), startDate: term.startDate, endDate: term.endDate || null, notes: normalize(term.notes),
      }
      ok = editor.value ? await store.updateTerm(editor.value.id, payload) : await store.createTerm(payload)
    } else if (editor.kind === 'record') {
      const payload = {
        recordType: record.recordType as ParishRecord['recordType'], title: record.title,
        summary: normalize(record.summary), content: normalize(record.content), occurredOn: record.occurredOn,
        endedOn: record.endedOn || null, location: normalize(record.location), status: record.status as ParishRecord['status'],
        visibility: record.visibility as ParishRecord['visibility'], showOnTimeline: record.showOnTimeline,
        sourceEventId: normalize(record.sourceEventId), personIds: record.personIds, assetIds: record.assetIds,
      }
      ok = editor.value ? await store.updateRecord(editor.value.id, payload) : await store.createRecord(payload)
    } else if (editor.kind === 'asset') {
      const base = {
        assetType: asset.assetType as ParishArchiveAsset['assetType'], title: asset.title,
        description: normalize(asset.description), capturedOn: asset.capturedOn || null,
        visibility: asset.visibility as ParishArchiveAsset['visibility'], recordIds: asset.recordIds,
      }
      if (editor.value) {
        ok = await store.updateAsset(editor.value.id, base)
      } else if (asset.storageMode === 'UPLOAD') {
        if (!file) {
          addToast('Vui lòng chọn file JPEG, PNG, WebP hoặc PDF', 'error')
          return
        }
        ok = await store.uploadAsset({ ...base, file })
      } else {
        ok = await store.createExternalAsset({ ...base, externalUrl: asset.externalUrl })
      }
    }

    if (ok) {
      addToast('Đã lưu Hồ sơ Xứ đoàn', 'success')
      onClose()
    } else {
      addToast(useParishProfileStore.getState().error || 'Không thể lưu thay đổi', 'error')
    }
  }

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title={meta.title}
      icon={<Icon className="w-5 h-5" />}
      maxWidth="760px"
      closeOnOverlay={!store.isSaving}
      footer={(
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={store.isSaving}>Hủy</Button>
          <Button type="submit" form="parish-profile-editor" loading={store.isSaving} loadingLabel="Đang lưu…">Lưu thay đổi</Button>
        </div>
      )}
    >
      <form id="parish-profile-editor" className="space-y-4" onSubmit={handleSubmit}>
        {editor.kind === 'profile' && <>
          <FormField label="Tên Xứ đoàn" required><TextInput required maxLength={150} value={profile.displayName} onChange={e => setProfile({ ...profile, displayName: e.target.value })} /></FormField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Bổn mạng"><TextInput maxLength={150} value={profile.patronName} onChange={e => setProfile({ ...profile, patronName: e.target.value })} /></FormField>
            <FormField label="Ngày thành lập"><TextInput type="date" value={profile.foundedDate} onChange={e => setProfile({ ...profile, foundedDate: e.target.value })} /></FormField>
          </div>
          <FormField label="Khẩu hiệu"><TextInput maxLength={300} value={profile.motto} onChange={e => setProfile({ ...profile, motto: e.target.value })} /></FormField>
          <FormField label="Giới thiệu"><TextArea rows={6} maxLength={5000} value={profile.description} onChange={e => setProfile({ ...profile, description: e.target.value })} /></FormField>
        </>}

        {editor.kind === 'person' && <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Tên thánh"><TextInput maxLength={100} value={person.holyName} onChange={e => setPerson({ ...person, holyName: e.target.value })} /></FormField>
            <FormField label="Họ và tên" required><TextInput required maxLength={200} value={person.fullName} onChange={e => setPerson({ ...person, fullName: e.target.value })} /></FormField>
            <FormField label="Năm sinh"><TextInput type="number" min={1900} max={2100} value={person.birthYear} onChange={e => setPerson({ ...person, birthYear: e.target.value })} /></FormField>
            <FormField label="Liên kết tài khoản">
              <Select
                value={person.linkedUserId}
                onChange={e => {
                  const selectedId = e.target.value
                  const acc = snapshot.accounts.find(a => a.id === selectedId)
                  setPerson(prev => ({
                    ...prev,
                    linkedUserId: selectedId,
                    holyName: prev.holyName ? prev.holyName : (acc?.holyName || ''),
                    fullName: prev.fullName ? prev.fullName : (acc?.fullName || ''),
                  }))
                }}
              >
                <option value="">Nhân vật lịch sử, không có tài khoản</option>
                {snapshot.accounts.map(account => <option key={account.id} value={account.id}>{account.holyName ? `${account.holyName} ` : ''}{account.fullName} · {account.role}</option>)}
              </Select>
            </FormField>
            <FormField label="Trạng thái"><Select value={person.serviceStatus} onChange={e => setPerson({ ...person, serviceStatus: e.target.value as ParishPerson['serviceStatus'] })}><option value="ACTIVE">Đang phục vụ</option><option value="FORMER">Đã mãn nhiệm</option><option value="DECEASED">Đã qua đời</option></Select></FormField>
            <VisibilityField value={person.visibility} onChange={value => setPerson({ ...person, visibility: value as ParishPerson['visibility'] })} />
          </div>
          <FormField label="Tiểu sử phục vụ"><TextArea rows={5} maxLength={5000} value={person.biography} onChange={e => setPerson({ ...person, biography: e.target.value })} /></FormField>
        </>}

        {editor.kind === 'unit' && <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Tên đơn vị" required><TextInput required maxLength={200} value={unit.name} onChange={e => setUnit({ ...unit, name: e.target.value })} /></FormField>
            <FormField label="Loại đơn vị"><Select value={unit.unitType} onChange={e => setUnit({ ...unit, unitType: e.target.value as ParishOrganizationUnit['unitType'] })}><option value="BOARD">Ban Trị Sự</option><option value="COMMITTEE">Ban chuyên môn</option><option value="BRANCH">Ngành</option><option value="CHAPTER">Chi đoàn</option><option value="OTHER">Khác</option></Select></FormField>
            <FormField label="Đơn vị cấp trên"><Select value={unit.parentId} onChange={e => setUnit({ ...unit, parentId: e.target.value })}><option value="">Không có</option>{snapshot.units.filter(item => item.id !== editor.value?.id).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></FormField>
            <FormField label="Thứ tự"><TextInput type="number" min={0} max={10000} value={unit.sortOrder} onChange={e => setUnit({ ...unit, sortOrder: e.target.value })} /></FormField>
          </div>
          <FormField label="Mô tả"><TextArea rows={4} maxLength={3000} value={unit.description} onChange={e => setUnit({ ...unit, description: e.target.value })} /></FormField>
          <CheckField checked={unit.isActive} onChange={checked => setUnit({ ...unit, isActive: checked })} label="Đơn vị đang hoạt động" />
        </>}

        {editor.kind === 'term' && <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Nhân sự" required><Select required value={term.personId} onChange={e => setTerm({ ...term, personId: e.target.value })}><option value="">Chọn nhân sự</option>{snapshot.people.map(item => <option key={item.id} value={item.id}>{item.holyName ? `${item.holyName} ` : ''}{item.fullName}</option>)}</Select></FormField>
            <FormField label="Đơn vị"><Select value={term.unitId} onChange={e => setTerm({ ...term, unitId: e.target.value })}><option value="">Toàn Xứ đoàn</option>{snapshot.units.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></FormField>
            <FormField label="Chức vụ" required><TextInput required maxLength={200} value={term.positionTitle} onChange={e => setTerm({ ...term, positionTitle: e.target.value })} /></FormField>
            <FormField label="Cấp bậc"><TextInput maxLength={150} value={term.rankTitle} onChange={e => setTerm({ ...term, rankTitle: e.target.value })} /></FormField>
            <FormField label="Bắt đầu" required><TextInput required type="date" value={term.startDate} onChange={e => setTerm({ ...term, startDate: e.target.value })} /></FormField>
            <FormField label="Kết thúc"><TextInput type="date" min={term.startDate} value={term.endDate} onChange={e => setTerm({ ...term, endDate: e.target.value })} /></FormField>
          </div>
          <FormField label="Ghi chú"><TextArea rows={4} maxLength={3000} value={term.notes} onChange={e => setTerm({ ...term, notes: e.target.value })} /></FormField>
        </>}

        {editor.kind === 'record' && <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Loại bản ghi"><Select value={record.recordType} onChange={e => setRecord({ ...record, recordType: e.target.value as ParishRecord['recordType'] })}><option value="MILESTONE">Cột mốc</option><option value="ACTIVITY">Hoạt động</option><option value="ACHIEVEMENT">Thành tích</option></Select></FormField>
            <FormField label="Tiêu đề" required><TextInput required maxLength={250} value={record.title} onChange={e => setRecord({ ...record, title: e.target.value })} /></FormField>
            <FormField label="Ngày bắt đầu" required><TextInput required type="date" value={record.occurredOn} onChange={e => setRecord({ ...record, occurredOn: e.target.value })} /></FormField>
            <FormField label="Ngày kết thúc"><TextInput type="date" min={record.occurredOn} value={record.endedOn} onChange={e => setRecord({ ...record, endedOn: e.target.value })} /></FormField>
            <FormField label="Địa điểm"><TextInput maxLength={300} value={record.location} onChange={e => setRecord({ ...record, location: e.target.value })} /></FormField>
            <FormField label="Trạng thái"><Select value={record.status} onChange={e => setRecord({ ...record, status: e.target.value as ParishRecord['status'] })}><option value="DRAFT">Bản nháp</option><option value="PUBLISHED">Đã xuất bản</option><option value="ARCHIVED">Lưu trữ</option></Select></FormField>
            <VisibilityField value={record.visibility} onChange={value => setRecord({ ...record, visibility: value as ParishRecord['visibility'] })} />
            <FormField label="Mã sự kiện nguồn"><TextInput maxLength={80} value={record.sourceEventId} onChange={e => setRecord({ ...record, sourceEventId: e.target.value })} /></FormField>
          </div>
          <FormField label="Tóm tắt"><TextArea rows={3} maxLength={1000} value={record.summary} onChange={e => setRecord({ ...record, summary: e.target.value })} /></FormField>
          <FormField label="Nội dung"><TextArea rows={7} maxLength={20000} value={record.content} onChange={e => setRecord({ ...record, content: e.target.value })} /></FormField>
          <CheckField checked={record.showOnTimeline} onChange={checked => setRecord({ ...record, showOnTimeline: checked })} label="Hiển thị trên Timeline Xứ đoàn" />
          <LinkPicker title="Nhân sự liên quan" items={snapshot.people.map(item => ({ id: item.id, label: item.fullName }))} selected={record.personIds} onToggle={id => setRecord({ ...record, personIds: toggleId(record.personIds, id) })} />
          <LinkPicker title="Tư liệu liên quan" items={snapshot.assets.map(item => ({ id: item.id, label: item.title }))} selected={record.assetIds} onToggle={id => setRecord({ ...record, assetIds: toggleId(record.assetIds, id) })} />
        </>}

        {editor.kind === 'asset' && <>
          {!editor.value && <FormField label="Nguồn tư liệu"><Select value={asset.storageMode} onChange={e => setAsset({ ...asset, storageMode: e.target.value as 'EXTERNAL' | 'UPLOAD' })}><option value="EXTERNAL">Liên kết HTTPS</option><option value="UPLOAD">Tải ảnh/PDF lên</option></Select></FormField>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Loại tư liệu"><Select value={asset.assetType} onChange={e => setAsset({ ...asset, assetType: e.target.value as ParishArchiveAsset['assetType'] })}><option value="IMAGE">Ảnh</option><option value="VIDEO">Video</option><option value="POSTER">Poster</option><option value="DOCUMENT">Tài liệu</option><option value="MINUTES">Biên bản</option><option value="CERTIFICATE">Giấy khen</option><option value="OTHER">Khác</option></Select></FormField>
            <FormField label="Tiêu đề" required><TextInput required maxLength={250} value={asset.title} onChange={e => setAsset({ ...asset, title: e.target.value })} /></FormField>
            <FormField label="Ngày tư liệu"><TextInput type="date" value={asset.capturedOn} onChange={e => setAsset({ ...asset, capturedOn: e.target.value })} /></FormField>
            <VisibilityField value={asset.visibility} onChange={value => setAsset({ ...asset, visibility: value as ParishArchiveAsset['visibility'] })} />
          </div>
          <FormField label="Mô tả"><TextArea rows={4} maxLength={3000} value={asset.description} onChange={e => setAsset({ ...asset, description: e.target.value })} /></FormField>
          {!editor.value && asset.storageMode === 'EXTERNAL' && <FormField label="Liên kết HTTPS" required><TextInput required type="url" maxLength={1500} placeholder="https://…" value={asset.externalUrl} onChange={e => setAsset({ ...asset, externalUrl: e.target.value })} /></FormField>}
          {!editor.value && asset.storageMode === 'UPLOAD' && <FormField label="File JPEG, PNG, WebP hoặc PDF — tối đa 8 MiB" required><TextInput required type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e => setFile(e.target.files?.[0] ?? null)} /></FormField>}
          {editor.value && <p className="typography-body-sm text-text-muted">Không thay thế file hoặc URL khi sửa metadata. Hãy tạo tư liệu mới nếu nguồn thay đổi.</p>}
          <LinkPicker title="Liên kết với bản ghi" items={snapshot.records.map(item => ({ id: item.id, label: item.title }))} selected={asset.recordIds} onToggle={id => setAsset({ ...asset, recordIds: toggleId(asset.recordIds, id) })} />
        </>}
      </form>
    </ModalShell>
  )
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <label className="form-group"><span className="form-label">{label}{required ? ' *' : ''}</span>{children}</label>
}

function VisibilityField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <FormField label="Phạm vi xem"><Select value={value} onChange={e => onChange(e.target.value)}><option value="STAFF">Nhân sự Xứ đoàn</option><option value="ADMIN">Chỉ Admin</option></Select></FormField>
}

function CheckField({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return <label className="flex min-h-11 items-center gap-3 rounded-lg border border-surface-border bg-surface-card px-3 py-2"><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} /><span className="typography-body-sm text-text-main">{label}</span></label>
}

function LinkPicker({ title, items, selected, onToggle }: { title: string; items: Array<{ id: string; label: string }>; selected: string[]; onToggle: (id: string) => void }) {
  if (items.length === 0) return null
  return <fieldset className="rounded-xl border border-surface-border p-3"><legend className="form-label px-1">{title}</legend><div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto">{items.map(item => <label key={item.id} className="flex min-h-11 items-center gap-2 rounded-lg bg-surface-sunken px-3 py-2"><input type="checkbox" checked={selected.includes(item.id)} onChange={() => onToggle(item.id)} /><span className="typography-body-sm text-text-main">{item.label}</span></label>)}</div></fieldset>
}
