import React, { useState } from 'react'
import { ShieldCheck, UserPlus, Key, Lock, Unlock, LogOut, CheckCircle2, Search } from 'lucide-react'
import { MOCK_CLASSES } from '../../data/mockParishData'

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

const INITIAL_USERS: UserAccount[] = [
  {
    id: 'USR-001',
    username: 'admin',
    fullName: 'Cha Xứ Giuse Nguyễn Văn A',
    phone: '0901234567',
    role: 'admin',
    status: 'ACTIVE',
    assignedClasses: ['CC1', 'AU1', 'AU2', 'TN1'],
    lastLoginAt: '2026-07-24 10:30',
  },
  {
    id: 'USR-002',
    username: 'chunhiem_au1',
    fullName: 'Trưởng Giuse Dũng',
    phone: '0987654321',
    role: 'chunhiem',
    status: 'ACTIVE',
    assignedClasses: ['AU1'],
    lastLoginAt: '2026-07-23 18:45',
  },
  {
    id: 'USR-003',
    username: 'phuta_tn1',
    fullName: 'Huynh Trưởng Maria Hoa',
    phone: '0912345678',
    role: 'phuta',
    status: 'FORCE_PASSWORD_CHANGE',
    assignedClasses: ['TN1'],
    lastLoginAt: 'Chưa đăng nhập',
  },
]

