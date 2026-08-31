import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Archive,
  CheckCheck,
  Eye,
  EyeOff,
  Inbox,
  MessageSquareText,
  Send,
  ShieldCheck,
} from 'lucide-react'
import { PageHeader } from '../components/common/PageHeader'
import { EmptyState, SkeletonCardGrid } from '../components/common/StateFeedback'
import { Button, Select, Surface, TabPanel, Tabs, TextArea, TextInput } from '../components/common/ui'
import { useAuth } from '../hooks/useAuth'
import { api } from '../lib/api'
import { useToastStore } from '../stores/toastStore'
import type {
  CreateFeedbackInput,
  FeedbackMessage,
  FeedbackTarget,
  FeedbackVisibility,
} from '../types'

type FeedbackTab = 'compose' | 'inbox' | 'sent'

const statusLabel = {
  NEW: 'Mới',
  READ: 'Đã đọc',
  ARCHIVED: 'Đã lưu trữ',
} as const

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function FeedbackCards({
  messages,
  inboxMode,
  onStatus,
  updatingId,
}: {
  messages: FeedbackMessage[]
  inboxMode?: boolean
  onStatus?: (id: string, status: 'READ' | 'ARCHIVED') => void
  updatingId?: string | null
}) {
  if (messages.length === 0) {
    return (
      <EmptyState
        icon={MessageSquareText}
        title={inboxMode ? 'Chưa có thư góp ý' : 'Chưa có thư công khai đã gửi'}
        description={inboxMode
          ? 'Thư mới gửi tới bạn sẽ xuất hiện tại đây.'
          : 'Thư ẩn danh không xuất hiện ở mục này để không tạo liên kết ngược tới người gửi.'}
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {messages.map(message => (
        <Surface key={message.id} as="article" variant="entity" className="p-4 sm:p-5">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
                  <span className={`badge ${message.visibility === 'ANONYMOUS' ? 'badge-neutral' : 'badge-primary'}`}>
                    {message.visibility === 'ANONYMOUS' ? <EyeOff size={12} /> : <Eye size={12} />}
                    {message.visibility === 'ANONYMOUS' ? 'Ẩn danh' : 'Công khai'}
                  </span>
                  <span>{inboxMode ? `Từ: ${message.senderName}` : `Đến: ${message.targetName}`}</span>
                  <span aria-hidden="true">·</span>
                  <time dateTime={message.createdAt}>{formatDateTime(message.createdAt)}</time>
                </div>
                <h2 className="mt-2 text-base font-extrabold text-text-main">{message.subject}</h2>
              </div>
              <span className={`badge ${message.status === 'NEW' ? 'badge-warning' : 'badge-neutral'}`}>
                {statusLabel[message.status]}
              </span>
            </div>
            <p className="m-0 whitespace-pre-wrap break-words text-sm leading-relaxed text-text-main">
              {message.content}
            </p>
            {inboxMode && message.status !== 'ARCHIVED' && onStatus && (
              <div className="flex flex-wrap justify-end gap-2 border-t border-surface-border pt-3">
                {message.status === 'NEW' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    mobile
                    loading={updatingId === message.id}
                    leadingIcon={<CheckCheck size={15} />}
                    onClick={() => onStatus(message.id, 'READ')}
                  >
                    Đánh dấu đã đọc
                  </Button>
                )}
                <Button
                  variant="quiet"
                  size="sm"
                  mobile
                  disabled={updatingId === message.id}
                  leadingIcon={<Archive size={15} />}
                  onClick={() => onStatus(message.id, 'ARCHIVED')}
                >
                  Lưu trữ
                </Button>
              </div>
            )}
          </div>
        </Surface>
      ))}
    </div>
  )
}

