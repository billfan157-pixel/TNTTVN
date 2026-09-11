import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Award,
  Calendar,
  CheckCircle2,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FileText,
  Film,
  FolderArchive,
  Globe,
  Image as ImageIcon,
  Info,
  Lock,
  Palette,
  Search,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react'
import { ModalShell } from '../common/ModalShell'
import { NoResultState } from '../common/StateFeedback'
import { Badge, Button, Select, Surface, TextArea, TextInput } from '../common/ui'
import { useParishProfileStore } from '../../stores/parishProfileStore'
import { useToastStore } from '../../stores/toastStore'
import type {
  ParishArchiveAsset,
  ParishAssetType,
  ParishProfileSnapshot,
  ParishVisibility,
} from '../../types/parishProfile'

export interface ParishAssetModalProps {
  asset?: ParishArchiveAsset
  initialStorageMode?: 'UPLOAD' | 'EXTERNAL'
  initialAssetType?: ParishAssetType
  snapshot: ParishProfileSnapshot
  onClose: () => void
  onSuccess?: () => void
}

const MAX_FILE_SIZE = 8 * 1024 * 1024 // 8 MiB
const today = () => new Date().toISOString().slice(0, 10)

function getLastSunday(): string {
  const d = new Date()
  const day = d.getDay()
  d.setDate(d.getDate() - day)
  return d.toISOString().slice(0, 10)
}

function normalize(value: string): string | null {
  return value.trim() || null
}

const ASSET_TYPE_CONFIG: Record<
  ParishAssetType,
  { label: string; icon: React.ComponentType<{ className?: string }>; description: string }
> = {
  IMAGE: { label: 'Ảnh tư liệu', icon: ImageIcon, description: 'Ảnh sinh hoạt, thánh lễ, lễ bổn mạng, sa mạc' },
  POSTER: { label: 'Poster / Banner', icon: Palette, description: 'Ấn phẩm truyền thông, biểu trưng, phông nền sự kiện' },
  DOCUMENT: { label: 'Tài liệu', icon: FileText, description: 'Giáo trình, tài liệu huấn luyện GLV, thư luân lưu' },
  MINUTES: { label: 'Biên bản', icon: FileSpreadsheet, description: 'Biên bản phiên họp BĐH, biên bản bàn giao, kiểm toán' },
  CERTIFICATE: { label: 'Giấy chứng nhận', icon: Award, description: 'Chứng chỉ thăng cấp, giấy khen, thư cảm ơn' },
  VIDEO: { label: 'Video', icon: Film, description: 'Phóng sự, clip tóm tắt hoạt động, video tài liệu' },
  OTHER: { label: 'Tư liệu khác', icon: FolderArchive, description: 'Các định dạng lưu trữ tư liệu bổ sung khác' },
}

const ASSET_TYPES: ParishAssetType[] = [
  'IMAGE',
  'POSTER',
  'DOCUMENT',
  'MINUTES',
  'CERTIFICATE',
  'VIDEO',
  'OTHER',
]

interface SelectedFileItem {
  id: string
  file: File
  previewUrl: string | null
  isOversized: boolean
}

