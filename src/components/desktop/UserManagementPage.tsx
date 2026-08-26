import React, { useState, useEffect, useMemo } from 'react'
import { ShieldCheck, UserPlus, Key, Lock, Unlock, LogOut, CheckCircle2, Search, Loader2, Edit2, Eye, EyeOff, AlertCircle, Copy, Users, Smartphone } from 'lucide-react'
import { useClassStore } from '../../stores/classStore'
import { api } from '../../lib/api'
import { validatePassword } from '../../utils/passwordValidation'
import { buildAutoUsername, parentUsername, isValidVnPhone } from '../../utils/username'
import { ModalShell } from '../common/ModalShell'
import { PageHeader } from '../common/PageHeader'
import { useConfirmDialog } from '../../hooks/useConfirmDialog'
import { DesktopAppShell } from './DesktopAppShell'
import { formatDateTimeVi } from '../../utils/formatDate'
import { NoResultState } from '../common/StateFeedback'
import * as Sentry from '@sentry/react'

export interface UserAccount {
  id: string
  username: string
  fullName: string
  holyName?: string
  phone?: string
  role: 'admin' | 'chunhiem' | 'phuta' | 'phuhuynh'
  status: 'ACTIVE' | 'INACTIVE' | 'LOCKED' | 'FORCE_PASSWORD_CHANGE'
  assignedClasses: string[]
  lastLoginAt: string
}

// Tách trang quản lý tài khoản (2026-08-22): 'staff' = GLV & nhân sự
// (admin/chunhiem/phuta), 'phuhuynh' = chỉ tài khoản phụ huynh, 'all' = hành vi cũ
// (route /users xem toàn bộ). Entry point chính là 2 tab trong /management.
export type UserManagementScope = 'all' | 'staff' | 'phuhuynh'

