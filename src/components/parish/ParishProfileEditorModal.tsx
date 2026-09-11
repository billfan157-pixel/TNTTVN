import { useState } from 'react'
import { Archive, Building2, CalendarRange, FileClock, Landmark, UserRound } from 'lucide-react'
import { ModalShell } from '../common/ModalShell'
import { Button, TextArea, TextInput } from '../common/ui'
import { useParishProfileStore } from '../../stores/parishProfileStore'
import { useToastStore } from '../../stores/toastStore'
import { ParishServiceTermModal } from './ParishServiceTermModal'
import { ParishPersonModal } from './ParishPersonModal'
import { ParishAssetModal } from './ParishAssetModal'
import { ParishRecordModal } from './ParishRecordModal'
import { ParishUnitModal } from './ParishUnitModal'
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
  | { kind: 'asset'; value?: ParishArchiveAsset; initialStorageMode?: 'UPLOAD' | 'EXTERNAL'; initialAssetType?: ParishArchiveAsset['assetType'] }

interface Props {
  editor: ParishEditorRequest
  snapshot: ParishProfileSnapshot
  onClose: () => void
}

const normalize = (value: string) => value.trim() || null

const modalMeta = {
  profile: { title: 'Thông Tin Xứ Đoàn', icon: Landmark },
  person: { title: 'Hồ Sơ Huynh Trưởng / GLV', icon: UserRound },
  unit: { title: 'Đơn Vị Tổ Chức', icon: Building2 },
  term: { title: 'Nhiệm Kỳ Phục Vụ', icon: CalendarRange },
  record: { title: 'Bản Ghi Xứ Đoàn', icon: FileClock },
  asset: { title: 'Tư Liệu Xứ Đoàn', icon: Archive },
} as const

export function ParishProfileEditorModal(props: Props) {
  if (props.editor.kind === 'person') {
    return (
      <ParishPersonModal
        person={props.editor.value}
        snapshot={props.snapshot}
        onClose={props.onClose}
      />
    )
  }

  if (props.editor.kind === 'term') {
    return (
      <ParishServiceTermModal
        term={props.editor.value}
        initialPersonId={props.editor.personId}
        initialUnitId={props.editor.unitId}
        snapshot={props.snapshot}
        onClose={props.onClose}
      />
    )
  }

  if (props.editor.kind === 'asset') {
    return (
      <ParishAssetModal
        asset={props.editor.value}
        initialStorageMode={props.editor.initialStorageMode}
        initialAssetType={props.editor.initialAssetType}
        snapshot={props.snapshot}
        onClose={props.onClose}
      />
    )
  }

  if (props.editor.kind === 'unit') {
    return (
      <ParishUnitModal
        unit={props.editor.value}
        initialParentId={props.editor.parentId}
        snapshot={props.snapshot}
        onClose={props.onClose}
      />
    )
  }

  if (props.editor.kind === 'record') {
    return (
      <ParishRecordModal
        record={props.editor.value}
        initialRecordType={props.editor.recordType}
        snapshot={props.snapshot}
        onClose={props.onClose}
      />
    )
  }

  return <GenericParishProfileEditorModal {...props} />
}

function GenericParishProfileEditorModal({ editor, snapshot, onClose }: Props) {
  const store = useParishProfileStore()
  const addToast = useToastStore(state => state.addToast)
  const meta = modalMeta[editor.kind]
  const Icon = meta.icon

  const [profile, setProfile] = useState({
    displayName: snapshot.profile.displayName,
    patronName: snapshot.profile.patronName ?? '',
    foundedDate: snapshot.profile.foundedDate ?? '',
    motto: snapshot.profile.motto ?? '',
    description: snapshot.profile.description ?? '',
  })

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    let ok = false
    if (editor.kind === 'profile') {
      ok = await store.saveProfile({
        displayName: profile.displayName, patronName: normalize(profile.patronName),
        foundedDate: profile.foundedDate || null, motto: normalize(profile.motto), description: normalize(profile.description),
      })
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
          <Button
            type="submit"
            form="parish-profile-editor"
            loading={store.isSaving}
            loadingLabel="Đang lưu…"
          >
            Lưu thay đổi
          </Button>
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
      </form>
    </ModalShell>
  )
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <label className="form-group"><span className="form-label">{label}{required ? ' *' : ''}</span>{children}</label>
}
