import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, roleMiddleware } from '../middleware/auth.js'
import { successResponse, listResponse, errorResponse } from '../utils/response.js'
import { getClientIp } from '../utils/ip.js'
import {
  listFunds,
  listTransactions,
  getFinanceSummary,
  listClassFeeRecords,
} from '../services/financeService.js'
import {
  createFund,
  createTransaction,
  deleteTransaction,
  updateStudentFee,
} from '../services/FinanceApplicationService.js'

export const financesRouter = new Hono()

// STRICT SECURITY RULE: Finance module is strictly for Admin role only
financesRouter.use('*', authMiddleware, roleMiddleware('admin'))

const createFundSchema = z.object({
  name: z.string().min(2, 'Tên quỹ tối thiểu 2 ký tự').max(100),
  code: z.string().min(2).max(50).optional(),
  description: z.string().max(500).optional(),
  initialBalance: z.number().min(0, 'Số dư ban đầu không được âm').default(0),
  isDefault: z.boolean().default(false),
})

const createTransactionSchema = z.object({
  fundId: z.string().min(1, 'Vui lòng chọn quỹ'),
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']),
  amount: z.number().positive('Số tiền phải lớn hơn 0'),
  category: z.string().min(1, 'Vui lòng chọn hoặc nhập danh mục').max(100),
  title: z.string().min(2, 'Trích yếu tối thiểu 2 ký tự').max(255),
  description: z.string().max(1000).optional(),
  personName: z.string().max(150).optional(),
  personPhone: z.string().max(20).optional(),
  studentId: z.string().optional(),
  classId: z.string().optional(),
  academicYear: z.string().optional(),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày giao dịch định dạng YYYY-MM-DD').optional(),
  receiptNumber: z.string().max(50).optional(),
  proofUrl: z.string().max(500).optional(),
  targetFundId: z.string().optional(),
})

const updateStudentFeeSchema = z.object({
  studentId: z.string().min(1),
  classId: z.string().min(1),
  academicYear: z.string().min(1),
  feeType: z.enum(['NIEN_LIEM', 'TRAI_HE', 'DONG_PHUC', 'GIAO_LY', 'OTHER']).default('NIEN_LIEM'),
  title: z.string().min(1),
  expectedAmount: z.number().min(0),
  paidAmount: z.number().min(0),
  status: z.enum(['UNPAID', 'PARTIAL', 'PAID', 'EXEMPTED']),
  note: z.string().max(500).optional(),
  createTransaction: z.boolean().default(false),
  fundId: z.string().optional(),
})

/**
 * GET /api/finances/summary
 * Returns overall dashboard stats, monthly income/expense chart, and fund balances.
 */
financesRouter.get('/summary', async (c) => {
  const user = c.get('user')
  const academicYear = c.req.query('academicYear')
  const summary = await getFinanceSummary(user.parishId, academicYear)
  return successResponse(c, summary)
})

/**
 * GET /api/finances/funds
 * Returns list of all funds with calculated current balances.
 */
financesRouter.get('/funds', async (c) => {
  const user = c.get('user')
  const funds = await listFunds(user.parishId)
  return successResponse(c, funds)
})

/**
 * POST /api/finances/funds
 * Creates a new fund account.
 */
financesRouter.post('/funds', zValidator('json', createFundSchema), async (c) => {
  const user = c.get('user')
  const data = c.req.valid('json')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

  try {
    const fund = await createFund(data, user.userId, user.parishId, ip, userAgent)
    return successResponse(c, fund, 201)
  } catch (err: any) {
    if (String(err).includes('UNIQUE') || String(err).includes('unique')) {
      return errorResponse(c, 'Mã quỹ hoặc tên quỹ đã tồn tại', 400)
    }
    throw err
  }
})

/**
 * GET /api/finances/transactions
 * Returns list of transactions with optional filters.
 */
financesRouter.get('/transactions', async (c) => {
  const user = c.get('user')
  const { fundId, type, category, academicYear, startDate, endDate, classId, limit, offset } = c.req.query()

  const result = await listTransactions(user.parishId, {
    fundId,
    type: type as any,
    category,
    academicYear,
    startDate,
    endDate,
    classId,
    limit: limit ? parseInt(limit, 10) : 100,
    offset: offset ? parseInt(offset, 10) : 0,
  })

  return listResponse(c, result.transactions, result.total)
})

/**
 * POST /api/finances/transactions
 * Creates an income, expense, or transfer transaction.
 */
financesRouter.post('/transactions', zValidator('json', createTransactionSchema), async (c) => {
  const user = c.get('user')
  const data = c.req.valid('json')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

  if (data.type === 'TRANSFER') {
    if (!data.targetFundId) {
      return errorResponse(c, 'Giao dịch chuyển quỹ bắt buộc chọn Quỹ Nhận', 400)
    }
    if (data.targetFundId === data.fundId) {
      return errorResponse(c, 'Quỹ nhận không được trùng với Quỹ nguồn', 400)
    }
  }

  const tx = await createTransaction(
    data,
    user.userId,
    user.username || 'Ban Quản Trị',
    user.parishId,
    ip,
    userAgent
  )

  return successResponse(c, tx, 201)
})

/**
 * DELETE /api/finances/transactions/:id
 * Deletes a transaction and unlinks related fee record.
 */
financesRouter.delete('/transactions/:id', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

  const ok = await deleteTransaction(id, user.userId, user.parishId, ip, userAgent)
  if (!ok) {
    return errorResponse(c, 'Giao dịch không tồn tại hoặc đã bị xóa', 404)
  }

  return successResponse(c, { deleted: true })
})

/**
 * GET /api/finances/classes/:classId/fees
 * Lists fee payment status for all students in a class.
 */
financesRouter.get('/classes/:classId/fees', async (c) => {
  const user = c.get('user')
  const classId = c.req.param('classId')
  const academicYear = c.req.query('academicYear') || '2025-2026'
  const feeType = (c.req.query('feeType') as any) || 'NIEN_LIEM'

  const records = await listClassFeeRecords(user.parishId, classId, academicYear, feeType)
  return successResponse(c, records)
})

/**
 * POST /api/finances/classes/:classId/fees
 * Updates / collects fee payment for a student.
 */
financesRouter.post('/classes/:classId/fees', zValidator('json', updateStudentFeeSchema), async (c) => {
  const user = c.get('user')
  const data = c.req.valid('json')
  const ip = getClientIp(c)
  const userAgent = c.req.header('user-agent') || ''

  const record = await updateStudentFee(
    user.parishId,
    data,
    user.userId,
    user.username || 'Ban Quản Trị',
    ip,
    userAgent
  )

  return successResponse(c, record)
})
