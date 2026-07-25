import React, { useState, useEffect } from 'react'
import { ShieldCheck, UserPlus, Key, Lock, Unlock, LogOut, CheckCircle2, Search, Loader2, Edit2 } from 'lucide-react'
import { useClassStore } from '../../stores/classStore'
import { api } from '../../lib/api'
import * as Sentry from '@sentry/react'

export interface UserAccount {
  id: string
  username: string
  fullName: string
  phone: string
  role: 'admin' | 'chunhiem' | 'phuta' | 'phuhuynh'
  status: 'ACTIVE' | 'INACTIVE' | 'LOCKED' | 'FORCE_PASSWORD_CHANGE'
  assignedClasses: string[]
  lastLoginAt: string
}

export const UserManagementPage: React.FC = () => {
  const [users, setUsers] = useState<UserAccount[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null)
  const [tempPasswordModal, setTempPasswordModal] = useState<{ username: string; pass: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [newUsername, setNewUsername] = useState('')
  const [newFullName, setNewFullName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newRole, setNewRole] = useState<'admin' | 'chunhiem' | 'phuta' | 'phuhuynh'>('phuta')
  const [selectedClasses, setSelectedClasses] = useState<string[]>([])

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

  const filteredUsers = users.filter(
    (u) =>
      u.fullName.toLowerCase().includes(search.toLowerCase()) ||
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      u.phone.includes(search),
  )

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newUsername || !newFullName) return
    setError(null)
    try {
      const result = await api.createUser({
        username: newUsername,
        fullName: newFullName,
        phone: newPhone || undefined,
        role: newRole,
        assignedClasses: selectedClasses.length > 0 ? selectedClasses : undefined,
      })
      setIsCreateModalOpen(false)
      setTempPasswordModal({ username: result.username, pass: result.tempPassword })
      setNewUsername('')
      setNewFullName('')
      setNewPhone('')
      setNewRole('phuta')
      setSelectedClasses([])
      await fetchUsers()
    } catch (err) {
      setError('Tạo tài khoản thất bại')
      Sentry.captureException(err)
    }
  }

  const handleEditAssignments = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingUser) return
    setError(null)
    try {
      await api.updateUserAssignments(editingUser.id, selectedClasses)
      setIsEditModalOpen(false)
      setEditingUser(null)
      await fetchUsers()
    } catch (err) {
      setError('Cập nhật phân công thất bại')
      Sentry.captureException(err)
    }
  }

  const openEditModal = (user: UserAccount) => {
    setEditingUser(user)
    setSelectedClasses(user.assignedClasses || [])
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

  const handleResetPassword = async (id: string, username: string) => {
    try {
      const result = await api.resetUserPassword(id)
      setTempPasswordModal({ username, pass: result.tempPassword })
      await fetchUsers()
    } catch (err) {
      setError('Reset mật khẩu thất bại')
      Sentry.captureException(err)
    }
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

  const renderAssignments = (assignedClasses: string[]) => (
    <div className="flex flex-wrap gap-1">
      {assignedClasses.map((clsId) => {
        const cls = useClassStore.getState().findClassById(clsId)
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
      {useClassStore.getState().getClassList().map((cls) => (
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
    role: string
    onUsernameChange?: (v: string) => void
    onFullNameChange?: (v: string) => void
    onPhoneChange?: (v: string) => void
    onRoleChange: (v: any) => void
    hideUsername?: boolean
    hidePassword?: boolean
  }) => (
    <div className="space-y-3">
      {!props.hideUsername && (
        <div>
          <label className="block text-xs font-semibold text-text-muted uppercase mb-1">Username</label>
          <input type="text" required placeholder="glv_nguyenvana" value={props.username || ''}
            onChange={(e) => props.onUsernameChange?.(e.target.value)}
            className="w-full px-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary" />
        </div>
      )}
      <div>
        <label className="block text-xs font-semibold text-text-muted uppercase mb-1">Họ Và Tên</label>
        <input type="text" required placeholder="Trưởng Giuse Nguyễn Văn A" value={props.fullName || ''}
          onChange={(e) => props.onFullNameChange?.(e.target.value)}
          className="w-full px-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary" />
      </div>
      {!props.hidePassword && (
        <div>
          <label className="block text-xs font-semibold text-text-muted uppercase mb-1">Số Điện Thoại</label>
          <input type="text" placeholder="0901234567" value={props.phone || ''}
            onChange={(e) => props.onPhoneChange?.(e.target.value)}
            className="w-full px-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary" />
        </div>
      )}
      <div>
        <label className="block text-xs font-semibold text-text-muted uppercase mb-1">Phân Quyền</label>
        <select value={props.role}
          onChange={(e) => props.onRoleChange(e.target.value)}
          className="w-full px-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary">
          <option value="chunhiem">GLV Chủ Nhiệm</option>
          <option value="phuta">GLV Phụ Tá</option>
          <option value="admin">Admin / Thư Ký Xứ Đoàn</option>
          <option value="phuhuynh">Phụ Huynh</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-semibold text-text-muted uppercase mb-1">Phân Công Lớp Phụ Trách</label>
        {renderClassCheckboxes(selectedClasses, setSelectedClasses)}
      </div>
    </div>
  )

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-parish-primary-light text-parish-primary rounded-xl">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-text-main">Quản Lý Tài Khoản & Phân Quyền (IAM)</h1>
              <p className="text-xs text-text-muted">Tạo tài khoản, cấp mật khẩu tạm, phân công lớp & khóa tài khoản</p>
            </div>
          </div>
        </div>
        <button onClick={() => setIsCreateModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-parish-primary hover:bg-parish-primary-hover text-white text-sm font-semibold rounded-xl shadow-xs transition-colors">
          <UserPlus className="w-4 h-4" />
          <span>Tạo Tài Khoản GLV Mới</span>
        </button>
      </div>

      <div className="flex items-center gap-4 bg-surface-card border border-surface-border p-4 rounded-xl shadow-2xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-3 text-text-muted" />
          <input type="text" placeholder="Tìm theo Tên, Username, hoặc SĐT..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-surface-hover/30 border border-surface-border rounded-lg text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary" />
        </div>
        {loading && <Loader2 className="w-5 h-5 text-parish-primary animate-spin" />}
      </div>

      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs font-semibold text-rose-600">{error}</div>
      )}

      <div className="bg-surface-card border border-surface-border rounded-xl shadow-2xs overflow-hidden">
        <table className="w-full text-left text-sm border-collapse">
          <thead className="bg-surface-hover/50 text-text-muted uppercase text-xs font-semibold border-b border-surface-border">
            <tr>
              <th className="p-4">Giáo Lý Viên</th>
              <th className="p-4">Vai Trò</th>
              <th className="p-4">Lớp Phụ Trách</th>
              <th className="p-4">Trạng Thái</th>
              <th className="p-4">Đăng Nhập Cuối</th>
              <th className="p-4 text-right">Thao Tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {filteredUsers.map((u) => (
              <tr key={u.id} className="hover:bg-surface-hover/30 transition-colors">
                <td className="p-4">
                  <div className="font-semibold text-text-main">{u.fullName}</div>
                  <div className="text-xs text-text-muted font-mono">@{u.username} • {u.phone}</div>
                </td>
                <td className="p-4">
                  {u.role === 'admin' && <span className="px-2.5 py-1 text-xs font-bold bg-purple-500/10 text-purple-600 rounded-full">Admin</span>}
                  {u.role === 'chunhiem' && <span className="px-2.5 py-1 text-xs font-bold bg-blue-500/10 text-blue-600 rounded-full">GLV Chủ Nhiệm</span>}
                  {u.role === 'phuta' && <span className="px-2.5 py-1 text-xs font-bold bg-emerald-500/10 text-emerald-600 rounded-full">GLV Phụ Tá</span>}
                  {u.role === 'phuhuynh' && <span className="px-2.5 py-1 text-xs font-bold bg-amber-500/10 text-amber-600 rounded-full">Phụ Huynh</span>}
                </td>
                <td className="p-4">{renderAssignments(u.assignedClasses)}</td>
                <td className="p-4">
                  {u.status === 'ACTIVE' && <span className="px-2.5 py-1 text-xs font-semibold bg-emerald-500/10 text-emerald-600 rounded-full">Đang Hoạt Động</span>}
                  {u.status === 'LOCKED' && <span className="px-2.5 py-1 text-xs font-semibold bg-rose-500/10 text-rose-600 rounded-full">Đã Khóa</span>}
                  {u.status === 'FORCE_PASSWORD_CHANGE' && <span className="px-2.5 py-1 text-xs font-semibold bg-amber-500/10 text-amber-600 rounded-full">Cần Đổi Pass</span>}
                </td>
                <td className="p-4 text-xs text-text-muted">{u.lastLoginAt || 'Chưa đăng nhập'}</td>
                <td className="p-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => openEditModal(u)} title="Sửa Phân Công Lớp"
                      className="p-1.5 rounded-lg text-text-muted hover:text-blue-600 hover:bg-blue-500/10 transition-colors">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleResetPassword(u.id, u.username)} title="Reset Mật Khẩu"
                      className="p-1.5 rounded-lg text-text-muted hover:text-amber-600 hover:bg-amber-500/10 transition-colors">
                      <Key className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleForceLogout(u.id)} title="Force Logout"
                      className="p-1.5 rounded-lg text-text-muted hover:text-rose-600 hover:bg-rose-500/10 transition-colors">
                      <LogOut className="w-4 h-4" />
                    </button>
                    <button onClick={() => toggleUserStatus(u.id)} title={u.status === 'ACTIVE' ? 'Khóa' : 'Mở Khóa'}
                      className="p-1.5 rounded-lg text-text-muted hover:text-parish-primary hover:bg-parish-primary-light transition-colors">
                      {u.status === 'ACTIVE' ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4 text-emerald-600" />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create User Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-surface-card border border-surface-border rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
            <form onSubmit={handleCreateUser} className="p-6 space-y-4">
              <h2 className="text-lg font-bold text-text-main flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-parish-primary" />
                <span>Tạo Tài Khoản GLV Mới</span>
              </h2>
              {renderUserForm({
                username: newUsername, fullName: newFullName, phone: newPhone, role: newRole,
                onUsernameChange: setNewUsername, onFullNameChange: setNewFullName,
                onPhoneChange: setNewPhone, onRoleChange: setNewRole,
              })}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-surface-border">
                <button type="button" onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-text-muted hover:bg-surface-hover rounded-lg">Hủy Bỏ</button>
                <button type="submit"
                  className="px-5 py-2 text-sm font-semibold text-white bg-parish-primary hover:bg-parish-primary-hover rounded-lg shadow-xs">Tạo Tài Khoản</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Assignments Modal */}
      {isEditModalOpen && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-surface-card border border-surface-border rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
            <form onSubmit={handleEditAssignments} className="p-6 space-y-4">
              <h2 className="text-lg font-bold text-text-main flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-parish-primary" />
                <span>Phân Công Lớp: {editingUser.fullName}</span>
              </h2>
              <p className="text-xs text-text-muted">Chọn lớp phụ trách cho @{editingUser.username}</p>
              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase mb-1">Phân Công Lớp Phụ Trách</label>
                {renderClassCheckboxes(selectedClasses, setSelectedClasses)}
              </div>
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-surface-border">
                <button type="button" onClick={() => { setIsEditModalOpen(false); setEditingUser(null) }}
                  className="px-4 py-2 text-sm font-medium text-text-muted hover:bg-surface-hover rounded-lg">Hủy Bỏ</button>
                <button type="submit"
                  className="px-5 py-2 text-sm font-semibold text-white bg-parish-primary hover:bg-parish-primary-hover rounded-lg shadow-xs">Lưu Phân Công</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Temp Password Modal */}
      {tempPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-surface-card border border-surface-border rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3 text-emerald-600">
              <CheckCircle2 className="w-8 h-8" />
              <h2 className="text-lg font-bold text-text-main">Cấp Mật Khẩu Tạm Thành Công</h2>
            </div>
            <p className="text-xs text-text-muted">Hãy gửi mật khẩu tạm này cho Giáo lý viên.</p>
            <div className="p-4 bg-surface-hover border border-surface-border rounded-xl space-y-2 text-center">
              <div className="text-xs text-text-muted">Username: <strong className="text-text-main">@{tempPasswordModal.username}</strong></div>
              <div className="text-xl font-mono font-bold text-parish-primary tracking-wider">{tempPasswordModal.pass}</div>
            </div>
            <button onClick={() => { setTempPasswordModal(null); fetchUsers() }}
              className="w-full py-2.5 text-sm font-semibold text-white bg-parish-primary hover:bg-parish-primary-hover rounded-lg shadow-xs">Đã Lưu & Đóng</button>
          </div>
        </div>
      )}
    </div>
  )
}
