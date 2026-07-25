import { useState, useEffect } from 'react'
import { Award, UserCheck, Shield, Plus, Edit2, Key, Lock, Unlock, Search, AlertCircle } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useAuthStore } from '../stores/authStore'

interface CatechistUser {
  id: string
  username: string
  fullName: string
  role: 'admin' | 'chunhiem' | 'phuta' | 'phuhuynh'
  status: 'ACTIVE' | 'LOCKED' | 'INACTIVE' | 'FORCE_PASSWORD_CHANGE'
  assignedClasses: string[]
  createdAt?: string
}

export function CatechistPage() {
  const [users, setUsers] = useState<CatechistUser[]>([])
  const [classes, setClasses] = useState<{ id: string; name: string; code: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')

  const { user: currentUser } = useAuthStore()

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [userList, classList] = await Promise.all([
        api.getUsers(),
        api.getClasses()
      ])
      setUsers(userList || [])
      setClasses(classList || [])
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Không thể tải danh sách huynh trưởng'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const filteredUsers = users.filter(u => {
    const matchSearch = u.fullName.toLowerCase().includes(search.toLowerCase()) ||
                        u.username.toLowerCase().includes(search.toLowerCase())
    const matchRole = roleFilter === 'all' || u.role === roleFilter
    return matchSearch && matchRole
  })

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return <span className="px-2 py-0.5 bg-rose-500/10 text-rose-600 font-bold text-[10px] rounded-full">Ban Quản Trị</span>
      case 'chunhiem':
        return <span className="px-2 py-0.5 bg-blue-500/10 text-blue-600 font-bold text-[10px] rounded-full">Huynh Trưởng Chủ Nhiệm</span>
      case 'phuta':
        return <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-600 font-bold text-[10px] rounded-full">Huynh Trưởng Phụ Tá</span>
      default:
        return <span className="px-2 py-0.5 bg-slate-500/10 text-slate-600 font-bold text-[10px] rounded-full">Phụ Huynh</span>
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-parish-primary/10 rounded-xl flex items-center justify-center">
            <Award className="w-5 h-5 text-parish-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-text-main">Danh Sách Huynh Trưởng & Phân Công</h1>
            <p className="text-xs text-text-muted">{filteredUsers.length} Giáo Lý Viên / Huynh Trưởng trong Xứ Đoàn</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs font-semibold text-rose-600 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex gap-3 flex-wrap items-center justify-between bg-surface-card p-3 border border-surface-border rounded-xl">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-text-muted" />
          <input
            type="text"
            placeholder="Tìm theo tên hoặc tên đăng nhập..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-surface-hover/30 border border-surface-border rounded-lg text-xs"
          />
        </div>

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-3 py-1.5 bg-surface-hover/30 border border-surface-border rounded-lg text-xs text-text-main"
        >
          <option value="all">Tất cả vai trò</option>
          <option value="chunhiem">Huynh Trưởng Chủ Nhiệm</option>
          <option value="phuta">Huynh Trưởng Phụ Tá</option>
          <option value="admin">Ban Quản Trị</option>
        </select>
      </div>

      {/* Cards Grid */}
      {loading ? (
        <div className="py-12 text-center text-text-muted text-sm">Đang tải danh sách Huynh Trưởng...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredUsers.map((u) => {
            const assignedClassNameList = u.assignedClasses
              ?.map(cid => classes.find(c => c.id === cid || c.code === cid)?.name || cid)
              .join(', ') || 'Chưa phân công'

            return (
              <div key={u.id} className="bg-surface-card border border-surface-border p-4 rounded-xl space-y-3 shadow-xs">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-sm text-text-main">{u.fullName}</h3>
                    <p className="text-xs text-text-muted">@{u.username}</p>
                  </div>
                  {getRoleBadge(u.role)}
                </div>

                <div className="bg-surface-hover/30 p-2.5 rounded-lg space-y-1">
                  <span className="text-[11px] font-semibold text-text-muted uppercase">Lớp Phụ Trách:</span>
                  <p className="text-xs font-medium text-text-main">{assignedClassNameList}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default CatechistPage
