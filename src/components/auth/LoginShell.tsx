import { LogIn } from 'lucide-react'

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
            <LogIn className="w-8 h-8 text-white" />
          </div>
          <h1 className="auth-hero__title">{title}</h1>
          <p className="auth-hero__subtitle">{subtitle}</p>
        </div>
        {children}
      </div>
    </main>
  )
}

export default LoginShell
