export interface TenantScope {
  parishId: string
  userId: string
}

let currentScope: TenantScope | null = null

export function getTenantScope(): TenantScope | null {
  return currentScope
}

export function getTenantScopeKey(): string | null {
  if (!currentScope) return null
  return `${currentScope.parishId}:${currentScope.userId}`
}

export function scopedStorageKey(name: string): string | null {
  const scopeKey = getTenantScopeKey()
  return scopeKey ? `${name}:${scopeKey}` : null
}

export function setTenantScope(scope: TenantScope | null): void {
  if (scope && (!scope.parishId.trim() || !scope.userId.trim())) {
    throw new Error('Invalid tenant scope')
  }
  currentScope = scope
}

/** Rehydrate persisted Zustand stores only after the authenticated scope exists. */
export async function rehydrateTenantStores(): Promise<void> {
  if (!currentScope) return

  const stores = await Promise.all([
    import('../stores/studentStore'),
    import('../stores/gradeStore'),
    import('../stores/attendanceStore'),
    import('../stores/dailyGradeStore'),
    import('../stores/sacramentStore'),
    import('../stores/classStore'),
    import('../stores/filterStore'),
    import('../stores/noticeStore'),
    import('../stores/settingsStore'),
    import('../stores/academicYearStore'),
    import('../stores/examStore'),
    import('../stores/syncStore'),
  ])

  await Promise.all(
    stores.map((module) => {
      const candidate = Object.values(module).find((value) =>
        value && typeof value === 'object' && 'persist' in (value as object)
      ) as { persist?: { rehydrate?: () => Promise<void> } } | undefined
      return candidate?.persist?.rehydrate?.() || Promise.resolve()
    })
  )
}
