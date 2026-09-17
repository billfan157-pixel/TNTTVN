export interface TenantScope {
  parishId: string
  userId: string
}

export interface TenantScopeSnapshot extends TenantScope {
  revision: number
}

let currentScope: TenantScope | null = null
let currentScopeRevision = 0

function sameScope(left: TenantScope | null, right: TenantScope | null): boolean {
  return left?.parishId === right?.parishId && left?.userId === right?.userId
}

export function getTenantScope(): TenantScope | null {
  return currentScope
}

export function getTenantScopeKey(): string | null {
  if (!currentScope) return null
  return `${currentScope.parishId}:${currentScope.userId}`
}

/**
 * Capture the document-local owner of asynchronous work. The revision prevents
 * an A -> B -> A transition from reviving work started by A's earlier session.
 */
export function captureTenantScope(): TenantScopeSnapshot | null {
  if (!currentScope) return null
  return { ...currentScope, revision: currentScopeRevision }
}

export function isTenantScopeCurrent(snapshot: TenantScopeSnapshot | null): snapshot is TenantScopeSnapshot {
  return Boolean(snapshot
    && snapshot.revision === currentScopeRevision
    && currentScope?.parishId === snapshot.parishId
    && currentScope?.userId === snapshot.userId)
}

export function scopedStorageKey(name: string): string | null {
  const scopeKey = getTenantScopeKey()
  return scopeKey ? `${name}:${scopeKey}` : null
}

export function setTenantScope(scope: TenantScope | null): void {
  if (scope && (!scope.parishId.trim() || !scope.userId.trim())) {
    throw new Error('Invalid tenant scope')
  }
  if (!sameScope(currentScope, scope)) currentScopeRevision++
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
