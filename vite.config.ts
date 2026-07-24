import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { tailwindHmrFix } from './src/lib/tailwind-hmr-fix.ts'
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react(),
    tailwindHmrFix(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      includeAssets: ['favicon.svg', 'pwa-icon.svg'],
      manifest: {
        name: 'Giáo Lý Thiếu Nhi Thánh Thể — Giáo Xứ Gia Tôn',
        short_name: 'Giáo Lý TNTT',
        description: 'Hệ thống quản lý điểm số & theo dõi chuyên cần Thiếu Nhi Thánh Thể',
        start_url: '/',
        display: 'standalone',
        background_color: '#F8FAFC',
        theme_color: '#1E3A8A',
        icons: [
          { src: '/pwa-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/pwa-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
          { src: '/favicon.svg', sizes: '48x48', type: 'image/svg+xml' },
        ],
      },
    }),
    ...(process.env.ANALYZE ? [visualizer({ open: true, gzipSize: true })] : []),
  ],
})