export function ParishAssetModal({
  asset,
  initialStorageMode = 'UPLOAD',
  initialAssetType = 'IMAGE',
  snapshot,
  onClose,
  onSuccess,
}: ParishAssetModalProps) {
  const store = useParishProfileStore()
  const addToast = useToastStore(state => state.addToast)
  const isEditing = Boolean(asset?.id)

  // Storage mode
  const [storageMode, setStorageMode] = useState<'UPLOAD' | 'EXTERNAL'>(
    asset ? asset.storageType : initialStorageMode,
  )

  // Asset Form State
  const [assetType, setAssetType] = useState<ParishAssetType>(
    asset?.assetType ?? initialAssetType,
  )
  const [title, setTitle] = useState(asset?.title ?? '')
  const [description, setDescription] = useState(asset?.description ?? '')
  const [capturedOn, setCapturedOn] = useState(asset?.capturedOn ?? today())
  const [visibility, setVisibility] = useState<ParishVisibility>(
    asset?.visibility ?? 'STAFF',
  )
  const [externalUrl, setExternalUrl] = useState(asset?.externalUrl ?? '')

  // Linked records
  const initialLinkedRecords = useMemo(() => {
    if (!asset?.id) return []
    return snapshot.records.filter(r => r.assetIds.includes(asset.id)).map(r => r.id)
  }, [asset?.id, snapshot.records])
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>(initialLinkedRecords)
  const [recordSearch, setRecordSearch] = useState('')

  // Files state & Dropzone
  const [selectedFiles, setSelectedFiles] = useState<SelectedFileItem[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Upload progress
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null)

  const titleHelpId = useId()

  const previewUrls = useRef(new Set<string>())
  useEffect(() => {
    const retained = new Set(selectedFiles.flatMap(item => item.previewUrl ? [item.previewUrl] : []))
    for (const url of previewUrls.current) {
      if (!retained.has(url)) URL.revokeObjectURL(url)
    }
    previewUrls.current = retained
  }, [selectedFiles])
  useEffect(() => () => {
    for (const url of previewUrls.current) URL.revokeObjectURL(url)
    previewUrls.current.clear()
  }, [])

  // Smart detection for external URL
  const handleExternalUrlChange = (url: string) => {
    setExternalUrl(url)
    const lower = url.toLowerCase()
    if (lower.includes('youtube.com') || lower.includes('youtu.be') || lower.includes('vimeo.com') || lower.endsWith('.mp4')) {
      setAssetType('VIDEO')
    } else if (lower.endsWith('.pdf') || lower.includes('drive.google.com') || lower.includes('docs.google.com')) {
      setAssetType('DOCUMENT')
    }
  }

  // Handle adding new files
  const addFiles = (newFiles: File[]) => {
    if (newFiles.length === 0) return

    // Smart auto-detect asset type from first file if not already explicitly customized
    const first = newFiles[0]
    if (first) {
      if (first.type.startsWith('image/')) {
        if (assetType !== 'POSTER' && assetType !== 'IMAGE') {
          setAssetType('IMAGE')
        }
      } else if (first.type === 'application/pdf') {
        if (assetType !== 'MINUTES' && assetType !== 'DOCUMENT') {
          setAssetType('DOCUMENT')
        }
      }
    }

    const existingKey = new Set(selectedFiles.map(item => `${item.file.name}-${item.file.size}`))
    const uniqueFiles = newFiles.filter(file => {
      const key = `${file.name}-${file.size}`
      if (existingKey.has(key)) return false
      existingKey.add(key)
      return true
    })
    const items: SelectedFileItem[] = uniqueFiles.map(file => {
      const isImage = file.type.startsWith('image/')
      const previewUrl = isImage ? URL.createObjectURL(file) : null
      return {
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        file,
        previewUrl,
        isOversized: file.size > MAX_FILE_SIZE,
      }
    })

    setSelectedFiles(prev => [...prev, ...items])
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(Array.from(e.target.files))
    }
    e.target.value = ''
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(Array.from(e.dataTransfer.files))
    }
  }

  const removeFile = (id: string) => {
    setSelectedFiles(prev => prev.filter(f => f.id !== id))
  }

  const clearAllFiles = () => {
    setSelectedFiles([])
  }

  // Total file size
  const totalSizeBytes = useMemo(
    () => selectedFiles.reduce((acc, f) => acc + f.file.size, 0),
    [selectedFiles],
  )
  const hasOversizedFiles = useMemo(
    () => selectedFiles.some(f => f.isOversized),
    [selectedFiles],
  )

  // Filtered records for link picker
  const filteredRecords = useMemo(() => {
    const q = recordSearch.trim().toLowerCase()
    if (!q) return snapshot.records
    return snapshot.records.filter(r => r.title.toLowerCase().includes(q) || (r.summary && r.summary.toLowerCase().includes(q)))
  }, [snapshot.records, recordSearch])

  const toggleRecordLink = (id: string) => {
    setSelectedRecordIds(prev => (prev.includes(id) ? prev.filter(rId => rId !== id) : [...prev, id]))
  }

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const base = {
      assetType,
      description: normalize(description),
      capturedOn: capturedOn || null,
      visibility,
      recordIds: selectedRecordIds,
    }

    let success = false

    if (isEditing && asset) {
      if (!title.trim()) {
        addToast('Vui lòng nhập tiêu đề tư liệu', 'error')
        return
      }
      success = await store.updateAsset(asset.id, {
        ...base,
        title: title.trim(),
      })
    } else if (storageMode === 'UPLOAD') {
      if (selectedFiles.length === 0) {
        addToast('Vui lòng chọn ít nhất một tệp hình ảnh hoặc tài liệu', 'error')
        return
      }
      if (hasOversizedFiles) {
        addToast('Có tệp vượt quá giới hạn 8 MiB, vui lòng loại bỏ trước khi tải lên', 'error')
        return
      }

      const inputs = selectedFiles.map((item, idx) => {
        const cleanBaseName = item.file.name.replace(/\.[^/.]+$/, '').trim() || item.file.name
        const finalTitle = title.trim()
          ? selectedFiles.length > 1
            ? `${title.trim()} (${idx + 1})`
            : title.trim()
          : cleanBaseName

        return {
          ...base,
          title: finalTitle,
          file: item.file,
        }
      })

      setUploadProgress({ current: 0, total: selectedFiles.length })
      let uploaded = 0
      success = await store.uploadAssets(inputs, (current, total) => {
        uploaded = current
        setUploadProgress({ current, total })
      })
      if (!success && uploaded > 0) {
        setSelectedFiles(files => files.slice(uploaded))
      }
      setUploadProgress(null)
    } else {
      if (!title.trim()) {
        addToast('Vui lòng nhập tiêu đề tư liệu', 'error')
        return
      }
      if (!externalUrl.trim()) {
        addToast('Vui lòng nhập liên kết HTTPS', 'error')
        return
      }
      try {
        const parsed = new URL(externalUrl.trim())
        if (parsed.protocol !== 'https:') {
          addToast('Liên kết tư liệu bắt buộc phải sử dụng giao thức HTTPS bảo mật', 'error')
          return
        }
      } catch {
        addToast('Địa chỉ liên kết không hợp lệ', 'error')
        return
      }

      success = await store.createExternalAsset({
        ...base,
        title: title.trim(),
        externalUrl: externalUrl.trim(),
      })
    }

    if (success) {
      if (!isEditing && storageMode === 'UPLOAD' && selectedFiles.length > 1) {
        addToast(`Đã tải lên thành công ${selectedFiles.length} tư liệu vào kho Xứ đoàn`, 'success')
      } else {
        addToast(isEditing ? 'Đã cập nhật thông tin tư liệu' : 'Đã thêm tư liệu vào kho Xứ đoàn', 'success')
      }
      onSuccess?.()
      onClose()
    } else {
      addToast(useParishProfileStore.getState().error || 'Không thể lưu tư liệu xứ đoàn', 'error')
    }
  }

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title={isEditing ? 'Chỉnh Sửa Tư Liệu Xứ Đoàn' : 'Thêm Tư Liệu Xứ Đoàn Mới'}
      subtitle="Lưu trữ hình ảnh, poster, video và tài liệu văn thư lịch sử của Xứ đoàn."
      icon={<FolderArchive className="w-5 h-5 text-parish-primary" />}
      maxWidth="780px"
      footer={(
        <div className="flex items-center justify-between w-full">
          <div className="text-xs text-text-muted hidden sm:flex items-center gap-2">
            {!isEditing && storageMode === 'UPLOAD' && selectedFiles.length > 0 && (
              <span>Dung lượng tệp: {(totalSizeBytes / (1024 * 1024)).toFixed(2)} MB</span>
            )}
            {isEditing && <span>Mã tư liệu: {asset?.id}</span>}
          </div>
          <div className="flex items-center gap-2.5 ml-auto">
            <Button
              type="button"
              variant="secondary"
              size="md"
              disabled={store.isSaving}
              onClick={onClose}
            >
              Hủy bỏ
            </Button>
            <Button
              type="submit"
              form="parish-asset-modal-form"
              variant="primary"
              size="md"
              loading={store.isSaving}
              leadingIcon={<CheckCircle2 className="w-4 h-4" />}
            >
              {isEditing
                ? 'Lưu thay đổi'
                : storageMode === 'UPLOAD' && selectedFiles.length > 1
                  ? `Tải lên ${selectedFiles.length} tệp`
                  : 'Lưu tư liệu'}
            </Button>
          </div>
        </div>
      )}
    >
      <form id="parish-asset-modal-form" noValidate onSubmit={handleSubmit} className="space-y-6 pb-2">
        {/* Nguồn tư liệu (Segmented Control - chỉ khi thêm mới) */}
        {!isEditing && (
          <div className="p-1 rounded-xl bg-surface-sunken border border-surface-border flex items-center gap-1">
            <button
              type="button"
              onClick={() => setStorageMode('UPLOAD')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-colors ${
                storageMode === 'UPLOAD'
                  ? 'bg-surface-card text-parish-primary shadow-sm border border-surface-border'
                  : 'text-text-muted hover:text-text-main'
              }`}
            >
              <UploadCloud className="w-4 h-4" />
              <span>Tải tệp từ máy (Ảnh, PDF — Hỗ trợ nhiều tệp)</span>
            </button>
            <button
              type="button"
              onClick={() => setStorageMode('EXTERNAL')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-colors ${
                storageMode === 'EXTERNAL'
                  ? 'bg-surface-card text-parish-primary shadow-sm border border-surface-border'
                  : 'text-text-muted hover:text-text-main'
              }`}
            >
              <Globe className="w-4 h-4" />
              <span>Liên kết ngoài (YouTube, Cloud Drive, HTTPS)</span>
            </button>
          </div>
        )}

        {/* Thanh tiến trình tải lên khi đang thực hiện batch upload */}
        {uploadProgress && (
          <div className="p-3.5 rounded-xl border border-parish-primary/30 bg-parish-primary-light/40 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-parish-primary">
              <span className="flex items-center gap-1.5">
                <UploadCloud className="w-4 h-4 animate-bounce" />
                Đang tải lên tư liệu vào máy chủ...
              </span>
              <span>
                {uploadProgress.current} / {uploadProgress.total} tệp ({Math.round((uploadProgress.current / uploadProgress.total) * 100)}%)
              </span>
            </div>
            <div className="w-full bg-surface-border h-2 rounded-full overflow-hidden">
              <div
                className="bg-parish-primary h-full transition-colors duration-300"
                style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* KHỐI 1: TẬP TIN HOẶC LIÊN KẾT NGOÀI */}
        {!isEditing && storageMode === 'UPLOAD' && (
          <Surface variant="card" className="p-4 sm:p-5 rounded-2xl border border-surface-border space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-parish-primary/10 text-parish-primary flex items-center justify-center">
                  <UploadCloud className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-text-main m-0">1. Chọn & Kéo Thả Tệp</h3>
              </div>
              {selectedFiles.length > 0 && (
                <button
                  type="button"
                  onClick={clearAllFiles}
                  className="typography-body-sm text-text-muted hover:text-parish-danger flex items-center gap-1 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Xóa tất cả
                </button>
              )}
            </div>

            {/* Drag & Drop Zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-colors flex flex-col items-center justify-center gap-2 ${
                isDragging
                  ? 'border-parish-primary bg-parish-primary/5 scale-[0.99]'
                  : 'border-surface-border hover:border-parish-primary/60 bg-surface-sunken hover:bg-surface-card'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="hidden"
                onChange={handleFileInputChange}
              />
              <div className="w-12 h-12 rounded-full bg-parish-primary/10 text-parish-primary flex items-center justify-center mb-1">
                <UploadCloud className="w-6 h-6" />
              </div>
              <div className="text-sm font-bold text-text-main">
                Kéo thả các tệp tư liệu vào đây hoặc <span className="text-parish-primary underline">bấm để chọn</span>
              </div>
              <div className="typography-body-sm text-text-muted max-w-md">
                Hỗ trợ ảnh JPG, PNG, WebP hoặc tài liệu PDF. Dung lượng tối đa <span className="font-semibold text-text-main">8 MiB</span> mỗi tệp.
              </div>
            </div>

            {/* Danh sách tệp đã chọn với preview */}
            {selectedFiles.length > 0 && (
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between text-xs font-bold text-text-secondary">
                  <span>Đã chọn {selectedFiles.length} tệp (tổng {(totalSizeBytes / (1024 * 1024)).toFixed(2)} MB):</span>
                  <span>Tổng dung lượng: {(totalSizeBytes / (1024 * 1024)).toFixed(2)} MB</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto p-1">
                  {selectedFiles.map(item => (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between gap-2.5 p-2 rounded-xl border transition-colors ${
                        item.isOversized
                          ? 'bg-parish-danger/10 border-parish-danger text-parish-danger'
                          : 'bg-surface-sunken border-surface-border text-text-main'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {item.previewUrl ? (
                          <img
                            src={item.previewUrl}
                            alt={item.file.name}
                            className="w-10 h-10 rounded-lg object-cover border border-surface-border shrink-0 bg-surface-card"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-surface-card border border-surface-border flex items-center justify-center shrink-0 text-text-muted">
                            <FileText className="w-5 h-5" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-semibold truncate" title={item.file.name}>
                            {item.file.name}
                          </div>
                          <div className="typography-body-sm text-text-muted flex items-center gap-1.5 mt-0.5">
                            <span className="uppercase font-mono">{item.file.name.split('.').pop()}</span>
                            <span>•</span>
                            <span className={item.isOversized ? 'font-bold text-parish-danger' : ''}>
                              {(item.file.size / 1024).toFixed(0)} KB {item.isOversized ? '(Vượt 8MB)' : ''}
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeFile(item.id)}
                        className="btn btn-ghost btn-sm btn-icon mobile-touch-target text-text-muted hover:text-parish-danger shrink-0"
                        title="Bỏ tệp này"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>

                {hasOversizedFiles && (
                  <div className="p-3 rounded-xl bg-parish-danger/10 border border-parish-danger/30 text-parish-danger text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Một số tệp vượt quá 8 MiB cho phép. Vui lòng bấm bỏ các tệp này để có thể lưu.</span>
                  </div>
                )}
              </div>
            )}
          </Surface>
        )}

        {/* Khối xem trước tư liệu cũ khi đang sửa */}
        {isEditing && asset && (
          <Surface variant="card" className="p-4 sm:p-5 rounded-2xl border border-surface-border space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-parish-primary/10 text-parish-primary flex items-center justify-center">
                  <Eye className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-text-main m-0">Tư Liệu Hiện Tại</h3>
              </div>
              <Badge tone="neutral">
                {asset.storageType === 'UPLOAD' ? 'Lưu trữ tệp' : 'Liên kết ngoài'}
              </Badge>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-sunken border border-surface-border">
              {asset.assetType === 'IMAGE' || asset.assetType === 'POSTER' ? (
                <div className="w-14 h-14 rounded-xl bg-surface-card border border-surface-border overflow-hidden shrink-0 flex items-center justify-center">
                  {asset.externalUrl ? (
                    <img src={asset.externalUrl} alt={asset.title} className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon className="w-6 h-6 text-parish-primary" />
                  )}
                </div>
              ) : (
                <div className="w-14 h-14 rounded-xl bg-surface-card border border-surface-border flex items-center justify-center shrink-0 text-parish-primary">
                  <FileText className="w-6 h-6" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-text-main truncate">{asset.title}</div>
                <div className="typography-body-sm text-text-muted mt-0.5">
                  Định dạng: {asset.mimeType || asset.originalFilename?.split('.').pop() || 'Không rõ'} • Dung lượng: {asset.sizeBytes ? `${(asset.sizeBytes / 1024).toFixed(0)} KB` : 'Ngoại vi'}
                </div>
                {asset.externalUrl && (
                  <a
                    href={asset.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="typography-body-sm text-parish-primary hover:underline flex items-center gap-1 mt-0.5 truncate"
                  >
                    <span>{asset.externalUrl}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                )}
              </div>
            </div>
            <p className="typography-body-sm text-text-muted m-0">
              * Không thay đổi file binary hoặc liên kết khi sửa metadata. Nếu muốn đổi file, vui lòng thêm tư liệu mới.
            </p>
          </Surface>
        )}

        {/* Khối nhập URL ngoài */}
        {!isEditing && storageMode === 'EXTERNAL' && (
          <Surface variant="card" className="p-4 sm:p-5 rounded-2xl border border-surface-border space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-parish-primary/10 text-parish-primary flex items-center justify-center">
                <Globe className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-text-main m-0">1. Liên Kết Tư Liệu Ngoại Vi</h3>
            </div>

            <label className="form-group">
              <span className="form-label">Địa chỉ liên kết HTTPS *</span>
              <TextInput
                required
                type="url"
                maxLength={1500}
                placeholder="https://www.youtube.com/watch?v=... hoặc https://drive.google.com/..."
                value={externalUrl}
                onChange={e => handleExternalUrlChange(e.target.value)}
                className="w-full text-sm font-mono"
              />
              <span className="typography-body-sm text-text-muted mt-1">
                Hệ thống tự động nhận diện nếu liên kết dẫn đến YouTube, Vimeo hoặc tài liệu Google Docs/PDF.
              </span>
            </label>
          </Surface>
        )}

        {/* KHỐI 2: PHÂN LOẠI TƯ LIỆU */}
        <Surface variant="card" className="p-4 sm:p-5 rounded-2xl border border-surface-border space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-parish-teal/10 text-parish-teal flex items-center justify-center">
              <Palette className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-text-main m-0">2. Phân Loại Tư Liệu</h3>
          </div>

          {/* Chips chọn loại tư liệu trực quan */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {ASSET_TYPES.map(type => {
              const cfg = ASSET_TYPE_CONFIG[type]
              const Icon = cfg.icon
              const isSelected = assetType === type
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setAssetType(type)}
                  className={`flex flex-col items-start p-3 rounded-xl border text-left transition-colors ${
                    isSelected
                      ? 'bg-parish-primary text-white border-parish-primary shadow-sm'
                      : 'bg-surface-sunken hover:bg-surface-card border-surface-border text-text-main'
                  }`}
                >
                  <div className="flex items-center gap-1.5 w-full">
                    <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-white' : 'text-parish-primary'}`} />
                    <span className="text-xs font-bold truncate">{cfg.label}</span>
                  </div>
                  <span className={`typography-body-sm mt-1 line-clamp-1 ${isSelected ? 'text-white/80' : 'text-text-muted'}`}>
                    {cfg.description}
                  </span>
                </button>
              )
            })}
          </div>
        </Surface>

        {/* KHỐI 3: THÔNG TIN CHI TIẾT & BẢO MẬT */}
        <Surface variant="card" className="p-4 sm:p-5 rounded-2xl border border-surface-border space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-parish-indigo/10 text-parish-indigo flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-text-main m-0">3. Thông Tin Chi Tiết & Bảo Mật</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Tiêu đề */}
            <div className="sm:col-span-2">
              <label className="form-group">
                <span className="form-label">
                  {selectedFiles.length > 1 ? 'Tiêu đề chung (tiền tố)' : 'Tiêu đề *'}
                </span>
                <TextInput
                  required={isEditing || storageMode === 'EXTERNAL' || selectedFiles.length <= 1}
                  maxLength={250}
                  value={title}
                  placeholder={
                    selectedFiles.length > 1
                      ? 'Ví dụ: Lễ Bổn Mạng Xứ Đoàn 2026 (để trống sẽ dùng tên gốc của từng tệp)'
                      : 'Nhập tên hoặc tiêu đề ngắn gọn của tư liệu...'
                  }
                  onChange={e => setTitle(e.target.value)}
                  className="w-full text-sm"
                  aria-describedby={selectedFiles.length > 1 ? titleHelpId : undefined}
                />
              </label>
              {selectedFiles.length > 1 && (
                <p id={titleHelpId} className="typography-body-sm text-text-muted mt-1 m-0">
                  Khi tải lên {selectedFiles.length} tệp, hệ thống sẽ lưu thành: &ldquo;{title.trim() || 'Tên-tệp'} (1)&rdquo;, &ldquo;{title.trim() || 'Tên-tệp'} (2)&rdquo;...
                </p>
              )}
            </div>

            {/* Ngày ghi hình / phát hành */}
            <label className="form-group sm:col-span-1">
              <span className="form-label flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-text-muted" />
                  Ngày ghi hình / phát hành
                </span>
              </span>
              <TextInput
                type="date"
                value={capturedOn}
                onChange={e => setCapturedOn(e.target.value)}
                className="w-full text-sm"
              />
              <div className="flex items-center gap-2 mt-1.5">
                <button
                  type="button"
                  onClick={() => setCapturedOn(today())}
                  className="typography-body-sm text-parish-primary hover:underline"
                >
                  Hôm nay
                </button>
                <span className="typography-body-sm text-text-muted">•</span>
                <button
                  type="button"
                  onClick={() => setCapturedOn(getLastSunday())}
                  className="typography-body-sm text-parish-primary hover:underline"
                >
                  Chủ nhật vừa qua
                </button>
              </div>
            </label>

            {/* Phạm vi bảo mật */}
            <label className="form-group sm:col-span-1">
              <span className="form-label flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-text-muted" />
                Phạm vi hiển thị
              </span>
              <Select
                value={visibility}
                onChange={e => setVisibility(e.target.value as ParishVisibility)}
                className="w-full text-sm"
              >
                <option value="STAFF">Nhân sự Xứ đoàn (Huynh trưởng / GLV)</option>
                <option value="ADMIN">Chỉ Ban Quản Trị (Admin tối cao)</option>
              </Select>
              <span className="typography-body-sm text-text-muted mt-1">
                {visibility === 'STAFF'
                  ? 'Mọi Huynh trưởng và Giáo lý viên đều có thể xem tư liệu này.'
                  : 'Chỉ các tài khoản có quyền Admin mới có thể truy cập và xem.'}
              </span>
            </label>

            {/* Mô tả tư liệu */}
            <label className="form-group sm:col-span-2">
              <span className="form-label">Mô tả nội dung / Ghi chú ngữ cảnh</span>
              <TextArea
                rows={3}
                maxLength={3000}
                value={description}
                placeholder="Ghi chú chi tiết về thời gian, địa điểm, sự kiện hoặc các nhân sự xuất hiện trong tư liệu..."
                onChange={e => setDescription(e.target.value)}
                className="w-full text-sm"
              />
            </label>
          </div>
        </Surface>

        {/* KHỐI 4: LIÊN KẾT VỚI CỘT MỐC & SỰ KIỆN XỨ ĐOÀN */}
        {snapshot.records.length > 0 && (
          <Surface variant="card" className="p-4 sm:p-5 rounded-2xl border border-surface-border space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-parish-primary/10 text-parish-primary flex items-center justify-center">
                  <Info className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-text-main m-0">4. Liên Kết Cột Mốc & Bản Ghi Lịch Sử</h3>
              </div>
              <span className="typography-body-sm text-text-muted">
                Đã chọn: {selectedRecordIds.length} bản ghi
              </span>
            </div>

            {/* Tìm kiếm bản ghi liên quan */}
            <div className="relative">
              <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <TextInput
                type="search"
                value={recordSearch}
                onChange={e => setRecordSearch(e.target.value)}
                placeholder="Tìm cột mốc, sự kiện hoặc thành tích..."
                className="pl-9 text-xs"
              />
            </div>

            {/* Danh sách bản ghi */}
            <div className="max-h-40 overflow-y-auto space-y-1.5 p-1 rounded-xl bg-surface-sunken border border-surface-border">
              {filteredRecords.length === 0 ? (
                <NoResultState
                  className="!py-4 !px-2"
                  title="Không tìm thấy bản ghi"
                  description="Thử tìm kiếm với từ khóa tiêu đề hoặc tóm tắt khác."
                  resetLabel="Xóa tìm kiếm"
                  onReset={() => setRecordSearch('')}
                />
              ) : (
                filteredRecords.map(rec => {
                  const isChecked = selectedRecordIds.includes(rec.id)
                  return (
                    <label
                      key={rec.id}
                      className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                        isChecked
                          ? 'bg-parish-primary/10 border border-parish-primary/30 text-text-main'
                          : 'bg-surface-card border border-surface-border hover:bg-surface-hover text-text-main'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleRecordLink(rec.id)}
                        className="rounded border-surface-border text-parish-primary focus:ring-parish-primary"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold truncate">{rec.title}</div>
                        <div className="typography-body-sm text-text-muted truncate">
                          {rec.occurredOn} {rec.location ? `• ${rec.location}` : ''}
                        </div>
                      </div>
                    </label>
                  )
                })
              )}
            </div>
          </Surface>
        )}
      </form>
    </ModalShell>
  )
}
