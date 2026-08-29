import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { tailwindHmrFix } from './src/lib/tailwind-hmr-fix.ts'
import { visualizer } from 'rollup-plugin-visualizer'

const appReleaseId = process.env.VITE_APP_RELEASE_ID
  || process.env.VERCEL_GIT_COMMIT_SHA
  || process.env.RENDER_GIT_COMMIT
  || 'dev'

export default defineConfig({
  define: {
    __APP_RELEASE_ID__: JSON.stringify(appReleaseId),
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      '@tanstack/react-table',
      '@tanstack/react-router',
      'lucide-react',
      'zustand',
      'idb',
      'dexie',
      'clsx',
      'tailwind-merge',
      'jspdf',
      'xlsx',
      'jsqr',
      'qrcode-generator',
    ],
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
        name: 'Xứ Đoàn Đức Mẹ Fatima — Giáo Xứ Gia Tôn',
        short_name: 'Fatima Gia Tôn',
        description: 'Hệ thống quản lý điểm số & theo dõi chuyên cần Thiếu Nhi Thánh Thể',
        start_url: '/',
        display: 'standalone',
        background_color: '#F8FAFC',
        theme_color: '#1E3A8A',
        orientation: 'portrait',
        icons: [
          { src: '/pwa-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/pwa-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
          { src: '/favicon.svg', sizes: '48x48', type: 'image/svg+xml' },
        ],
        shortcuts: [
          {
            name: 'Điểm Danh',
            short_name: 'Điểm Danh',
            description: 'Mở nhanh giao diện điểm danh thiếu nhi',
            url: '/attendance',
            icons: [{ src: '/pwa-icon.svg', sizes: '96x96', type: 'image/svg+xml' }]
          },
          {
            name: 'Bảng Điểm',
            short_name: 'Bảng Điểm',
            description: 'Quản lý và nhập điểm giáo lý',
            url: '/grades',
            icons: [{ src: '/pwa-icon.svg', sizes: '96x96', type: 'image/svg+xml' }]
          }
        ],
      },
    }),
    ...(process.env.ANALYZE ? [visualizer({ open: true, gzipSize: true })] : []),
  ],
})