export const UserManagementPage: React.FC<{ scope?: UserManagementScope }> = ({ scope = 'all' }) => {
  const [users, setUsers] = useState<UserAccount[]>([])
  // REACT-185 (2026-08-14): pattern ổn định — selector trả hàm, gọi () ngoài
  // (tránh snapshot mảng mới mỗi render → loop, xem HeaderBar.tsx:34).
  const classList = useClassStore((s) => s.getClassList)()
  const findClassById = useClassStore((s) => s.findClassById)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { askConfirm, dialog: confirmDialog } = useConfirmDialog()

  const [newUsername, setNewUsername] = useState('')
  const [newHolyName, setNewHolyName] = useState('')
  const [newFullName, setNewFullName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newRole, setNewRole] = useState<'admin' | 'chunhiem' | 'phuta' | 'phuhuynh'>('phuta')
  const [selectedClasses, setSelectedClasses] = useState<string[]>([])

  // ADR-027 (2026-08-12): username TỰ SINH `chức vụ_Tên thánh + Họ và tên`
  // (preview realtime, mirror server utils/username.ts). Admin sửa tay → custom
  // (gửi override); nút "Tự tạo lại" quay về auto. Phụ huynh: username = SĐT.
  const [isUsernameCustom, setIsUsernameCustom] = useState(false)
  const autoUsername = newRole === 'phuhuynh'
    ? parentUsername(newPhone)
    : buildAutoUsername(newRole, newHolyName, newFullName)
  const effectiveUsername = isUsernameCustom ? newUsername : autoUsername

  // ADR-016 (users): Lỗi tạo/sửa account hiển thị NGAY TRONG modal. Trước đây
  // dùng chung state `error` (render phía sau overlay) → modal che mất thông báo.
  const [createError, setCreateError] = useState('')
  const [editError, setEditError] = useState('')

  const [cpUser, setCpUser] = useState<UserAccount | null>(null)
  const [cpNewPass, setCpNewPass] = useState('')
  const [cpShow, setCpShow] = useState(false)
  // A06 (2026-08-10): re-authentication — admin nhập lại mật khẩu HIỆN TẠI của mình
  const [cpAdminPass, setCpAdminPass] = useState('')
  const [cpLoading, setCpLoading] = useState(false)
  const [cpError, setCpError] = useState('')
  const [cpSuccess, setCpSuccess] = useState(false)

  // Tạo tài khoản thành công → modal riêng hiển thị MẬT KHẨU TẠM (chỉ trả 1 lần từ server).
  // Không dùng chung modal "Đặt Mật Khẩu Thành Công" để tránh nhầm lẫn.
  const [createdAccount, setCreatedAccount] = useState<{ username: string; fullName: string; tempPassword: string } | null>(null)
  const [copied, setCopied] = useState(false)

  // ADR-026 (2026-08-12): cấp tài khoản phụ huynh hàng loạt từ students.parentPhone.
  // Preview → admin xem trước danh sách SĐT chưa có tài khoản → xác nhận với re-auth
  // (adminPassword) → kết quả itemized (partial-success ADR-008); mật khẩu tạm chỉ trả 1 lần.
  const [isProvisionOpen, setIsProvisionOpen] = useState(false)
  const [provisionPreview, setProvisionPreview] = useState<{ total: number; candidates: Array<{ phone: string; parentName: string; childrenCount: number }>; validPhoneCount: number; existingCount: number } | null>(null)
  const [provisionLoading, setProvisionLoading] = useState(false)
  const [provisionAdminPass, setProvisionAdminPass] = useState('')
  const [provisionError, setProvisionError] = useState<string | null>(null)
  const [provisionResult, setProvisionResult] = useState<{ total: number; successCount: number; skippedCount: number; errorCount: number; results: Array<{ phone: string; fullName: string; status: string; reason?: string; username?: string; tempPassword?: string }> } | null>(null)
  const [provisionCopied, setProvisionCopied] = useState<string | null>(null)
  // P3 (2026-08-15): sao chép toàn bộ credential để giao PH qua kênh riêng
  const [provisionAllCopied, setProvisionAllCopied] = useState(false)

  // ADR-039 (2026-08-15): admin đổi SĐT tài khoản (endpoint duy nhất sửa SĐT;
  // phụ huynh không tự đổi — SĐT = identity liên kết con). Kèm re-auth admin.
  const [phoneUser, setPhoneUser] = useState<UserAccount | null>(null)
  const [ppPhone, setPpPhone] = useState('')
  const [ppAdminPass, setPpAdminPass] = useState('')
  const [ppLoading, setPpLoading] = useState(false)
  const [ppError, setPpError] = useState<string | null>(null)
  const [ppSuccess, setPpSuccess] = useState<string | null>(null)

  async function openProvisionModal() {
    setIsProvisionOpen(true)
    setProvisionResult(null)
    setProvisionAdminPass('')
    setProvisionError(null)
    setProvisionLoading(true)
    try {
      const preview = await api.getParentProvisionPreview()
      setProvisionPreview(preview)
    } catch (err) {
      setProvisionError(err instanceof Error ? err.message : 'Không thể tải danh sách phụ huynh')
    } finally {
      setProvisionLoading(false)
    }
  }

  async function handleProvision() {
    if (!provisionAdminPass.trim()) return
    setProvisionLoading(true)
    setProvisionError(null)
    try {
      const result = await api.provisionParentAccounts(provisionAdminPass)
      setProvisionResult(result)
      setProvisionPreview(null)
      setProvisionAdminPass('')
      fetchUsers()
    } catch (err) {
      setProvisionError(err instanceof Error ? err.message : 'Không thể tạo tài khoản phụ huynh')
    } finally {
      setProvisionLoading(false)
    }
  }

  async function handleCopyProvisionPassword(phone: string, pass: string) {
    try {
      await navigator.clipboard.writeText(pass)
      setProvisionCopied(phone)
      setTimeout(() => setProvisionCopied(null), 1500)
    } catch {
      // Clipboard có thể bị chặn — admin tự sao chép tay
    }
  }

  async function handleCopyAllProvisionCredentials() {
    if (!provisionResult) return
    try {
      const lines = provisionResult.results
        .filter((r) => r.status === 'created' && r.tempPassword)
        .map((r) => `${r.fullName} — Đăng nhập: ${r.username} — Mật khẩu: ${r.tempPassword}`)
      await navigator.clipboard.writeText(lines.join('\n'))
      setProvisionAllCopied(true)
      setTimeout(() => setProvisionAllCopied(false), 2000)
    } catch {
      // Clipboard có thể bị chặn — admin tự sao chép tay từng dòng
    }
  }

  function openPhoneModal(u: UserAccount) {
    setPhoneUser(u)
    setPpPhone(u.phone || '')
    setPpAdminPass('')
    setPpError(null)
    setPpSuccess(null)
  }

  async function handleUpdatePhone(e: React.FormEvent) {
    e.preventDefault()
    if (!phoneUser) return
    if (!isValidVnPhone(ppPhone)) { setPpError('Số điện thoại phải là 10 chữ số bắt đầu bằng 0 (vd: 0901234567)'); return }
    if (!ppAdminPass.trim()) { setPpError('Vui lòng nhập mật khẩu xác nhận Admin'); return }
    setPpLoading(true)
    setPpError(null)
    setPpSuccess(null)
    try {
      const res = await api.updateUserPhone(phoneUser.id, ppPhone, ppAdminPass)
      setPpPhone('')
      setPpAdminPass('')
      fetchUsers()
      setPpSuccess(
        phoneUser.role === 'phuhuynh' && res.usernameChanged
          ? `Đã đổi SĐT thành ${res.phone}. Tên đăng nhập của phụ huynh đã được cập nhật thành @${res.username}.`
          : `Đã đổi SĐT thành ${res.phone}.`
      )
    } catch (err: any) {
      setPpError(err?.message || 'Không thể đổi số điện thoại')
    } finally {
      setPpLoading(false)
    }
  }

  useEffect(() => { fetchUsers() }, [])

  async function fetchUsers() {
    setLoading(true)
    setError(null)
    try {
      const list = await api.getUsers()
      setUsers(Array.isArray(list) ? list : [])
    } catch (err) {
      setError('Không thể tải danh sách người dùng')
      Sentry.captureException(err)
    } finally {
      setLoading(false)
    }
  }

  const scopedUsers = useMemo(
    () =>
      scope === 'all'
        ? users
        : users.filter((u) => (scope === 'phuhuynh' ? u.role === 'phuhuynh' : u.role !== 'phuhuynh')),
    [users, scope],
  )

  const filteredUsers = scopedUsers.filter(
    (u) =>
      u.fullName.toLowerCase().includes(search.toLowerCase()) ||
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      (u.phone || '').includes(search),
  )

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    // ADR-027: phụ huynh bắt buộc SĐT hợp lệ (username = SĐT); GLV/Admin bắt buộc Tên Thánh.
    if (newRole === 'phuhuynh' && !isValidVnPhone(parentUsername(newPhone))) {
      setCreateError('Phụ huynh bắt buộc có số điện thoại hợp lệ (10 số) để làm username đăng nhập')
      return
    }
    if (newRole !== 'phuhuynh' && !isUsernameCustom && !autoUsername) {
      setCreateError('Bắt buộc nhập Tên Thánh để hệ thống tự tạo username (ví dụ: glv_pherophanbao)')
      return
    }
    if (!newFullName.trim()) return
    setError(null)
    setCreateError('')
    try {
      const result = await api.createUser({
        // Gửi override (custom) HOẶC để server tự sinh từ holyName+fullName (SSOT).
        username: isUsernameCustom ? newUsername : undefined,
        holyName: newHolyName.trim() || undefined,
        fullName: newFullName,
        phone: newPhone || undefined,
        role: newRole,
        assignedClasses: selectedClasses.length > 0 ? selectedClasses : undefined,
      })
      await useClassStore.getState().fetchClasses()
      setIsCreateModalOpen(false)
      setCreatedAccount({ username: result.username, fullName: newFullName, tempPassword: result.tempPassword || '' })
      setCopied(false)
      setNewUsername('')
      setNewHolyName('')
      setNewFullName('')
      setNewPhone('')
      setNewRole('phuta')
      setSelectedClasses([])
      setIsUsernameCustom(false)
      await fetchUsers()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Tạo tài khoản thất bại'
      setCreateError(msg)
      Sentry.captureException(err)
    }
  }

  const handleEditAssignments = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingUser) return
    setError(null)
    setEditError('')
    try {
      await api.updateUserAssignments(editingUser.id, selectedClasses)
      await useClassStore.getState().fetchClasses()
      setIsEditModalOpen(false)
      setEditingUser(null)
      await fetchUsers()
    } catch (err) {
      const msg = err instanceof Error && err.message ? err.message : 'Cập nhật phân công thất bại'
      setEditError(msg)
      Sentry.captureException(err)
    }
  }

  const openEditModal = (user: UserAccount) => {
    setEditingUser(user)
    setSelectedClasses(user.assignedClasses || [])
    setEditError('')
    setIsEditModalOpen(true)
  }

  const toggleUserStatus = async (id: string) => {
    try {
      const user = users.find(u => u.id === id)
      if (!user) return
      const nextStatus = user.status === 'ACTIVE' ? 'LOCKED' : 'ACTIVE'
      await api.updateUserStatus(id, nextStatus)
      await fetchUsers()
    } catch (err) {
      setError('Thay đổi trạng thái thất bại')
      Sentry.captureException(err)
    }
  }

  const isSuperAdmin = (u: UserAccount) => u.username === 'bill'

  const openChangePassword = (user: UserAccount) => {
    setCpUser(user)
    setCpNewPass('')
    setCpAdminPass('')
    setCpShow(false)
    setCpError('')
    setCpSuccess(false)
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cpUser) return
    const passValidation = validatePassword(cpNewPass)
    if (passValidation) { setCpError(passValidation); return }
    if (!cpAdminPass.trim()) { setCpError('Vui lòng nhập mật khẩu hiện tại của Admin để xác nhận'); return }
    setCpLoading(true)
    setCpError('')
    setCpSuccess(false)
    try {
      await api.adminChangePassword(cpUser.id, cpNewPass, cpAdminPass)
      setCpSuccess(true)
    } catch (err: any) {
      setCpError(err.message || 'Đặt mật khẩu thất bại')
    }
    setCpLoading(false)
  }

  const handleForceLogout = async (id: string) => {
    try {
      await api.forceLogoutUser(id)
      await fetchUsers()
    } catch (err) {
      setError('Force logout thất bại')
      Sentry.captureException(err)
    }
  }

  // Xác nhận trước các thao tác account-impact (2026-08-22 audit P0.5):
  // force-logout & lock/unlock trước đây chạy trực tiếp onClick → API.
  const confirmForceLogout = async (user: UserAccount) => {
    const ok = await askConfirm({
      title: 'Xác Nhận Force Logout',
      message: `Đăng xuất tài khoản "${user.fullName} (@${user.username})" khỏi mọi thiết bị? Các phiên đang hoạt động sẽ bị ngắt ngay lập tức.`,
      confirmText: 'Đăng Xuất',
      variant: 'warning',
    })
    if (ok) await handleForceLogout(user.id)
  }

  const confirmToggleUserStatus = async (user: UserAccount) => {
    const locking = user.status === 'ACTIVE'
    const ok = await askConfirm({
      title: locking ? 'Xác Nhận Khóa Tài Khoản' : 'Xác Nhận Mở Khóa',
      message: locking
        ? `Khóa tài khoản "${user.fullName} (@${user.username})"? Người dùng sẽ không thể đăng nhập cho đến khi được mở khóa.`
        : `Mở khóa tài khoản "${user.fullName} (@${user.username})"? Người dùng sẽ đăng nhập được trở lại bình thường.`,
      confirmText: locking ? 'Khóa' : 'Mở Khóa',
      variant: locking ? 'danger' : 'info',
    })
    if (ok) await toggleUserStatus(user.id)
  }

  const handleCopyTempPassword = async () => {
    if (!createdAccount || !createdAccount.tempPassword) return
    try {
      await navigator.clipboard.writeText(createdAccount.tempPassword)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      Sentry.captureException(err)
    }
  }

  const renderAssignments = (assignedClasses: string[]) => (
    <div className="flex flex-wrap gap-1">
      {assignedClasses.map((clsId) => {
        const cls = findClassById(clsId)
        return (
          <span key={clsId} className="px-2 py-0.5 text-xs font-medium bg-surface-hover border border-surface-border rounded-md text-text-main">
            {cls?.name || clsId}
          </span>
        )
      })}
    </div>
  )

  const renderClassCheckboxes = (selected: string[], onChange: (ids: string[]) => void) => (
    <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto p-2 border border-surface-border rounded-lg">
      {classList.map((cls) => (
        <label key={cls.id} className="flex items-center gap-2 text-xs text-text-main cursor-pointer">
          <input
            type="checkbox"
            checked={selected.includes(cls.id)}
            onChange={(e) => {
              if (e.target.checked) onChange([...selected, cls.id])
              else onChange(selected.filter((id) => id !== cls.id))
            }}
            className="rounded-xs text-parish-primary"
          />
          <span>{cls.name}</span>
        </label>
      ))}
    </div>
  )

  const renderUserForm = (props: {
    username?: string
    fullName?: string
    phone?: string
    holyName?: string
    role: string
    onUsernameChange?: (v: string) => void
    onFullNameChange?: (v: string) => void
    onPhoneChange?: (v: string) => void
    onHolyNameChange?: (v: string) => void
    onRoleChange: (v: any) => void
    usernameCustom?: boolean
    onUsernameCustomChange?: (v: boolean) => void
    hideUsername?: boolean
    hidePassword?: boolean
    allowedRoles?: string[]
  }) => (
    <div className="space-y-3">
      {!props.hideUsername && (
        <div>
          <label className="block text-xs font-semibold text-text-muted uppercase mb-1">
            Username {props.usernameCustom && <span className="text-amber-600">(tùy chỉnh)</span>}
          </label>
          <div className="flex items-center gap-2">
            <input type="text" required
              placeholder={props.role === 'phuhuynh' ? '0901234567 (SĐT đăng nhập)' : 'glv_pherophanbao'}
              value={props.username || ''}
              onChange={(e) => { props.onUsernameChange?.(e.target.value); props.onUsernameCustomChange?.(true) }}
              className="w-full px-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary" />
            {props.usernameCustom && (
              <button type="button" onClick={() => props.onUsernameCustomChange?.(false)}
                title="Tự tạo lại từ Tên Thánh + Họ tên"
                className="btn btn-ghost btn-sm border border-surface-border whitespace-nowrap">
                Tự tạo lại
              </button>
            )}
          </div>
          <p className="text-[11px] text-text-muted mt-1">
            {props.role === 'phuhuynh'
              ? 'Phụ huynh đăng nhập bằng số điện thoại (quy ước ADR-026).'
              : 'Tự tạo theo cú pháp chức vụ_Tên thánh + Họ và tên — ví dụ: glv_pherophanbao (bỏ dấu, nối liền).'}
          </p>
        </div>
      )}
      <div>
        <label className="block text-xs font-semibold text-text-muted uppercase mb-1">Tên Thánh</label>
        <input type="text" required={props.role !== 'phuhuynh'} placeholder="Phê-rô" value={props.holyName || ''}
          onChange={(e) => props.onHolyNameChange?.(e.target.value)}
          className="w-full px-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-text-muted uppercase mb-1">Họ Và Tên</label>
        <input type="text" required placeholder="Trưởng Giuse Nguyễn Văn A" value={props.fullName || ''}
          onChange={(e) => props.onFullNameChange?.(e.target.value)}
          className="w-full px-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary" />
      </div>
      {!props.hidePassword && (
        <div>
          <label className="block text-xs font-semibold text-text-muted uppercase mb-1">Số Điện Thoại</label>
          <input type="text" required={props.role === 'phuhuynh'} placeholder="0901234567" value={props.phone || ''}
            onChange={(e) => props.onPhoneChange?.(e.target.value)}
            className="w-full px-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary" />
        </div>
      )}
      <div>
        <label className="block text-xs font-semibold text-text-muted uppercase mb-1">Phân Quyền</label>
        <select value={props.role}
          onChange={(e) => props.onRoleChange(e.target.value)}
          className="w-full px-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary">
          {(!props.allowedRoles || props.allowedRoles.includes('chunhiem')) && (
            <option value="chunhiem">GLV Chủ Nhiệm</option>
          )}
          {(!props.allowedRoles || props.allowedRoles.includes('phuta')) && (
            <option value="phuta">GLV Phụ Tá</option>
          )}
          {(!props.allowedRoles || props.allowedRoles.includes('admin')) && (
            <option value="admin">Admin / Thư Ký Xứ Đoàn</option>
          )}
          {(!props.allowedRoles || props.allowedRoles.includes('phuhuynh')) && (
            <option value="phuhuynh">Phụ Huynh</option>
          )}
        </select>
      </div>
      {/* ADR-026 fix: chỉ chunhiem/phuta mới có phân công lớp — admin/phuhuynh
          để trống (server cũng bỏ qua, không sinh catechistAssignments sai). */}
      {(props.role === 'chunhiem' || props.role === 'phuta') && (
        <div>
          <label className="block text-xs font-semibold text-text-muted uppercase mb-1">Phân Công Lớp Phụ Trách</label>
          {renderClassCheckboxes(selectedClasses, setSelectedClasses)}
        </div>
      )}
    </div>
  )

  function openCreateModal() {
    // Scope 'phuhuynh': khóa vai trò Phụ Huynh (SĐT = username). 'staff'/'all':
    // giữ mặc định GLV Phụ Tá như trước.
    setNewRole(scope === 'phuhuynh' ? 'phuhuynh' : 'phuta')
    setIsUsernameCustom(false)
    setCreateError('')
    setIsCreateModalOpen(true)
  }

  const createAllowedRoles =
    scope === 'staff' ? ['chunhiem', 'phuta', 'admin'] : scope === 'phuhuynh' ? ['phuhuynh'] : undefined
  const headerTitle =
    scope === 'staff'
      ? 'Tài Khoản Giáo Lý Viên & Nhân Sự'
      : scope === 'phuhuynh'
        ? 'Tài Khoản Phụ Huynh'
        : 'Quản Lý Tài Khoản & Phân Quyền (IAM)'
  const headerDescription =
    scope === 'staff'
      ? 'Tạo, phân công, khóa & đặt mật khẩu tài khoản GLV / Admin'
      : scope === 'phuhuynh'
        ? 'Cấp hàng loạt & quản lý tài khoản đăng nhập của phụ huynh (đăng nhập bằng SĐT)'
        : 'Tạo, cấp quyền, khóa & đặt mật khẩu người dùng'

  return (
    <DesktopAppShell width="wide" className="flex flex-col gap-6">
      <PageHeader
        icon={<ShieldCheck className="w-6 h-6 text-parish-primary" />}
        title={headerTitle}
        description={headerDescription}
        actions={
          <>
            {scope !== 'staff' && (
              <button onClick={openProvisionModal}
                className="btn btn-secondary">
                <Users className="w-4 h-4" />
                <span>Cấp Tài Khoản Phụ Huynh</span>
              </button>
            )}
            <button onClick={openCreateModal}
              className="btn btn-primary">
              <UserPlus className="w-4 h-4" />
              <span>{scope === 'phuhuynh' ? 'Tạo Tài Khoản Phụ Huynh' : 'Tạo Tài Khoản GLV Mới'}</span>
            </button>
          </>
        }
      />

      <div className="flex items-center gap-4 bg-surface-card border border-surface-border p-4 rounded-2xl shadow-card">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-text-placeholder" />
          <input type="text" placeholder="Tìm theo Tên, Username, hoặc SĐT..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="form-input-sm w-full pl-10" />
        </div>
        {loading && <Loader2 className="w-5 h-5 text-parish-primary animate-spin" />}
      </div>

      {error && (
        <div className="alert-error">{error}</div>
      )}

      <div className="bg-surface-card border border-surface-border rounded-2xl shadow-card overflow-x-auto">
        <table className="w-full min-w-max text-left text-sm border-collapse bg-surface-card text-text-main">
          <thead>
            <tr className="bg-surface-app text-text-muted border-b-2 border-surface-border text-xs font-bold uppercase tracking-wider">
              <th className="p-4" scope="col">Giáo Lý Viên</th>
              <th className="p-4" scope="col">Vai Trò</th>
              <th className="p-4" scope="col">Lớp Phụ Trách</th>
              <th className="p-4" scope="col">Trạng Thái</th>
              <th className="p-4" scope="col">Bảo Mật</th>
              <th className="p-4" scope="col">Đăng Nhập Cuối</th>
              <th className="p-4 text-right" scope="col">Thao Tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border bg-surface-card">
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8">
                  <NoResultState
                    title="Không có tài khoản nào"
                    description={search ? `Không tìm thấy tài khoản khớp "${search}". Thử từ khóa khác.` : 'Chưa có tài khoản nào trong phạm vi này.'}
                    onReset={search ? () => setSearch('') : undefined}
                    resetLabel="Xóa tìm kiếm"
                  />
                </td>
              </tr>
            ) : filteredUsers.map((u) => (
              <tr key={u.id} className="bg-surface-card hover:bg-surface-app transition-colors">
                <td className="p-4">
                  <div className="font-semibold text-base text-text-main">
                    {u.fullName}
                    {u.holyName && <span className="ml-2 text-sm font-medium text-parish-primary">Th. {u.holyName}</span>}
                  </div>
                  <div className="text-sm text-text-muted font-mono">@{u.username}{u.phone ? ` • ${u.phone}` : ''}</div>
                </td>
                <td className="p-4">
                  {u.role === 'admin' && <span className="px-2.5 py-1 text-xs font-bold bg-purple-500/10 text-purple-600 rounded-full">Admin</span>}
                  {u.role === 'chunhiem' && <span className="px-2.5 py-1 text-xs font-bold bg-sky-500/10 text-sky-600 rounded-full">GLV Chủ Nhiệm</span>}
                  {u.role === 'phuta' && <span className="px-2.5 py-1 text-xs font-bold bg-emerald-500/10 text-emerald-600 rounded-full">GLV Phụ Tá</span>}
                  {u.role === 'phuhuynh' && <span className="px-2.5 py-1 text-xs font-bold bg-amber-500/10 text-amber-600 rounded-full">Phụ Huynh</span>}
                </td>
                <td className="p-4">{renderAssignments(u.assignedClasses)}</td>
                <td className="p-4">
                  {u.status === 'ACTIVE' && <span className="px-2.5 py-1 text-xs font-semibold bg-emerald-500/10 text-emerald-600 rounded-full">Đang Hoạt Động</span>}
                  {u.status === 'LOCKED' && <span className="px-2.5 py-1 text-xs font-semibold bg-rose-500/10 text-rose-600 rounded-full">Đã Khóa</span>}
                  {u.status === 'FORCE_PASSWORD_CHANGE' && <span className="px-2.5 py-1 text-xs font-semibold bg-amber-500/10 text-amber-600 rounded-full">Cần Đổi Pass</span>}
                </td>
                <td className="p-4">
                  <span className="text-xs text-text-muted whitespace-nowrap">Không lưu mật khẩu để xem lại</span>
                  {u.status === 'FORCE_PASSWORD_CHANGE' && (
                    <div className="text-xs text-amber-600 dark:text-amber-400 mt-0.5 whitespace-nowrap">
                      Mật khẩu tạm — chưa đổi
                    </div>
                  )}
                </td>
                <td className="p-4 text-sm text-text-muted">{u.lastLoginAt ? formatDateTimeVi(u.lastLoginAt) : 'Chưa đăng nhập'}</td>
                <td className="p-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {/* ADR-026 hardening: chỉ GLV (chủ nhiệm/phụ tá) có phân công lớp —
                        ẩn nút sửa phân công cho hàng admin/phuhuynh (server cũng chặn 400). */}
                    {(u.role === 'chunhiem' || u.role === 'phuta') && (
                      <button onClick={() => openEditModal(u)} title="Sửa Phân Công Lớp"
                        className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-text-muted hover:text-parish-primary hover:bg-parish-primary-light transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}
                    <button onClick={() => openChangePassword(u)} title="Đặt Mật Khẩu"
                      className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-text-muted hover:text-amber-600 hover:bg-amber-500/10 transition-colors">
                      <Key className="w-4 h-4" />
                    </button>
                    {!isSuperAdmin(u) && (
                      <button onClick={() => confirmForceLogout(u)} title="Force Logout"
                        className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-text-muted hover:text-rose-600 hover:bg-rose-500/10 transition-colors">
                        <LogOut className="w-4 h-4" />
                      </button>
                    )}
                    {!isSuperAdmin(u) && (
                      <button onClick={() => openPhoneModal(u)} title="Đổi Số Điện Thoại"
                        className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-text-muted hover:text-parish-primary hover:bg-parish-primary-light transition-colors">
                        <Smartphone className="w-4 h-4" />
                      </button>
                    )}
                    {!isSuperAdmin(u) && (
                      <button onClick={() => confirmToggleUserStatus(u)} title={u.status === 'ACTIVE' ? 'Khóa' : 'Mở Khóa'}
                        className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-text-muted hover:text-parish-primary hover:bg-parish-primary-light transition-colors">
                        {u.status === 'ACTIVE' ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4 text-emerald-600" />}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {confirmDialog}

      {/* Create User Modal */}
      {isCreateModalOpen && (
        <ModalShell
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          title={<><UserPlus className="w-5 h-5 text-parish-primary inline mr-2" />{scope === 'phuhuynh' ? 'Tạo Tài Khoản Phụ Huynh' : 'Tạo Tài Khoản GLV Mới'}</>}
          maxWidth="512px"
        >
          <form onSubmit={handleCreateUser} className="space-y-4">
              {renderUserForm({
                username: effectiveUsername, fullName: newFullName, phone: newPhone, holyName: newHolyName, role: newRole,
                onUsernameChange: setNewUsername, onFullNameChange: setNewFullName,
                onPhoneChange: setNewPhone, onHolyNameChange: setNewHolyName, onRoleChange: setNewRole,
                usernameCustom: isUsernameCustom, onUsernameCustomChange: setIsUsernameCustom,
                allowedRoles: createAllowedRoles,
              })}
              {createError && (
                <div className="flex items-center gap-2 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs font-semibold text-rose-600">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{createError}</span>
                </div>
              )}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-surface-border">
                <button type="button" onClick={() => setIsCreateModalOpen(false)}
                  className="btn btn-ghost">Hủy Bỏ</button>
                <button type="submit"
                  className="btn btn-primary">Tạo Tài Khoản</button>
              </div>
            </form>
        </ModalShell>
      )}

      {/* Đổi SĐT Modal (ADR-039) */}
      {phoneUser && (
        <ModalShell
          isOpen={!!phoneUser}
          onClose={() => setPhoneUser(null)}
          title={<><Smartphone className="w-5 h-5 text-parish-primary inline mr-2" />Đổi Số Điện Thoại</>}
          maxWidth="448px"
        >
          <form onSubmit={handleUpdatePhone} className="space-y-4">
              <p className="text-sm text-text-muted">
                Tài khoản <strong className="text-text-main">{phoneUser.fullName}</strong> (@{phoneUser.username})
              </p>
              {phoneUser.role === 'phuhuynh' && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950 text-amber-700 text-xs rounded-lg border border-amber-200 dark:border-amber-900">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <span>Số điện thoại là khóa liên kết con của phụ huynh. Tên đăng nhập của phụ huynh sẽ được đổi theo SĐT mới — hãy giao SĐT + mật khẩu mới cho phụ huynh qua kênh riêng.</span>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">Số Điện Thoại Mới</label>
                <input type="text" placeholder="0901234567" value={ppPhone} onChange={(e) => { setPpPhone(e.target.value); setPpSuccess(null) }} required
                  className="w-full px-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">Mật Khẩu Xác Nhận Admin (hiện tại)</label>
                <input type="password" value={ppAdminPass} onChange={(e) => setPpAdminPass(e.target.value)} required
                  placeholder="Nhập mật khẩu của bạn để xác nhận"
                  className="w-full px-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary" />
              </div>
              {ppError && (
                <div className="flex items-center gap-2 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs font-semibold text-rose-600">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{ppError}</span>
                </div>
              )}
              {ppSuccess && (
                <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs font-semibold text-emerald-700">
                  <CheckCircle2 size={14} className="shrink-0" />
                  <span>{ppSuccess}</span>
                </div>
              )}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-surface-border">
                <button type="button" onClick={() => setPhoneUser(null)}
                  className="btn btn-ghost">Đóng</button>
                <button type="submit" disabled={ppLoading}
                  className="btn btn-primary">
                  {ppLoading && <Loader2 size={14} className="animate-spin" />}
                  <span>Lưu SĐT Mới</span>
                </button>
              </div>
            </form>
        </ModalShell>
      )}

      {/* Edit Assignments Modal */}
      {isEditModalOpen && editingUser && (
        <ModalShell
          isOpen={isEditModalOpen && !!editingUser}
          onClose={() => { setIsEditModalOpen(false); setEditingUser(null) }}
          title={<><Edit2 className="w-5 h-5 text-parish-primary inline mr-2" />Phân Công Lớp: {editingUser.fullName}</>}
          subtitle={`Chọn lớp phụ trách cho @${editingUser.username}`}
          maxWidth="512px"
        >
          <form onSubmit={handleEditAssignments} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase mb-1">Phân Công Lớp Phụ Trách</label>
                {renderClassCheckboxes(selectedClasses, setSelectedClasses)}
              </div>
              {editError && (
                <div className="flex items-center gap-2 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs font-semibold text-rose-600">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{editError}</span>
                </div>
              )}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-surface-border">
                <button type="button" onClick={() => { setIsEditModalOpen(false); setEditingUser(null) }}
                  className="btn btn-ghost">Hủy Bỏ</button>
                <button type="submit"
                  className="btn btn-primary">Lưu Phân Công</button>
              </div>
            </form>
        </ModalShell>
      )}

      {/* Create Account Success Modal — hiển thị MẬT KHẨU TẠM (trả 1 lần duy nhất) */}
      {createdAccount && (
        <ModalShell
          isOpen={!!createdAccount}
          onClose={() => { setCreatedAccount(null); setCopied(false) }}
          title={<><CheckCircle2 className="w-6 h-6 text-parish-success inline mr-2" />Tạo Tài Khoản Thành Công</>}
          maxWidth="448px"
        >
          <div className="space-y-4">
            <p className="text-xs text-text-muted">
              Tài khoản <strong>{createdAccount.fullName}</strong> (@{createdAccount.username}) đã được tạo.
              Đây là lần duy nhất hệ thống hiển thị mật khẩu tạm. Hãy sao chép và giao qua kênh riêng; máy chủ không lưu bản có thể xem lại.
            </p>
            {createdAccount.tempPassword && (
              <div className="p-4 bg-surface-hover border border-surface-border rounded-xl space-y-2 text-center">
                <div className="text-xs text-text-muted">Mật khẩu tạm (lần đầu đăng nhập):</div>
                <div className="flex items-center justify-center gap-2">
                  <span className="text-xl font-mono font-bold text-parish-primary tracking-wider">{createdAccount.tempPassword}</span>
                  <button type="button" onClick={handleCopyTempPassword} title="Sao chép mật khẩu tạm"
                    className="p-1.5 rounded-lg text-text-muted hover:text-parish-primary hover:bg-parish-primary-light transition-colors">
                    {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                {copied && <div className="text-[10px] font-semibold text-emerald-600">Đã sao chép vào clipboard</div>}
              </div>
            )}
            <p className="text-[11px] text-amber-600 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5 flex items-start gap-2">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>Giáo lý viên sẽ bắt buộc đổi mật khẩu ngay tại lần đăng nhập đầu tiên.</span>
            </p>
            <button onClick={() => { setCreatedAccount(null); setCopied(false) }}
              className="btn btn-primary w-full">Đã Lưu & Đóng</button>
          </div>
        </ModalShell>
      )}

      {/* Change Password Modal */}
      {cpUser && !cpSuccess && (
        <ModalShell
          isOpen={!!cpUser && !cpSuccess}
          onClose={() => setCpUser(null)}
          title={<><Key className="w-5 h-5 text-parish-primary inline mr-2" />Đặt Mật Khẩu: {cpUser.fullName}</>}
          subtitle={`Nhập mật khẩu mới cho @${cpUser.username}`}
          maxWidth="448px"
        >
          <form onSubmit={handleChangePassword} className="space-y-3">
              <div className="relative">
                <input type={cpShow ? 'text' : 'password'} value={cpNewPass} onChange={e => setCpNewPass(e.target.value)} placeholder="Mật khẩu mới" required minLength={8} autoFocus
                  className="w-full px-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary pr-8" />
                <button type="button" onClick={() => setCpShow(!cpShow)} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted">
                  {cpShow ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {cpError && <div className="flex items-center gap-2 text-xs text-rose-600"><AlertCircle size={14} />{cpError}</div>}
              <div className="relative">
                <input type="password" value={cpAdminPass} onChange={e => setCpAdminPass(e.target.value)} placeholder="Mật khẩu hiện tại của Admin (xác nhận)" required
                  className="w-full px-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary" />
              </div>
              <p className="text-[11px] text-text-muted flex items-start gap-1.5">
                <ShieldCheck size={14} className="shrink-0 mt-0.5" />
                <span>A06: thao tác nhạy cảm yêu cầu nhập lại mật khẩu Admin — hành động được ghi vào nhật ký kiểm toán.</span>
              </p>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={() => setCpUser(null)}
                  className="btn btn-ghost">Hủy</button>
                <button type="submit" disabled={cpLoading}
                  className="btn btn-primary">
                  {cpLoading && <Loader2 size={14} className="animate-spin" />}
                  <span>Lưu Mật Khẩu</span>
                </button>
              </div>
            </form>
        </ModalShell>
      )}

      {/* Success Modal */}
      {cpUser && cpSuccess && (
        <ModalShell
          isOpen={!!cpUser && cpSuccess}
          onClose={() => { setCpUser(null); setCpNewPass(''); setCpSuccess(false) }}
          title={<><CheckCircle2 className="w-6 h-6 text-parish-success inline mr-2" />Đặt Mật Khẩu Thành Công</>}
          maxWidth="448px"
        >
          <div className="space-y-4">
            <p className="text-xs text-text-muted">Mật khẩu cho <strong>{cpUser.fullName}</strong> (@{cpUser.username}) đã được cập nhật.</p>
            {cpNewPass && (
              <div className="p-4 bg-surface-hover border border-surface-border rounded-xl space-y-2 text-center">
                <div className="text-xs text-text-muted">Mật khẩu mới:</div>
                <div className="text-xl font-mono font-bold text-parish-primary tracking-wider">{cpNewPass}</div>
              </div>
            )}
            <button onClick={() => { setCpUser(null); setCpNewPass(''); setCpSuccess(false); fetchUsers() }}
              className="btn btn-primary w-full">Đã Lưu & Đóng</button>
          </div>
        </ModalShell>
      )}

    {/* ADR-026 (2026-08-12): cấp tài khoản phụ huynh hàng loạt từ students.parentPhone */}
      {isProvisionOpen && (
        <ModalShell
          isOpen={isProvisionOpen}
          onClose={() => setIsProvisionOpen(false)}
          title={<><Users className="w-5 h-5 text-parish-primary inline mr-2" />Cấp Tài Khoản Phụ Huynh</>}
          maxWidth="672px"
        >
          {!provisionResult ? (
              <div className="space-y-4">
                {provisionLoading ? (
                  <div className="flex items-center justify-center gap-2 py-10 text-sm text-text-muted">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Đang kiểm tra danh sách học sinh...</span>
                  </div>
                ) : provisionError ? (
                  <div className="flex items-center gap-2 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs font-semibold text-rose-600">
                    <AlertCircle size={14} className="shrink-0" />
                    <span>{provisionError}</span>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-text-muted">
                      Tạo tài khoản <strong>Phụ Huynh</strong> (đăng nhập bằng số điện thoại) cho các số
                      điện thoại phụ huynh trong danh sách thiếu nhi <strong>chưa có tài khoản</strong>.
                      Anh chị em cùng số điện thoại → chung 1 tài khoản. Mật khẩu tạm chỉ hiển thị 1 lần.
                    </p>
                    {provisionPreview && provisionPreview.total === 0 ? (
                      <div className="p-6 text-center text-sm text-text-muted bg-surface-hover/30 border border-surface-border rounded-xl">
                        {provisionPreview.validPhoneCount === 0 ? (
                          <>
                            Chưa có số điện thoại phụ huynh hợp lệ trong danh sách thiếu nhi.
                            <br />
                            Vui lòng cập nhật SĐT (định dạng 10 số VN, ví dụ <span className="font-mono">0901234567</span>) cho học sinh trước khi cấp tài khoản.
                          </>
                        ) : (
                          <>Tất cả số điện thoại phụ huynh đã có tài khoản — không cần cấp mới.</>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="text-xs font-semibold text-text-main">
                          {provisionPreview?.total ?? 0} số điện thoại chưa có tài khoản:
                        </div>
                        <div className="max-h-56 overflow-y-auto border border-surface-border rounded-lg divide-y divide-surface-border">
                          {provisionPreview?.candidates.map((c) => (
                            <div key={c.phone} className="flex items-center justify-between px-3 py-2 text-sm">
                              <div>
                                <span className="font-mono font-semibold text-text-main">{c.phone}</span>
                                <span className="ml-2 text-text-muted">{c.parentName}</span>
                              </div>
                              <span className="text-[11px] px-2 py-0.5 bg-surface-hover text-text-muted rounded-full">{c.childrenCount} con</span>
                            </div>
                          ))}
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-text-muted uppercase mb-1">Xác Nhận Admin</label>
                          <input
                            type="password"
                            autoFocus
                            value={provisionAdminPass}
                            onChange={(e) => setProvisionAdminPass(e.target.value)}
                            placeholder="Mật khẩu hiện tại của Admin (xác nhận bảo mật)"
                            className="w-full px-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary"
                          />
                          <p className="text-[11px] text-text-muted mt-1 flex items-start gap-1.5">
                            <ShieldCheck size={14} className="shrink-0 mt-0.5" />
                            <span>A06: thao tác trả mật khẩu tạm yêu cầu nhập lại mật khẩu Admin — được ghi vào nhật ký kiểm toán.</span>
                          </p>
                        </div>
                        <div className="flex items-center justify-end gap-3 pt-2 border-t border-surface-border">
                          <button onClick={() => setIsProvisionOpen(false)}
                            className="btn btn-ghost">Hủy Bỏ</button>
                          <button onClick={handleProvision} disabled={provisionLoading || !provisionAdminPass.trim()}
                            className="btn btn-primary">
                            {provisionLoading && <Loader2 size={14} className="animate-spin" />}
                            <span>Tạo {provisionPreview?.total ?? 0} Tài Khoản</span>
                          </button>
                        </div>
                      </>
                    )}
                  </>
                )}
                {!provisionLoading && provisionPreview && provisionPreview.total === 0 && (
                  <div className="flex items-center justify-end pt-2 border-t border-surface-border">
                    <button onClick={() => setIsProvisionOpen(false)}
                      className="btn btn-ghost">Đóng</button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-7 h-7 text-emerald-600" />
                  <h2 className="text-lg font-bold text-text-main">Hoàn Tất Cấp Tài Khoản Phụ Huynh</h2>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-600 rounded-full">✓ {provisionResult.successCount} đã tạo</span>
                    <span className="px-2.5 py-1 bg-surface-hover text-text-muted rounded-full">{provisionResult.skippedCount} bỏ qua</span>
                    <span className="px-2.5 py-1 bg-rose-500/10 text-rose-600 rounded-full">{provisionResult.errorCount} lỗi</span>
                    <span className="px-2.5 py-1 bg-surface-hover text-text-muted rounded-full">{provisionResult.total} tổng</span>
                  </div>
                  <button onClick={handleCopyAllProvisionCredentials}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-surface-border bg-surface-hover text-text-main hover:bg-surface-hover/70 transition-colors">
                    {provisionAllCopied ? <CheckCircle2 size={14} className="text-emerald-600" /> : <Copy size={14} />}
                    {provisionAllCopied ? 'Đã chép!' : 'Sao Chép Tất Cả Credential'}
                  </button>
                </div>
                <div className="max-h-72 overflow-y-auto border border-surface-border rounded-lg divide-y divide-surface-border">
                  {provisionResult.results.map((r) => (
                    <div key={r.phone} className="px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <span className="font-mono font-semibold text-text-main">{r.phone}</span>
                          <span className="ml-2 text-text-muted">{r.fullName}</span>
                        </div>
                        {r.status === 'created' ? (
                          <span className="text-[11px] px-2 py-0.5 bg-emerald-500/10 text-emerald-600 rounded-full">Đã tạo @{r.username}</span>
                        ) : (
                          <span className="text-[11px] px-2 py-0.5 bg-amber-500/10 text-amber-600 rounded-full">
                            Bỏ qua — {r.reason === 'username_exists' ? 'SĐT đã có tài khoản' : 'lỗi CSDL'}
                          </span>
                        )}
                      </div>
                      {r.status === 'created' && r.tempPassword && (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="font-mono text-xs font-bold text-parish-primary tracking-wider">{r.tempPassword}</span>
                          <button onClick={() => handleCopyProvisionPassword(r.phone, r.tempPassword!)} title="Sao chép mật khẩu tạm"
                            className="p-1 rounded-lg text-text-muted hover:text-parish-primary hover:bg-parish-primary-light transition-colors">
                            {provisionCopied === r.phone ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                          <span className="text-[10px] text-amber-600">bắt buộc đổi mật khẩu lần đầu</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <button onClick={() => { setIsProvisionOpen(false); setProvisionResult(null) }}
                  className="btn btn-primary w-full">Đã Lưu & Đóng</button>
              </div>
            )}
        </ModalShell>
      )}
    </DesktopAppShell>
  )
}
