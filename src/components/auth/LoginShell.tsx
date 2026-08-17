import React from 'react'
import { LogIn } from 'lucide-react'

interface LoginShellProps {
  title: string
  subtitle: string
  children: React.ReactNode
}

export function LoginShell({ title, subtitle, children }: LoginShellProps) {
  return (
    <div className="min-h-screen bg-surface-app flex items-center justify-center p-4">
      <div className="bg-surface-card border border-surface-border rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-parish-primary p-8 text-white text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-white/10 backdrop-blur-xs rounded-2xl flex items-center justify-center">
            <LogIn className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-xs text-white/80 mt-1">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  )
}

export default LoginShell