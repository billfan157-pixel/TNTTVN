import { useEffect, useState } from 'react'
import { Calendar, Download, ExternalLink, Image as ImageIcon, Loader2 } from 'lucide-react'
import { ModalShell } from '../common/ModalShell'
import { Button, Badge } from '../common/ui'
import { api } from '../../lib/api'
import type { ParishArchiveAsset } from '../../types/parishProfile'

interface Props {
  asset: ParishArchiveAsset
  onClose: () => void
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Chưa cập nhật'
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${value.slice(0, 10)}T00:00:00Z`))
}

export function ParishAssetLightboxModal({ asset, onClose }: Props) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(asset.storageType === 'UPLOAD')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    let createdUrl: string | null = null
    if (asset.storageType === 'UPLOAD') {
      setLoading(true)
      api.parishProfile.downloadAsset(asset.id)
        .then(blob => {
          if (active) {
            createdUrl = URL.createObjectURL(blob)
            setBlobUrl(createdUrl)
            setLoading(false)
          }
        })
        .catch(err => {
          if (active) {
            setError(err instanceof Error ? err.message : 'Không thể tải ảnh')
            setLoading(false)
          }
        })
    }
    return () => {
      active = false
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl)
      }
    }
  }, [asset.id, asset.storageType])

  const imageUrl = asset.storageType === 'EXTERNAL' ? asset.externalUrl : blobUrl

  const handleDownload = () => {
    if (asset.externalUrl) {
      window.open(asset.externalUrl, '_blank', 'noopener,noreferrer')
      return
    }
    if (blobUrl) {
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = asset.originalFilename || asset.title
      a.click()
    }
  }

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title={asset.title}
      icon={<ImageIcon className="w-5 h-5 text-parish-primary" />}
      maxWidth="860px"
      footer={(
        <div className="flex items-center justify-between gap-3 w-full">
          <span className="text-xs text-text-muted truncate">
            {asset.originalFilename ? asset.originalFilename : asset.storageType === 'EXTERNAL' ? 'Liên kết ngoài HTTPS' : 'Tư liệu số'}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Đóng
            </Button>
            <Button
              size="sm"
              leadingIcon={asset.externalUrl ? <ExternalLink className="h-4 w-4" /> : <Download className="h-4 w-4" />}
              onClick={handleDownload}
            >
              {asset.externalUrl ? 'Mở liên kết' : 'Tải xuống'}
            </Button>
          </div>
        </div>
      )}
    >
      <div className="space-y-4">
        {/* Khung hiển thị ảnh */}
        <div className="relative min-h-[260px] sm:min-h-[380px] max-h-[560px] bg-surface-sunken rounded-xl flex items-center justify-center overflow-hidden border border-surface-border">
          {loading ? (
            <div className="flex flex-col items-center gap-2 text-text-muted">
              <Loader2 className="h-8 w-8 animate-spin text-parish-primary" />
              <span className="text-xs">Đang tải tư liệu hình ảnh…</span>
            </div>
          ) : error ? (
            <div className="p-6 text-center text-xs text-parish-danger">
              <p className="font-bold">{error}</p>
              <p className="text-text-muted mt-1">Không thể hiển thị bản xem trước.</p>
            </div>
          ) : imageUrl ? (
            <img
              src={imageUrl}
              alt={asset.title}
              className="max-w-full max-h-[540px] object-contain rounded-lg"
            />
          ) : (
            <div className="text-center text-xs text-text-muted p-6">
              Không có hình ảnh xem trước cho tệp này.
            </div>
          )}
        </div>

        {/* Thông tin tư liệu */}
        <div className="space-y-2 p-3 bg-surface-app rounded-xl border border-surface-border">
          <div className="flex items-center gap-2 flex-wrap justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge tone="primary">
                {asset.assetType === 'IMAGE' ? 'Ảnh' : asset.assetType === 'POSTER' ? 'Poster' : asset.assetType}
              </Badge>
              {asset.visibility === 'ADMIN' && (
                <Badge tone="neutral">Chỉ Admin</Badge>
              )}
            </div>

            {asset.capturedOn && (
              <span className="text-xs text-text-muted flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" /> {formatDate(asset.capturedOn)}
              </span>
            )}
          </div>

          {asset.description && (
            <p className="text-xs text-text-secondary whitespace-pre-wrap m-0 pt-1 border-t border-surface-border/60">
              {asset.description}
            </p>
          )}
        </div>
      </div>
    </ModalShell>
  )
}
