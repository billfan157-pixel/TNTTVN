import appLogo from '../../assets/app-logo-192.png'

interface LoginShellProps {
  title: string
  subtitle: string
  children: React.ReactNode
}

export function LoginShell({ title, subtitle, children }: LoginShellProps) {
  return (
    <main className="auth-page">
      <div className="auth-card">
        {/* Header */}
        <div className="auth-hero">
          <div className="auth-hero__mark">
            <img src={appLogo} alt="Logo Catevia" className="w-full h-full object-cover" />
          </div>
          <h1 className="auth-hero__title">{title}</h1>
          <div className="auth-hero__subtitle-wrap">
            <span className="auth-hero__subtitle">
              <span className="auth-hero__subtitle-dot" aria-hidden="true" />
              {subtitle}
            </span>
          </div>
        </div>
        {children}
      </div>
    </main>
  )
}

export default LoginShell