export const UserManagementPage: React.FC = () => {
  const [users, setUsers] = useState<UserAccount[]>(INITIAL_USERS)
  const [search, setSearch] = useState('')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [tempPasswordModal, setTempPasswordModal] = useState<{ username: string; pass: string } | null>(null)

  // Form State for New User
  const [newUsername, setNewUsername] = useState('')
  const [newFullName, setNewFullName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newRole, setNewRole] = useState<'admin' | 'chunhiem' | 'phuta' | 'phuhuynh'>('phuta')
  const [selectedClasses, setSelectedClasses] = useState<string[]>([])

  const filteredUsers = users.filter(
    (u) =>
      u.fullName.toLowerCase().includes(search.toLowerCase()) ||
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      u.phone.includes(search),
  )

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newUsername || !newFullName) return

    const tempPass = `Parish@${Math.floor(1000 + Math.random() * 9000)}`
    const newUser: UserAccount = {
      id: `USR-${String(users.length + 1).padStart(3, '0')}`,
      username: newUsername,
      fullName: newFullName,
      phone: newPhone,
      role: newRole,
      status: 'FORCE_PASSWORD_CHANGE',
      assignedClasses: selectedClasses,
      lastLoginAt: 'Chưa đăng nhập',
    }

    setUsers([...users, newUser])
    setIsCreateModalOpen(false)
    setTempPasswordModal({ username: newUsername, pass: tempPass })

    // Reset Form
    setNewUsername('')
    setNewFullName('')
    setNewPhone('')
    setNewRole('phuta')
    setSelectedClasses([])
  }

  const toggleUserStatus = (id: string) => {
    setUsers(
      users.map((u) => {
        if (u.id !== id) return u
        const nextStatus = u.status === 'ACTIVE' ? 'LOCKED' : 'ACTIVE'
        return { ...u, status: nextStatus }
      }),
    )
  }

  const handleResetPassword = (username: string) => {
    const tempPass = `Reset@${Math.floor(1000 + Math.random() * 9000)}`
    setUsers(
      users.map((u) => {
        if (u.username !== username) return u
        return { ...u, status: 'FORCE_PASSWORD_CHANGE' }
      }),
    )
    setTempPasswordModal({ username, pass: tempPass })
  }

  const handleForceLogout = (username: string) => {
    alert(`Đã vô hiệu hóa toàn bộ Token phiên đăng nhập của tài khoản @${username}!`)
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-parish-primary-light text-parish-primary rounded-xl">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-text-main">Quản Lý Tài Khoản & Phân Quyền (IAM)</h1>
              <p className="text-xs text-text-muted">Tạo tài khoản Giáo lý viên, cấp mật khẩu tạm, phân công lớp & khóa tài khoản</p>
            </div>
          </div>
        </div>

        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-parish-primary hover:bg-parish-primary-hover text-white text-sm font-semibold rounded-xl shadow-xs transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          <span>Tạo Tài Khoản GLV Mới</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-4 bg-surface-card border border-surface-border p-4 rounded-xl shadow-2xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-3 text-text-muted" />
          <input
            type="text"
            placeholder="Tìm theo Tên Giáo lý viên, Username, hoặc SĐT..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-surface-hover/30 border border-surface-border rounded-lg text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary"
          />
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-surface-card border border-surface-border rounded-xl shadow-2xs overflow-hidden">
        <table className="w-full text-left text-sm border-collapse">
          <thead className="bg-surface-hover/50 text-text-muted uppercase text-xs font-semibold border-b border-surface-border">
            <tr>
              <th className="p-4">Giáo Lý Viên / Người Dùng</th>
              <th className="p-4">Vai Trò (Role)</th>
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
                  {u.role === 'admin' && <span className="px-2.5 py-1 text-xs font-bold bg-purple-500/10 text-purple-600 rounded-full">Cha Xứ / Admin</span>}
                  {u.role === 'chunhiem' && <span className="px-2.5 py-1 text-xs font-bold bg-blue-500/10 text-blue-600 rounded-full">GLV Chủ Nhiệm</span>}
                  {u.role === 'phuta' && <span className="px-2.5 py-1 text-xs font-bold bg-emerald-500/10 text-emerald-600 rounded-full">GLV Phụ Tá</span>}
                  {u.role === 'phuhuynh' && <span className="px-2.5 py-1 text-xs font-bold bg-amber-500/10 text-amber-600 rounded-full">Phụ Huynh</span>}
                </td>
                <td className="p-4">
                  <div className="flex flex-wrap gap-1">
                    {u.assignedClasses.map((clsId) => {
                      const cls = MOCK_CLASSES.find((c) => c.id === clsId)
                      return (
                        <span key={clsId} className="px-2 py-0.5 text-xs font-medium bg-surface-hover border border-surface-border rounded-md text-text-main">
                          {cls?.name || clsId}
                        </span>
                      )
                    })}
                  </div>
                </td>
                <td className="p-4">
                  {u.status === 'ACTIVE' && <span className="px-2.5 py-1 text-xs font-semibold bg-emerald-500/10 text-emerald-600 rounded-full">Đang Hoạt Động</span>}
                  {u.status === 'LOCKED' && <span className="px-2.5 py-1 text-xs font-semibold bg-rose-500/10 text-rose-600 rounded-full">Đã Khóa</span>}
                  {u.status === 'FORCE_PASSWORD_CHANGE' && <span className="px-2.5 py-1 text-xs font-semibold bg-amber-500/10 text-amber-600 rounded-full">Cần Đổi Pass</span>}
                </td>
                <td className="p-4 text-xs text-text-muted">{u.lastLoginAt}</td>
                <td className="p-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleResetPassword(u.username)}
                      title="Reset Mật Khẩu Tạm"
                      className="p-1.5 rounded-lg text-text-muted hover:text-amber-600 hover:bg-amber-500/10 transition-colors"
                    >
                      <Key className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleForceLogout(u.username)}
                      title="Force Logout Phiên Đăng Nhập"
                      className="p-1.5 rounded-lg text-text-muted hover:text-rose-600 hover:bg-rose-500/10 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => toggleUserStatus(u.id)}
                      title={u.status === 'ACTIVE' ? 'Khóa Tài Khoản' : 'Mở Khóa Tài Khoản'}
                      className="p-1.5 rounded-lg text-text-muted hover:text-parish-primary hover:bg-parish-primary-light transition-colors"
                    >
                      {u.status === 'ACTIVE' ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4 text-emerald-600" />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal: Create User */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-surface-card border border-surface-border rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
            <form onSubmit={handleCreateUser} className="p-6 space-y-4">
              <h2 className="text-lg font-bold text-text-main flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-parish-primary" />
                <span>Tạo Tài Khoản Giáo Lý Viên Mới</span>
              </h2>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase mb-1">Username (Tên Đăng Nhập)</label>
                  <input
                    type="text"
                    required
                    placeholder="ví dụ: glv_nguyenvana"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase mb-1">Họ Và Tên Đầy Đủ</label>
                  <input
                    type="text"
                    required
                    placeholder="ví dụ: Trưởng Giuse Nguyễn Văn A"
                    value={newFullName}
                    onChange={(e) => setNewFullName(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase mb-1">Số Điện Thoại</label>
                  <input
                    type="text"
                    placeholder="0901234567"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase mb-1">Phân Quyền (Role)</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as any)}
                    className="w-full px-3 py-2 bg-surface-card border border-surface-border rounded-lg text-sm text-text-main focus:outline-hidden focus:ring-2 focus:ring-parish-primary"
                  >
                    <option value="chunhiem">GLV Chủ Nhiệm</option>
                    <option value="phuta">GLV Phụ Tá</option>
                    <option value="admin">Admin / Thư Ký Xứ Đoàn</option>
                    <option value="phuhuynh">Phụ Huynh</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase mb-1">Phân Công Lớp Phụ Trách</label>
                  <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto p-2 border border-surface-border rounded-lg">
                    {MOCK_CLASSES.map((cls) => (
                      <label key={cls.id} className="flex items-center gap-2 text-xs text-text-main cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedClasses.includes(cls.id)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedClasses([...selectedClasses, cls.id])
                            else setSelectedClasses(selectedClasses.filter((id) => id !== cls.id))
                          }}
                          className="rounded-xs text-parish-primary"
                        />
                        <span>{cls.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-surface-border">
                <button type="button" onClick={() => setIsCreateModalOpen(false)} className="px-4 py-2 text-sm font-medium text-text-muted hover:bg-surface-hover rounded-lg">
                  Hủy Bỏ
                </button>
                <button type="submit" className="px-5 py-2 text-sm font-semibold text-white bg-parish-primary hover:bg-parish-primary-hover rounded-lg shadow-xs">
                  Tạo Tài Khoản
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Temp Password Display */}
      {tempPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-surface-card border border-surface-border rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3 text-emerald-600">
              <CheckCircle2 className="w-8 h-8" />
              <h2 className="text-lg font-bold text-text-main">Cấp Mật Khẩu Tạm Thành Công</h2>
            </div>
            <p className="text-xs text-text-muted">Hãy gửi mật khẩu tạm này cho Giáo lý viên. Hệ thống sẽ ép buộc đổi mật khẩu ở lần đăng nhập đầu tiên.</p>

            <div className="p-4 bg-surface-hover border border-surface-border rounded-xl space-y-2 text-center">
              <div className="text-xs text-text-muted">Username: <strong className="text-text-main">@{tempPasswordModal.username}</strong></div>
              <div className="text-xl font-mono font-bold text-parish-primary tracking-wider">{tempPasswordModal.pass}</div>
            </div>

            <button
              onClick={() => setTempPasswordModal(null)}
              className="w-full py-2.5 text-sm font-semibold text-white bg-parish-primary hover:bg-parish-primary-hover rounded-lg shadow-xs"
            >
              Đã Lưu & Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
