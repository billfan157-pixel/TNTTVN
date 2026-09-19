/**
 * PARISH LMS: STANDARDIZED API RESPONSE & ERROR CODES
 * Standard Format: { success: boolean, data: any, error: { code, message, details } | null }
 */

import { Context } from 'hono'

export const ErrorCode = {
  AUTH_UNAUTHORIZED: 'AUTH_UNAUTHORIZED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  GRADE_LOCKED: 'GRADE_LOCKED',
  SEMESTER_LOCKED: 'SEMESTER_LOCKED',
  STATE_TRANSITION_INVALID: 'STATE_TRANSITION_INVALID',
  CLASS_FULL: 'CLASS_FULL',
  STUDENT_NOT_FOUND: 'STUDENT_NOT_FOUND',
  BACKUP_CHECKSUM_INVALID: 'BACKUP_CHECKSUM_INVALID',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const

export type ErrorCodeType = typeof ErrorCode[keyof typeof ErrorCode]

export function sendSuccess(c: Context, data: any, status: 200 | 201 = 200) {
  return c.json({
    success: true,
    data,
    error: null,
  }, status)
}

export function sendError(
  c: Context,
  code: string,
  message: string,
  statusCode: 400 | 401 | 403 | 404 | 409 | 500 = 400,
  details: any = null
) {
  return c.json({
    success: false,
    data: null,
    error: {
      code,
      message,
      details,
    },
  }, statusCode)
}

export function successResponse(arg1: any, arg2?: any, arg3?: any) {
  if (arg1 && typeof arg1 === 'object' && 'json' in arg1 && typeof arg1.json === 'function') {
    return arg1.json({ success: true as const, data: arg2 }, arg3 || 200)
  }
  return { success: true as const, data: arg1 }
}

export function errorResponse(arg1: any, arg2?: any, arg3?: any, arg4?: any, arg5?: any) {
  if (arg1 && typeof arg1 === 'object' && 'json' in arg1 && typeof arg1.json === 'function') {
    let message = 'An error occurred'
    let status = 400
    let code: string | undefined = undefined

    if (typeof arg2 === 'string' && typeof arg3 === 'string') {
      // (c, code, message, status)
      code = arg2
      message = arg3
      if (typeof arg4 === 'number') status = arg4
    } else if (typeof arg2 === 'string' && typeof arg3 === 'number') {
      // (c, messageOrCode, status, code)
      if (arg2.toUpperCase() === arg2 && !arg2.includes(' ')) {
        code = arg2
        message = typeof arg4 === 'string' ? arg4 : arg2
      } else {
        message = arg2
        code = typeof arg4 === 'string' ? arg4 : undefined
      }
      status = arg3
    } else if (typeof arg2 === 'string') {
      message = arg2
      if (typeof arg3 === 'number') status = arg3
      if (typeof arg4 === 'number') status = arg4
    }

    return arg1.json({
      success: false as const,
      error: {
        code: code || (status === 403 ? 'FORBIDDEN' : status === 401 ? 'UNAUTHORIZED' : status === 404 ? 'NOT_FOUND' : 'ERROR'),
        message,
        ...(arg5 === undefined ? {} : { details: arg5 }),
      }
    }, status as any)
  }
  const message = typeof arg1 === 'string' ? arg1 : 'An error occurred'
  const code = typeof arg2 === 'string' ? arg2 : undefined
  return { success: false as const, error: { code, message } }
}

export function listResponse(arg1: any, arg2?: any, arg3?: any) {
  if (arg1 && typeof arg1 === 'object' && 'json' in arg1 && typeof arg1.json === 'function') {
    const items = Array.isArray(arg2) ? arg2 : (arg2?.items || [])
    const total = typeof arg3 === 'number' ? arg3 : (Array.isArray(arg2) ? items.length : (arg2?.total ?? items.length))
    return arg1.json({ success: true as const, data: items, total })
  }
  const items = Array.isArray(arg1) ? arg1 : (arg1?.items || [])
  const total = typeof arg2 === 'number' ? arg2 : (Array.isArray(arg1) ? items.length : (arg1?.total ?? items.length))
  return { success: true as const, data: items, total }
}

export function paginatedResponse(
  c: Context,
  data: any[],
  arg3: number | { page: number; limit: number; total: number; totalPages?: number; summary?: Record<string, unknown> },
  limit?: number,
  total?: number
) {
  let meta: { page: number; limit: number; total: number; totalPages: number; summary?: Record<string, unknown> }
  if (typeof arg3 === 'object' && arg3 !== null) {
    const totalPages = arg3.totalPages ?? Math.ceil((arg3.total || 0) / (arg3.limit || 25))
    meta = {
      page: arg3.page,
      limit: arg3.limit,
      total: arg3.total,
      totalPages,
      ...(arg3.summary ? { summary: arg3.summary } : {}),
    }
  } else {
    const pageVal = arg3 || 1
    const limitVal = limit || 25
    const totalVal = total || 0
    const totalPages = Math.ceil(totalVal / limitVal)
    meta = { page: pageVal, limit: limitVal, total: totalVal, totalPages }
  }

  return c.json({
    success: true as const,
    data,
    meta,
    error: null,
  }, 200)
}

