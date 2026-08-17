import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'

export type TelegramLinkStatus = {
  chatId: string
  telegramUsername: string | null
  status: string
  notificationsEnabled: number
  linkedAt: string | null
  lastSeenAt: string | null
}

export interface UseTelegramLinkResult {
  status: TelegramLinkStatus[] | null
  statusLoading: boolean
  statusError: string
  token: string | null
  tokenExpiresAt: string | null
  creatingToken: boolean
  toggleNotifications: boolean
  revoking: boolean
  createToken: () => Promise<void>
  toggleNotif: (enabled: boolean) => Promise<void>
  revoke: () => Promise<void>
  refresh: () => Promise<void>
}

export function useTelegramLink(): UseTelegramLinkResult {
  const [status, setStatus] = useState<TelegramLinkStatus[] | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [statusError, setStatusError] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [tokenExpiresAt, setTokenExpiresAt] = useState<string | null>(null)
  const [creatingToken, setCreatingToken] = useState(false)
  const [toggleNotifications, setToggleNotifications] = useState(false)
  const [revoking, setRevoking] = useState(false)

  const loadStatus = useCallback(async () => {
    try {
      const list = await api.getTelegramLinkStatus()
      setStatus(Array.isArray(list) ? list : [])
      setStatusError('')
    } catch {
      setStatusError('Không thể kiểm tra trạng thái liên kết Telegram.')
    } finally {
      setStatusLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  const createToken = useCallback(async () => {
    setCreatingToken(true)
    try {
      const res = await api.createTelegramLinkToken()
      setToken(res.token)
      setTokenExpiresAt(res.expiresAt)
    } catch (err: any) {
      setStatusError(err?.message || 'Không thể tạo mã liên kết. Vui lòng thử lại.')
    } finally {
      setCreatingToken(false)
    }
  }, [])

  const toggleNotif = useCallback(async (enabled: boolean) => {
    setToggleNotifications(true)
    try {
      await api.setTelegramNotifications(enabled)
      await loadStatus()
    } catch (err: any) {
      setStatusError(err?.message || 'Không thể cập nhật thông báo. Vui lòng thử lại.')
    } finally {
      setToggleNotifications(false)
    }
  }, [loadStatus])

  const revoke = useCallback(async () => {
    setRevoking(true)
    try {
      await api.revokeTelegramLink()
      setToken(null)
      setTokenExpiresAt(null)
      await loadStatus()
    } catch (err: any) {
      setStatusError(err?.message || 'Không thể hủy liên kết. Vui lòng thử lại.')
    } finally {
      setRevoking(false)
    }
  }, [loadStatus])

  const refresh = useCallback(async () => {
    setStatusLoading(true)
    await loadStatus()
  }, [loadStatus])

  return {
    status, statusLoading, statusError,
    token, tokenExpiresAt, creatingToken,
    toggleNotifications, revoking,
    createToken, toggleNotif, revoke, refresh,
  }
}

export default useTelegramLink