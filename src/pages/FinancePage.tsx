import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import {
  Wallet,
  ArrowDownRight,
  ArrowUpRight,
  ArrowRightLeft,
  Users,
  Printer,
  Trash2,
  Search,
  TrendingUp,
  Layers,
  ChevronLeft,
  ChevronRight,
  Calendar,
  X,
} from 'lucide-react'
import { useFinanceStore, type LedgerFilters } from '../stores/financeStore'
import { useAuthStore } from '../stores/authStore'
import { useAcademicYearStore } from '../stores/academicYearStore'
import { useToastStore } from '../stores/toastStore'
import { TransactionModal } from '../components/finance/TransactionModal'
import { ClassFeeCollectionModal } from '../components/finance/ClassFeeCollectionModal'
import { PrintReceiptModal } from '../components/finance/PrintReceiptModal'
import { FundManageModal } from '../components/finance/FundManageModal'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { PageHeader } from '../components/common/PageHeader'
import { EmptyState, SkeletonCardGrid, SkeletonTable } from '../components/common/StateFeedback'
import { DesktopAppShell } from '../components/desktop/DesktopAppShell'
import { formatVND } from '../utils/receiptGenerator'
import { formatDateVi } from '../utils/formatDate'
import type { FinancialTransaction, TransactionType } from '../types/finance'
import { Button, FilterChips, Select, TextInput } from '../components/common/ui'

