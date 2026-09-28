import { useSyncExternalStore } from 'react'
import { getBackendActivityCount, subscribeBackendActivity } from '../lib/backendActivity'

/**
 * Số request backend đang bay (nguồn: `lib/api/core.ts` ⇒ `lib/backendActivity`).
 * Dùng cho chỉ báo toàn cục `BackendActivityIndicator`; không phải state nghiệp vụ.
 */
export function useBackendActivityCount(): number {
  return useSyncExternalStore(subscribeBackendActivity, getBackendActivityCount, getBackendActivityCount)
}