export function FeedbackPage() {
  const { role } = useAuth()
  const canCompose = role !== 'admin'
  const canReceive = role === 'admin' || role === 'chunhiem'
  const addToast = useToastStore(state => state.addToast)
  const [activeTab, setActiveTab] = useState<FeedbackTab>(role === 'admin' ? 'inbox' : 'compose')
  const [targets, setTargets] = useState<FeedbackTarget[]>([])
  const [inbox, setInbox] = useState<FeedbackMessage[]>([])
  const [sent, setSent] = useState<FeedbackMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [targetValue, setTargetValue] = useState('PARISH')
  const [visibility, setVisibility] = useState<FeedbackVisibility>('ANONYMOUS')
  const [subject, setSubject] = useState('')
  const [content, setContent] = useState('')

  const tabs = useMemo(() => [
    ...(canCompose ? [{ value: 'compose' as const, label: 'Viết thư', icon: <Send size={15} /> }] : []),
    ...(canReceive ? [{ value: 'inbox' as const, label: `Thư đến${inbox.filter(item => item.status === 'NEW').length ? ` (${inbox.filter(item => item.status === 'NEW').length})` : ''}`, icon: <Inbox size={15} /> }] : []),
    ...(canCompose ? [{ value: 'sent' as const, label: 'Đã gửi công khai', icon: <CheckCheck size={15} /> }] : []),
  ], [canCompose, canReceive, inbox])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [targetRows, sentRows, inboxRows] = await Promise.all([
        canCompose ? api.getFeedbackTargets() : Promise.resolve([]),
        canCompose ? api.getPublicSentFeedback() : Promise.resolve([]),
        canReceive ? api.getFeedbackInbox() : Promise.resolve([]),
      ])
      setTargets(targetRows)
      setSent(sentRows)
      setInbox(inboxRows)
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Không thể tải hộp thư góp ý', 'error')
    } finally {
      setLoading(false)
    }
  }, [addToast, canCompose, canReceive])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const [targetType, targetUserId] = targetValue.split(':') as ['PARISH' | 'HOMEROOM_TEACHER', string?]
    const payload: CreateFeedbackInput = {
      targetType,
      targetUserId,
      visibility,
      subject,
      content,
    }

    setSubmitting(true)
    try {
      await api.createFeedback(payload)
      setSubject('')
      setContent('')
      if (visibility === 'PUBLIC') {
        setSent(await api.getPublicSentFeedback())
        addToast('Đã gửi thư công khai', 'success')
      } else {
        addToast('Đã gửi thư ẩn danh. Hệ thống không lưu tài khoản người gửi.', 'success', 6000)
      }
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Không thể gửi thư góp ý', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleStatus = async (id: string, status: 'READ' | 'ARCHIVED') => {
    setUpdatingId(id)
    try {
      const updated = await api.updateFeedbackStatus(id, status)
      setInbox(current => current.map(item => item.id === id ? updated : item))
      addToast(status === 'READ' ? 'Đã đánh dấu thư là đã đọc' : 'Đã lưu trữ thư', 'success')
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Không thể cập nhật thư', 'error')
    } finally {
      setUpdatingId(null)
    }
  }

  const targetOptions = targets.map(target => ({
    value: target.type === 'PARISH' ? 'PARISH' : `HOMEROOM_TEACHER:${target.userId}`,
    label: `${target.label} — ${target.detail}`,
  }))

  return (
    <div className="product-view flex flex-col gap-5">
      <PageHeader
        icon={<MessageSquareText size={20} />}
        title="Hộp thư góp ý"
        description={role === 'admin'
          ? 'Tiếp nhận và xử lý thư góp ý gửi về Ban điều hành Xứ đoàn'
          : 'Gửi góp ý tới Xứ đoàn hoặc giáo lý viên chủ nhiệm với lựa chọn công khai hay ẩn danh'}
      />

      <Tabs
        id="feedback-tabs"
        ariaLabel="Các mục hộp thư góp ý"
        items={tabs}
        value={activeTab}
        onValueChange={setActiveTab}
      />

      {loading ? (
        <SkeletonCardGrid count={3} />
      ) : (
        <>
          {canCompose && <TabPanel tabsId="feedback-tabs" value="compose" activeValue={activeTab}>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
              <Surface as="section" variant="panel" className="p-4 sm:p-6" aria-labelledby="feedback-compose-title">
                <h2 id="feedback-compose-title" className="mb-4 text-base font-extrabold text-text-main">Viết thư góp ý</h2>
                <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="feedback-target">Gửi đến</label>
                    <Select id="feedback-target" value={targetValue} onChange={event => setTargetValue(event.target.value)} required>
                      {targetOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </Select>
                  </div>

                  <fieldset className="form-group">
                    <legend className="form-label">Danh tính người gửi</legend>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <label className={`entity-card flex cursor-pointer items-start gap-3 p-3 ${visibility === 'ANONYMOUS' ? 'border-parish-primary' : ''}`}>
                        <input
                          type="radio"
                          name="feedback-visibility"
                          value="ANONYMOUS"
                          checked={visibility === 'ANONYMOUS'}
                          onChange={() => setVisibility('ANONYMOUS')}
                          className="mt-1"
                        />
                        <span><strong className="block text-sm text-text-main">Ẩn danh</strong><span className="text-xs text-text-muted">Không lưu tài khoản người gửi</span></span>
                      </label>
                      <label className={`entity-card flex cursor-pointer items-start gap-3 p-3 ${visibility === 'PUBLIC' ? 'border-parish-primary' : ''}`}>
                        <input
                          type="radio"
                          name="feedback-visibility"
                          value="PUBLIC"
                          checked={visibility === 'PUBLIC'}
                          onChange={() => setVisibility('PUBLIC')}
                          className="mt-1"
                        />
                        <span><strong className="block text-sm text-text-main">Công khai</strong><span className="text-xs text-text-muted">Người nhận thấy họ tên tài khoản</span></span>
                      </label>
                    </div>
                  </fieldset>

                  <div className="form-group">
                    <label className="form-label" htmlFor="feedback-subject">Tiêu đề</label>
                    <TextInput id="feedback-subject" value={subject} onChange={event => setSubject(event.target.value)} minLength={3} maxLength={160} required />
                    <span className="form-help-text text-right">{subject.length}/160</span>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="feedback-content">Nội dung</label>
                    <TextArea id="feedback-content" value={content} onChange={event => setContent(event.target.value)} minLength={10} maxLength={5000} rows={8} required />
                    <span className="form-help-text text-right">{content.length}/5000</span>
                  </div>

                  <div className="flex justify-end">
                    <Button type="submit" loading={submitting} loadingLabel="Đang gửi…" leadingIcon={<Send size={16} />} mobile>
                      Gửi góp ý
                    </Button>
                  </div>
                </form>
              </Surface>

              <Surface as="aside" variant="sunken" className="self-start p-4" aria-label="Cam kết riêng tư">
                <div className="flex items-start gap-3">
                  <ShieldCheck size={22} className="mt-0.5 shrink-0 text-parish-primary" />
                  <div>
                    <h2 className="text-sm font-extrabold text-text-main">Ẩn danh thật trong Catevia</h2>
                    <p className="mt-2 text-xs leading-relaxed text-text-muted">
                      Với thư ẩn danh, Catevia không lưu mã tài khoản người gửi, không tạo nhật ký audit theo người gửi và không hiển thị thư trong mục “Đã gửi”. Admin ứng dụng không có chức năng truy ngược danh tính.
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-text-muted">
                      Hệ thống vẫn cần xác thực tạm thời để bảo đảm chỉ thành viên hợp lệ được gửi. Metadata mạng do nhà cung cấp hạ tầng nằm ngoài cam kết ẩn danh của ứng dụng.
                    </p>
                    <p className="mt-2 text-xs font-semibold text-text-main">
                      Thư góp ý chỉ gửi khi đang online và không được lưu vào hàng đợi offline trên thiết bị.
                    </p>
                  </div>
                </div>
              </Surface>
            </div>
          </TabPanel>}

          {canReceive && (
            <TabPanel tabsId="feedback-tabs" value="inbox" activeValue={activeTab}>
              <FeedbackCards messages={inbox} inboxMode onStatus={handleStatus} updatingId={updatingId} />
            </TabPanel>
          )}

          {canCompose && <TabPanel tabsId="feedback-tabs" value="sent" activeValue={activeTab}>
            <Surface variant="sunken" className="mb-3 p-3 text-xs text-text-muted">
              Chỉ thư công khai xuất hiện ở đây. Thư ẩn danh không có liên kết với tài khoản nên không thể xem lại theo người gửi.
            </Surface>
            <FeedbackCards messages={sent} />
          </TabPanel>}
        </>
      )}
    </div>
  )
}

export default FeedbackPage
