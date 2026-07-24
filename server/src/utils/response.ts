import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  total?: number
  error?: {
    code: string
    message: string
    details?: any
  }
  timestamp: string
}

export function successResponse<T>(c: Context, data: T, status: ContentfulStatusCode = 200) {
  const payload: ApiResponse<T> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  return c.json(payload, status)
}

export function listResponse<T>(c: Context, data: T[], total?: number, status: ContentfulStatusCode = 200) {
  const payload: ApiResponse<T[]> = {
    success: true,
    data,
    total: total ?? data.length,
    timestamp: new Date().toISOString(),
  }
  return c.json(payload, status)
}

export function errorResponse(
  c: Context,
  code: string,
  message: string,
  status: ContentfulStatusCode = 400,
  details?: any,
) {
  const payload: ApiResponse = {
    success: false,
    error: {
      code,
      message,
      details,
    },
    timestamp: new Date().toISOString(),
  }
  return c.json(payload, status)
}
