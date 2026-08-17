import React from 'react'
import { useInstallPrompt } from '../../hooks/useInstallPrompt'
import { Download } from 'lucide-react'

export function InstallPrompt() {
  const { canInstall, install } = useInstallPrompt()

  if (!canInstall) return null

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4 duration-300">
      <button
        onClick={install}
        className="flex items-center gap-2 bg-parish-primary text-white px-4 py-3 rounded-xl shadow-lg border-none cursor-pointer text-sm font-bold hover:bg-parish-primary-hover transition-colors"
      >
        <Download size={18} />
        Cài đặt ứng dụng
      </button>
    </div>
  )
}
