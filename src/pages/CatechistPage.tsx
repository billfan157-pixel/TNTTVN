import { useState, useEffect } from 'react'
import { Award, Search, AlertCircle } from 'lucide-react'
import { PageHeader } from '../components/common/PageHeader'
import { DesktopAppShell } from '../components/desktop/DesktopAppShell'
import { SkeletonCardGrid, NoResultState } from '../components/common/StateFeedback'
import { api, ApiError } from '../lib/api'

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

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [userList, classList] = await Promise.all([
        api.getCatechists(),
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
        return <span className="px-2 py-0.5 bg-sky-500/10 text-sky-600 font-bold text-[10px] rounded-full">Huynh Trưởng Chủ Nhiệm</span>
      case 'phuta':
        return <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-600 font-bold text-[10px] rounded-full">Huynh Trưởng Phụ Tá</span>
      default:
        return <span className="px-2 py-0.5 bg-surface-hover text-text-secondary font-bold text-[10px] rounded-full">Phụ Huynh</span>
    }
  }

  return (
    <DesktopAppShell width="wide" className="flex flex-col gap-6">
      {/* Header */}
      <PageHeader
        icon={<Award className="w-5 h-5" />}
        title="Danh Sách Huynh Trưởng & Phân Công"
        description={`${filteredUsers.length} Giáo Lý Viên / Huynh Trưởng trong Xứ Đoàn`}
      />

      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs font-semibold text-rose-600 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filter Bar */}
      <div className="view-toolbar">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-text-placeholder" />
          <input
            type="text"
            placeholder="Tìm theo tên hoặc tên đăng nhập..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="form-input-sm w-full pl-10"
          />
        </div>

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="form-select text-sm font-medium"
        >
          <option value="all">Tất cả vai trò</option>
          <option value="chunhiem">Huynh Trưởng Chủ Nhiệm</option>
          <option value="phuta">Huynh Trưởng Phụ Tá</option>
          <option value="admin">Ban Quản Trị</option>
        </select>
      </div>

      {/* Cards Grid */}
      {loading ? (
        <SkeletonCardGrid count={6} />
      ) : filteredUsers.length === 0 ? (
        <NoResultState
          title="Không có Huynh Trưởng nào"
          description="Thử đổi bộ lọc vai trò hoặc từ khóa tìm kiếm."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredUsers.map((u) => {
            const assignedClassNameList = u.assignedClasses
              ?.map(cid => classes.find(c => c.id === cid || c.code === cid)?.name || cid)
              .join(', ') || 'Chưa phân công'

            return (
              <div key={u.id} className="entity-card app-panel--interactive p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-base text-text-main">{u.fullName}</h3>
                    <p className="text-xs font-semibold text-text-muted">@{u.username}</p>
                  </div>
                  {getRoleBadge(u.role)}
                </div>

                <div className="bg-surface-hover p-3 rounded-xl space-y-1 border border-surface-border">
                  <span className="text-[11px] font-semibold text-text-muted uppercase">Lớp Phụ Trách:</span>
                  <p className="text-xs font-medium text-text-main">{assignedClassNameList}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </DesktopAppShell>
  )
}

export default CatechistPage
