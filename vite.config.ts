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
const devPort = Number(process.env.VITE_DEV_PORT) || 3000
const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:3001'
const strictDevPort = process.env.E2E_STRICT_PORT === 'true'

export default defineConfig({
  define: {
    __APP_RELEASE_ID__: JSON.stringify(appReleaseId),
  },
  server: {
    host: '0.0.0.0',
    port: devPort,
    strictPort: strictDevPort,
    allowedHosts: true,
    proxy: {
      '/health': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/health': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: {
    entries: [
      'index.html',
      'src/**/*.{ts,tsx}',
    ],
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      '@tanstack/react-table',
      '@tanstack/table-core',
      '@tanstack/react-router',
      '@tanstack/router-core',
      '@tanstack/history',
      '@tanstack/react-store',
      'lucide-react',
      'zustand',
      'zustand/middleware',
      'idb',
      'dexie',
      'clsx',
      'xlsx',
      'jsqr',
      'qrcode-generator',
      'zod',
      '@sentry/react',
      '@aparajita/capacitor-biometric-auth',
    ],
  },
  plugins: [
    react(),
    tailwindHmrFix(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registration is owned by pushManager so the Capacitor native shell can
      // explicitly opt out. Auto-injecting registerSW.js made Android WebView
      // install the PWA worker and reload the running app on worker activation.
      injectRegister: false,
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // SheetJS is a user-triggered import/export capability. Precaching every
      // generated chunk would otherwise download the 493 KB vendor during PWA
      // installation even though application code imports it lazily.
      injectManifest: {
        globIgnores: ['**/xlsx-*.js'],
      },
      includeAssets: ['favicon.svg', 'pwa-icon.svg', 'pwa-192x192.png', 'pwa-512x512.png', 'apple-touch-icon.png', 'favicon.png'],
      manifest: {
        name: 'Catevia — Quản Lý Giáo Xứ & TNTT',
        short_name: 'Catevia',
        description: 'Hệ thống quản lý điểm số & theo dõi chuyên cần Thiếu Nhi Thánh Thể',
        start_url: '/',
        display: 'standalone',
        background_color: '#F8FAFC',
        theme_color: '#1E3A8A',
        orientation: 'portrait',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/pwa-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/favicon.svg', sizes: '48x48', type: 'image/svg+xml' },
        ],
        shortcuts: [
          {
            name: 'Điểm Danh',
            short_name: 'Điểm Danh',
            description: 'Mở nhanh giao diện điểm danh thiếu nhi',
            url: '/attendance',
            icons: [{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' }]
          },
          {
            name: 'Bảng Điểm',
            short_name: 'Bảng Điểm',
            description: 'Quản lý và nhập điểm giáo lý',
            url: '/grades',
            icons: [{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' }]
          }
        ],
      },
    }),
    ...(process.env.ANALYZE ? [visualizer({ open: true, gzipSize: true })] : []),
  ],
})
