import { MobileBottomNav, type MobileTab } from './MobileBottomNav'

interface MobileAppShellProps {
  activeTab: MobileTab | null
  setActiveTab: (tab: MobileTab) => void | Promise<void>
  preloadTab?: (tab: MobileTab) => void
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
  children,
}) => (
  <div className="mobile-app-shell">
    <main id="main-content" className="mobile-app-main">
      {children}
    </main>
    <MobileBottomNav activeTab={activeTab} setActiveTab={setActiveTab} preloadTab={preloadTab} />
  </div>
)
