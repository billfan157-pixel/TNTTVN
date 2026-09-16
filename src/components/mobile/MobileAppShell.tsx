import { MobileBottomNav, type MobileTab } from './MobileBottomNav'
import type { WorkspaceId } from '../../constants/routePolicy'

interface MobileAppShellProps {
  activeTab: MobileTab | null
  setActiveTab: (tab: MobileTab) => void | Promise<void>
  preloadTab?: (tab: MobileTab) => void
  activeWorkspace?: WorkspaceId
  /** W2.10: forwarded to the nav's "Công Việc" badge. */
  operationsBadge?: number
  children: React.ReactNode
}

/**
 * Native-style mobile frame for the responsive PWA.
 *
 * The shell is the single owner of the bottom navigation clearance. Screen
 * components should not add their own `pb-20`/fixed bottom offsets unless they
 * intentionally use the shared `.mobile-floating-action` or
 * `.mobile-bottom-action-bar` primitives.
 */
export const MobileAppShell: React.FC<MobileAppShellProps> = ({
  activeTab,
  setActiveTab,
  preloadTab,
  activeWorkspace,
  operationsBadge,
  children,
}) => (
  <div className="mobile-app-shell">
    <main id="main-content" className="mobile-app-main">
      {children}
    </main>
    {activeTab && (
      <MobileBottomNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        preloadTab={preloadTab}
        activeWorkspace={activeWorkspace}
        operationsBadge={operationsBadge}
      />
    )}
  </div>
)