export const FinancePage: React.FC = () => {
  const { user } = useAuthStore()
  const {
    summary,
    funds,
    transactions,
    selectedFundId,
    selectedAcademicYear: _selectedAcademicYear,
    pagination,
    fetchSummary,
    fetchTransactions,
    deleteTransaction,
    setSelectedFundId,
    setSelectedAcademicYear: _setSelectedAcademicYear,
    ledgerFilters,
    setLedgerFilters,
    setPage,
    isLoading: _isLoading,
  } = useFinanceStore()

  const { currentYear: _currentYear, academicYears: _academicYears } = useAcademicYearStore()
  const addToast = useToastStore((s) => s.addToast)

  const navigate = useNavigate()
  const search = useSearch({ from: '/finances' })

  // Modal States
  const [isTxModalOpen, setIsTxModalOpen] = useState(false)
  const [txModalType, setTxModalType] = useState<TransactionType>('INCOME')
  const isFeeModalOpen = search.tab === 'fees'
  const [isFundModalOpen, setIsFundModalOpen] = useState(false)
  const [selectedTxForPrint, setSelectedTxForPrint] = useState<FinancialTransaction | null>(null)

  const handleOpenFeeModal = () => {
    navigate({
      to: '/finances',
      search: (prev: any) => ({ ...prev, tab: 'fees' }),
      replace: true,
    })
  }

  const handleCloseFeeModal = () => {
    navigate({
      to: '/finances',
      search: (prev: any) => ({ ...prev, tab: 'ledger' }),
      replace: true,
    })
  }

  // Confirm Dialog State
  const [txToDelete, setTxToDelete] = useState<FinancialTransaction | null>(null)

  // Filter States
  // P0.6 (audit desktop 2026-08-22): type + date range lọc SERVER-SIDE qua
  // store.ledgerFilters (server hỗ trợ sẵn query params) — trước đây client
  // filter trên 1 trang server-pagination làm count/pagination sai.
  // Text search giữ client-side (server chưa có param search) → badge count
  // hiển thị trung thực "kết quả trên trang hiện tại".
  // Phase 0 (Calm 2026): debouncedSearch 300ms + deferred (transition) giữ input 60fps
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const deferredSearch = React.useDeferredValue(debouncedSearch)
  const isFinanceSearchStale = debouncedSearch !== deferredSearch

  // Chart tooltip
  const [tooltip, setTooltip] = useState<{ x: number; y: number; month: string; income: number; expense: number } | null>(null)
  const chartRef = useRef<HTMLDivElement>(null)

  // Loading state for initial fetch
  const [isInitialLoading, setIsInitialLoading] = useState(true)

  // Search debounce
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300)
    return () => clearTimeout(timer)
  }, [searchTerm])

  useEffect(() => {
    const load = async () => {
      await Promise.all([fetchSummary(), fetchTransactions()])
      setIsInitialLoading(false)
    }
    load()
  }, [fetchSummary, fetchTransactions])

  if (user?.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <div className="p-4 rounded-full bg-parish-danger-bg text-parish-danger mb-3">
          <Wallet className="w-10 h-10" />
        </div>
        <h2 className="typography-section-title">Giới Hạn Quyền Quản Trị</h2>
        <p className="typography-body-sm text-text-muted mt-1 max-w-md">
          Phân hệ Quản Lý Quỹ & Thu Chi Xứ Đoàn chỉ dành cho tài khoản có quyền Quản Trị (Admin / Thủ Quỹ).
        </p>
      </div>
    )
  }

  const handleOpenTx = (type: TransactionType) => {
    setTxModalType(type)
    setIsTxModalOpen(true)
  }

  const handleDeleteClick = (tx: FinancialTransaction) => {
    setTxToDelete(tx)
  }

  const handleConfirmDelete = async () => {
    if (!txToDelete) return
    try {
      const ok = await deleteTransaction(txToDelete.id)
      if (ok) {
        addToast(`Đã xóa giao dịch "${txToDelete.title}"`, 'success')
      } else {
        addToast('Không thể xóa giao dịch. Vui lòng thử lại!', 'error')
      }
    } catch {
      addToast('Không thể xóa giao dịch. Vui lòng thử lại!', 'error')
    } finally {
      setTxToDelete(null)
    }
  }

  // Client-side text search trên trang hiện tại (server chưa hỗ trợ param search)
  const isTextSearchActive = deferredSearch.trim().length > 0
  const filteredTransactions = transactions.filter((tx) => {
    if (deferredSearch) {
      const q = deferredSearch.toLowerCase()
      const matchTitle = tx.title.toLowerCase().includes(q)
      const matchPerson = (tx.personName || tx.studentName || '').toLowerCase().includes(q)
      const matchCategory = tx.category.toLowerCase().includes(q)
      const matchReceipt = (tx.receiptNumber || '').toLowerCase().includes(q)
      if (!matchTitle && !matchPerson && !matchCategory && !matchReceipt) return false
    }
    return true
  })

  // Pagination
  const totalPages = Math.ceil(pagination.total / pagination.pageSize)

  // Chart max value calculation
  const maxMonthValue = Math.max(
    ...(summary?.monthlyStats?.flatMap((m) => [m.income, m.expense]) || [1000000])
  ) || 1000000

  // Chart tooltip handlers
  const handleBarMouseEnter = (e: React.MouseEvent<SVGRectElement>, month: string, income: number, expense: number) => {
    const svgRect = e.currentTarget.ownerSVGElement?.getBoundingClientRect()
    const rect = e.currentTarget.getBoundingClientRect()
    if (svgRect) {
      setTooltip({
        x: rect.left - svgRect.left + rect.width / 2,
        y: rect.top - svgRect.top - 8,
        month,
        income,
        expense,
      })
    }
  }

  return (
    <DesktopAppShell width="wide">
      {/* Top Header Bar */}
      <PageHeader
        icon={<Wallet className="w-5 h-5" />}
        title="Quản Lý Quỹ & Thu Chi Xứ Đoàn"
        description="Hệ thống kế toán & quản trị ngân quỹ Thiếu Nhi Thánh Thể minh bạch, chuẩn mực"
        actions={
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none snap-x snap-mandatory py-1 max-w-full sm:flex-wrap sm:overflow-visible" style={{ WebkitOverflowScrolling: 'touch' }}>
            <Button
              onClick={() => handleOpenTx('INCOME')}
              variant="plain"
              size="sm"
              leadingIcon={<ArrowDownRight aria-hidden="true" className="w-4 h-4" />}
              className="shrink-0 snap-start min-h-[44px] sm:min-h-[40px]"
              style={{ background: 'var(--color-finance-income)', color: 'var(--color-text-inverse)' }}
            >
              Tạo Phiếu Thu
            </Button>
            <Button
              onClick={() => handleOpenTx('EXPENSE')}
              variant="plain"
              size="sm"
              leadingIcon={<ArrowUpRight aria-hidden="true" className="w-4 h-4" />}
              className="shrink-0 snap-start min-h-[44px] sm:min-h-[40px]"
              style={{ background: 'var(--color-finance-expense)', color: 'var(--color-text-inverse)' }}
            >
              Tạo Phiếu Chi
            </Button>
            <Button
              onClick={() => handleOpenTx('TRANSFER')}
              variant="plain"
              size="sm"
              leadingIcon={<ArrowRightLeft aria-hidden="true" className="w-4 h-4" />}
              className="shrink-0 snap-start min-h-[44px] sm:min-h-[40px]"
              style={{ background: 'var(--color-finance-transfer)', color: 'var(--color-text-inverse)' }}
            >
              Chuyển Quỹ
            </Button>
            <Button
              onClick={handleOpenFeeModal}
              variant="primary"
              size="sm"
              leadingIcon={<Users aria-hidden="true" className="w-4 h-4" />}
              className="shrink-0 snap-start min-h-[44px] sm:min-h-[40px]"
            >
              Thu Niên Liễm
            </Button>
            <Button
              onClick={() => setIsFundModalOpen(true)}
              variant="secondary"
              size="sm"
              leadingIcon={<Layers aria-hidden="true" className="w-4 h-4" />}
              className="shrink-0 snap-start min-h-[44px] sm:min-h-[40px]"
            >
              Quản Lý Quỹ
            </Button>
          </div>
        }
      />

      {/* 4 Metric Summary Cards */}
      {isInitialLoading ? (
        <SkeletonCardGrid count={4} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Available Balance */}
          <div className="card">
            <div className="flex items-center justify-between text-text-muted mb-2">
              <span className="typography-caption">Tổng Số Dư Khả Dụng</span>
              <div className="icon-container-lg rounded-lg bg-parish-primary-light text-parish-primary">
                <Wallet className="w-4 h-4" />
              </div>
            </div>
            <div className="typography-numeric-emphasis text-text-main" style={{ fontSize: '1.5rem' }}>
              {formatVND(summary?.totalBalance || 0)}
            </div>
            <div className="typography-body-sm text-text-muted mt-2 flex items-center gap-1">
              <span>Toàn bộ {funds.length} quỹ đang hoạt động</span>
            </div>
          </div>

          {/* Total Income */}
          <div className="card">
            <div className="flex items-center justify-between text-text-muted mb-2">
              <span className="typography-caption">Tổng Thu Niên Khóa</span>
              <div className="icon-container-lg rounded-lg" style={{ background: 'color-mix(in srgb, var(--color-finance-income) 10%, transparent)', color: 'var(--color-finance-income)' }}>
                <ArrowDownRight className="w-4 h-4" />
              </div>
            </div>
            <div className="typography-numeric-emphasis" style={{ fontSize: '1.5rem', color: 'var(--color-finance-income)' }}>
              {formatVND(summary?.totalIncome || 0)}
            </div>
            <div className="typography-body-sm mt-2 font-medium" style={{ color: 'var(--color-finance-income)' }}>
              Niên khóa {summary?.academicYear || '2025-2026'}
            </div>
          </div>

          {/* Total Expense */}
          <div className="card">
            <div className="flex items-center justify-between text-text-muted mb-2">
              <span className="typography-caption">Tổng Chi Niên Khóa</span>
              <div className="icon-container-lg rounded-lg" style={{ background: 'color-mix(in srgb, var(--color-finance-expense) 10%, transparent)', color: 'var(--color-finance-expense)' }}>
                <ArrowUpRight className="w-4 h-4" />
              </div>
            </div>
            <div className="typography-numeric-emphasis" style={{ fontSize: '1.5rem', color: 'var(--color-finance-expense)' }}>
              {formatVND(summary?.totalExpense || 0)}
            </div>
            <div className="typography-body-sm mt-2 font-medium" style={{ color: 'var(--color-finance-expense)' }}>
              Tất cả hoạt động & sự kiện
            </div>
          </div>

          {/* Fee Collection Rate */}
          <div className="card">
            <div className="flex items-center justify-between text-text-muted mb-2">
              <span className="typography-caption">Thu Niên Liễm Đoàn Sinh</span>
              <div className="icon-container-lg rounded-lg bg-parish-info-bg text-parish-info">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="typography-numeric-emphasis" style={{ fontSize: '1.5rem' }}>
              {summary?.feeStats?.collectionRate || 0}%
            </div>
            <div className="typography-body-sm text-text-muted mt-2 flex items-center justify-between">
              <span>Đã thu: {summary?.feeStats?.paidCount || 0} em</span>
              <span className="font-semibold text-text-main">{formatVND(summary?.feeStats?.totalCollected || 0)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Funds Carousel / Filter Pills */}
      <FilterChips
        ariaLabel="Chọn quỹ"
        appearance="pills"
        value={selectedFundId}
        onValueChange={setSelectedFundId}
        className="overflow-x-auto pb-2 scrollbar-thin"
        items={[
          {
            value: 'ALL',
            icon: <Layers aria-hidden="true" className="w-3.5 h-3.5" />,
            label: `Tất Cả Quỹ (${formatVND(summary?.totalBalance || 0)})`,
          },
          ...funds.map((fund) => ({
            value: fund.id,
            label: (
              <>
                <span>{fund.name}</span>
                <span className={`px-1.5 py-0.5 rounded text-xs ${selectedFundId === fund.id ? 'bg-black/10 text-text-inverse' : 'bg-surface-card text-text-main'}`}>
                  {formatVND(fund.currentBalance)}
                </span>
              </>
            ),
          })),
        ]}
      />

      {/* Monthly SVG Income/Expense Chart */}
      <div className="card space-y-3" ref={chartRef}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-parish-primary" />
            <h3 className="typography-card-title">Biểu Đồ Thu - Chi Theo Tháng (VND)</h3>
          </div>
          <div className="flex items-center gap-4 typography-body-sm">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs inline-block" style={{ background: 'var(--color-finance-income)' }} /> Thu Nhập
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs inline-block" style={{ background: 'var(--color-finance-expense)' }} /> Chi Phí
            </span>
          </div>
        </div>

        {/* Pure SVG Bar Chart with Custom Tooltip */}
        <div
          className="h-44 w-full pt-4 relative overflow-x-auto scrollbar-none"
          role="region"
          aria-label="Biểu đồ thu chi cuộn ngang"
          tabIndex={0}
        >
          <div className="min-w-[640px] h-full">
          <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 1200 160" role="img" aria-label="Biểu đồ thu chi theo tháng">
            <line x1="0" y1="0" x2="1200" y2="0" stroke="currentColor" strokeOpacity="0.08" />
            <line x1="0" y1="50" x2="1200" y2="50" stroke="currentColor" strokeOpacity="0.08" />
            <line x1="0" y1="100" x2="1200" y2="100" stroke="currentColor" strokeOpacity="0.08" />
            <line x1="0" y1="140" x2="1200" y2="140" stroke="currentColor" strokeOpacity="0.15" />

            {(summary?.monthlyStats || []).map((m, idx) => {
              const xCenter = idx * 100 + 50
              const incomeHeight = maxMonthValue > 0 ? (m.income / maxMonthValue) * 120 : 0
              const expenseHeight = maxMonthValue > 0 ? (m.expense / maxMonthValue) * 120 : 0

              return (
                <g key={m.month}>
                  <rect
                    x={xCenter - 22}
                    y={140 - incomeHeight}
                    width={18}
                    height={Math.max(incomeHeight, 2)}
                    rx={3}
                    style={{ fill: 'var(--color-finance-income)', cursor: 'pointer' }}
                    onMouseEnter={(e) => handleBarMouseEnter(e, m.month, m.income, m.expense)}
                    onMouseLeave={() => setTooltip(null)}
                  />
                  <rect
                    x={xCenter + 4}
                    y={140 - expenseHeight}
                    width={18}
                    height={Math.max(expenseHeight, 2)}
                    rx={3}
                    style={{ fill: 'var(--color-finance-expense)', cursor: 'pointer' }}
                    onMouseEnter={(e) => handleBarMouseEnter(e, m.month, m.income, m.expense)}
                    onMouseLeave={() => setTooltip(null)}
                  />
                  <text
                    x={xCenter}
                    y={155}
                    textAnchor="middle"
                    fontSize="11"
                    className="fill-text-muted font-medium"
                  >
                    {m.month}
                  </text>
                </g>
              )
            })}
          </svg>
          </div>

          {/* Custom Tooltip */}
          {tooltip && (
            <div
              className="absolute z-10 pointer-events-none px-3 py-2 rounded-lg border border-surface-border bg-surface-card shadow-dropdown text-xs"
              style={{ left: tooltip.x, top: tooltip.y, transform: 'translate(-50%, -100%)' }}
            >
              <div className="font-bold text-text-main mb-1">{tooltip.month}</div>
              <div className="flex items-center gap-1.5" style={{ color: 'var(--color-finance-income)' }}>
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: 'var(--color-finance-income)' }} />
                Thu: {formatVND(tooltip.income)}
              </div>
              <div className="flex items-center gap-1.5" style={{ color: 'var(--color-finance-expense)' }}>
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: 'var(--color-finance-expense)' }} />
                Chi: {formatVND(tooltip.expense)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Transaction Ledger Table — Phase 0 deferred search stale */}
      <div className="table-wrapper" aria-busy={isFinanceSearchStale} style={{ opacity: isFinanceSearchStale ? 0.7 : 1, transition: 'opacity 120ms var(--motion-ease-out)' }}>
        {/* Ledger Toolbar */}
        <div className="p-4 border-b border-surface-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="typography-card-title">Sổ Quỹ Giao Dịch</h3>
            <span className="badge badge-neutral">
              {isTextSearchActive
                ? `${filteredTransactions.length} / ${pagination.total} khớp (trên trang hiện tại)`
                : `${pagination.total} giao dịch`}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative flex-1 sm:flex-initial">
              <TextInput
                aria-label="Tìm kiếm sổ quỹ giao dịch"
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm mã phiếu, người nộp/nhận, danh mục..."
                density="sm"
                className="w-full sm:w-[260px] pr-8"
              />
              <Search className="w-3.5 h-3.5 text-text-muted absolute left-3 top-2.5 pointer-events-none" />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded text-text-muted hover:text-text-main"
                  aria-label="Xóa từ khóa tìm kiếm"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Date Range Filter */}
            <div className="flex items-center gap-1 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-initial">
                <TextInput
                  aria-label="Ngày giao dịch bắt đầu"
                  type="date"
                  value={ledgerFilters.startDate}
                  onChange={(e) => setLedgerFilters({ startDate: e.target.value })}
                  className="h-9 text-xs w-full sm:w-[130px]"
                  style={{ paddingLeft: '32px' }}
                />
                <Calendar className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-2.5 pointer-events-none" />
              </div>
              <span className="text-text-muted text-xs">—</span>
              <div className="relative flex-1 sm:flex-initial">
                <TextInput
                  aria-label="Ngày giao dịch kết thúc"
                  type="date"
                  value={ledgerFilters.endDate}
                  onChange={(e) => setLedgerFilters({ endDate: e.target.value })}
                  className="h-9 text-xs w-full sm:w-[130px]"
                  style={{ paddingLeft: '32px' }}
                />
                <Calendar className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-2.5 pointer-events-none" />
              </div>
            </div>

            {/* Type Filter */}
            <Select
              aria-label="Loại giao dịch"
              value={ledgerFilters.type}
              onChange={(e) => setLedgerFilters({ type: e.target.value as LedgerFilters['type'] })}
              className="h-9 text-xs w-auto"
            >
              <option value="ALL">Tất cả loại</option>
              <option value="INCOME">Thu nhập</option>
              <option value="EXPENSE">Chi phí</option>
              <option value="TRANSFER">Chuyển quỹ</option>
            </Select>
          </div>
        </div>

        {/* Desktop Table */}
        <div className="table-scroll hidden md:block" role="region" aria-label="Sổ quỹ giao dịch" tabIndex={0}>
          {isInitialLoading ? (
            <SkeletonTable rows={5} cols={7} />
          ) : filteredTransactions.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="Chưa có giao dịch"
              description="Không có giao dịch nào phù hợp với điều kiện tìm kiếm"
            />
          ) : (
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-surface-app text-text-muted text-xs font-bold uppercase tracking-wider border-b-2 border-surface-border">
                  <th className="py-2.5 px-4 w-28" scope="col">Ngày</th>
                  <th className="py-2.5 px-4 w-32" scope="col">Số Phiếu</th>
                  <th className="py-2.5 px-4" scope="col">Lý Do / Trích Yếu</th>
                  <th className="py-2.5 px-4 w-36" scope="col">Quỹ Hoạt Động</th>
                  <th className="py-2.5 px-4 w-40" scope="col">Đối Tượng</th>
                  <th className="py-2.5 px-4 w-32 text-right" scope="col">Số Tiền</th>
                  <th className="py-2.5 px-4 w-28 text-center" scope="col">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {filteredTransactions.map((tx) => {
                  const isInc = tx.type === 'INCOME'
                  const isExp = tx.type === 'EXPENSE'
                  const isTrf = tx.type === 'TRANSFER'

                  return (
                    <tr key={tx.id} className="hover:bg-surface-hover/50 transition-colors">
                      <td className="py-3 px-4 typography-numeric text-text-muted">{formatDateVi(tx.transactionDate)}</td>
                      <td className="py-3 px-4">
                        <span className={`badge ${isInc ? 'badge-success' : isExp ? 'badge-danger' : 'badge-info'}`}>
                          {tx.receiptNumber || 'PT-000'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-text-main">{tx.title}</div>
                        <div className="typography-body-sm text-text-muted flex items-center gap-1.5 mt-0.5">
                          <span className="badge badge-neutral text-xs py-0 px-1.5">{tx.category}</span>
                          {tx.description && <span className="truncate max-w-xs">{tx.description}</span>}
                        </div>
                      </td>
                      <td className="py-3 px-4 typography-body-sm font-medium text-text-main">
                        <div>{tx.fundName}</div>
                        {isTrf && tx.targetFundName && (
                          <div className="text-xs font-semibold flex items-center gap-1" style={{ color: 'var(--color-finance-transfer)' }}>
                            ➔ {tx.targetFundName}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 typography-body-sm text-text-muted">
                        <div className="font-medium text-text-main">{tx.personName || tx.studentName || '—'}</div>
                        {tx.className && <div className="text-xs">{tx.className}</div>}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="typography-numeric-emphasis" style={{ color: isInc ? 'var(--color-finance-income)' : isExp ? 'var(--color-finance-expense)' : 'var(--color-finance-transfer)' }}>
                          {isInc ? '+' : isExp ? '-' : ''}{formatVND(tx.amount)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button type="button" onClick={() => setSelectedTxForPrint(tx)} title="Xem & In Phiếu" className="btn btn-icon btn-sm btn-ghost">
                            <Printer className="w-4 h-4" />
                          </button>
                          <button type="button" onClick={() => handleDeleteClick(tx)} title="Xóa giao dịch" className="btn btn-icon btn-sm btn-ghost" style={{ color: 'var(--color-text-muted)' }}>
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden">
          {isInitialLoading ? (
            <SkeletonTable rows={3} cols={2} />
          ) : filteredTransactions.length === 0 ? (
            <EmptyState icon={Wallet} title="Chưa có giao dịch" description="Không có giao dịch phù hợp" />
          ) : (
            <div className="divide-y divide-surface-border">
              {filteredTransactions.map((tx) => {
                const isInc = tx.type === 'INCOME'
                const isExp = tx.type === 'EXPENSE'
                return (
                  <div key={tx.id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className={`badge ${isInc ? 'badge-success' : isExp ? 'badge-danger' : 'badge-info'}`}>
                        {tx.receiptNumber || 'PT-000'}
                      </span>
                      <span className="typography-numeric text-text-muted text-xs">{formatDateVi(tx.transactionDate)}</span>
                    </div>
                    <div className="font-semibold text-text-main text-sm">{tx.title}</div>
                    <div className="flex items-center gap-2 typography-body-sm text-text-muted">
                      <span className="badge badge-neutral text-xs py-0 px-1.5">{tx.category}</span>
                      <span>{tx.fundName}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="typography-numeric-emphasis" style={{ color: isInc ? 'var(--color-finance-income)' : isExp ? 'var(--color-finance-expense)' : 'var(--color-finance-transfer)' }}>
                        {isInc ? '+' : isExp ? '-' : ''}{formatVND(tx.amount)}
                      </span>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => setSelectedTxForPrint(tx)} className="btn btn-icon btn-sm btn-ghost min-h-[44px] min-w-[44px] inline-flex items-center justify-center" aria-label={`Xem và in phiếu ${tx.receiptNumber || tx.title}`}>
                          <Printer className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => handleDeleteClick(tx)} className="btn btn-icon btn-sm btn-ghost min-h-[44px] min-w-[44px] inline-flex items-center justify-center" style={{ color: 'var(--color-text-muted)' }} aria-label={`Xóa giao dịch ${tx.title}`}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-surface-border bg-surface-hover/30 flex items-center justify-between">
            <p className="typography-body-sm font-bold text-text-secondary">
              Trang <span className="text-text-main">{pagination.page}</span> / {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                disabled={pagination.page <= 1}
                onClick={() => setPage(pagination.page - 1)}
                className="btn btn-icon btn-sm btn-secondary disabled:opacity-30"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                disabled={pagination.page >= totalPages}
                onClick={() => setPage(pagination.page + 1)}
                className="btn btn-icon btn-sm btn-secondary disabled:opacity-30"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={Boolean(txToDelete)}
        title="Xóa giao dịch"
        message={`Xác nhận xóa giao dịch "${txToDelete?.title}" (${txToDelete ? formatVND(txToDelete.amount) : ''})?`}
        confirmText="Xóa"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setTxToDelete(null)}
      />

      {/* Modals */}
      <TransactionModal isOpen={isTxModalOpen} onClose={() => setIsTxModalOpen(false)} initialType={txModalType} />
      <ClassFeeCollectionModal isOpen={isFeeModalOpen} onClose={handleCloseFeeModal} />
      <FundManageModal isOpen={isFundModalOpen} onClose={() => setIsFundModalOpen(false)} />
      <PrintReceiptModal isOpen={Boolean(selectedTxForPrint)} onClose={() => setSelectedTxForPrint(null)} transaction={selectedTxForPrint} />
    </DesktopAppShell>
  )
}
export default FinancePage
