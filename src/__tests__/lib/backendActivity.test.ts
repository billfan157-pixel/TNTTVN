import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  beginBackendActivity,
  endBackendActivity,
  getBackendActivityCount,
  resetBackendActivity,
  runWithBackendActivity,
  subscribeBackendActivity,
} from '../../lib/backendActivity'

// UX-FEEDBACK-1: tracker là nguồn duy nhất cho chỉ báo "đang chờ máy chủ" toàn cục.
// Test bảo vệ hai hợp đồng: (1) đếm đúng request đang bay, (2) bộ đếm không bao giờ
// kẹt hay âm — vì nếu kẹt, chỉ báo sẽ treo vĩnh viễn trên màn hình người dùng.

describe('backendActivity tracker', () => {
  beforeEach(() => {
    resetBackendActivity()
  })

  afterEach(() => {
    resetBackendActivity()
  })

  it('đếm request đang bay và thông báo cho listener mỗi lần đổi', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeBackendActivity(listener)
    expect(getBackendActivityCount()).toBe(0)

    beginBackendActivity()
    beginBackendActivity()
    expect(getBackendActivityCount()).toBe(2)

    endBackendActivity()
    expect(getBackendActivityCount()).toBe(1)

    endBackendActivity()
    expect(getBackendActivityCount()).toBe(0)
    expect(listener).toHaveBeenCalledTimes(4)

    unsubscribe()
  })

  it('không cho bộ đếm âm khi end nhiều hơn begin', () => {
    endBackendActivity()
    endBackendActivity()
    expect(getBackendActivityCount()).toBe(0)
  })

  it('ngừng thông báo sau khi huỷ subscribe', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeBackendActivity(listener)
    unsubscribe()
    beginBackendActivity()
    expect(listener).not.toHaveBeenCalled()
  })

  it('một listener lỗi không phá các listener khác', () => {
    const healthy = vi.fn()
    const unsubscribeBroken = subscribeBackendActivity(() => {
      throw new Error('listener hỏng')
    })
    const unsubscribeHealthy = subscribeBackendActivity(healthy)

    expect(() => beginBackendActivity()).not.toThrow()
    expect(healthy).toHaveBeenCalledOnce()

    unsubscribeBroken()
    unsubscribeHealthy()
  })

  it('runWithBackendActivity luôn nhả bộ đếm khi task reject', async () => {
    await expect(runWithBackendActivity(async () => {
      throw new Error('server 500')
    })).rejects.toThrow('server 500')
    expect(getBackendActivityCount()).toBe(0)
  })

  it('runWithBackendActivity đếm đúng khi nhiều request song song', async () => {
    let release: Array<() => void> = []
    const gate = () => new Promise<void>((resolve) => { release.push(resolve) })

    const first = runWithBackendActivity(gate)
    const second = runWithBackendActivity(gate)
    expect(getBackendActivityCount()).toBe(2)

    for (const resolve of release) resolve()
    await Promise.all([first, second])
    expect(getBackendActivityCount()).toBe(0)
  })

  it('resetBackendActivity xoá bộ đếm (dùng cho test)', () => {
    beginBackendActivity()
    resetBackendActivity()
    expect(getBackendActivityCount()).toBe(0)
  })
})
