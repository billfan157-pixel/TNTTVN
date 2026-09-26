import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

/** Source list of one exact CSP directive (name match is exact, not prefix-based). */
function cspDirective(csp: string, name: string): string {
  const prefix = `${name} `
  const part = csp
    .split(';')
    .map(entry => entry.trim())
    .find(entry => entry.startsWith(prefix))
  return part ? part.slice(prefix.length) : ''
}

describe('deployment and native privacy contracts', () => {
  it('requires the dedicated report signing secret when reconstructing production with Compose', () => {
    expect(read('docker-compose.yml')).toContain('REPORT_HMAC_SECRET=${REPORT_HMAC_SECRET:?')
    expect(read('server/src/utils/hmacSigner.ts')).toContain('REPORT_HMAC_SECRET is required in production')
  })

  it('never presents a successful exact-data restore as cutover approval', () => {
    const script = read('server/src/scripts/restoreRemoteBackup.ts')
    expect(script).toContain("purpose: 'isolated-data-fidelity-drill'")
    expect(script).toContain('cutoverReady: false')
    expect(script).toContain("'credential-and-session-invalidation'")
    expect(script).toContain("'client-generation-and-offline-reconciliation'")
    expect(script).toContain("'delivery-reconciliation'")
  })
  it('serves the web shell with a CSP-compatible pre-paint theme script', () => {
    const html = read('index.html')
    expect(html).toContain('<script src="/theme-boot.js"></script>')
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i)
    expect(read('public/theme-boot.js')).toContain("localStorage.getItem('parish_ui_boot')")
  })

  it('locks down Vercel HTML without disabling the OMR camera', () => {
    const config = JSON.parse(read('vercel.json')) as {
      git: { deploymentEnabled: Record<string, boolean> }
      installCommand: string
      proxy: { entrypoint: string; matcher: string[] }
      headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>
      rewrites: Array<{ source: string; destination: string }>
    }
    const global = config.headers.find(entry => entry.source === '/(.*)')
    const headers = Object.fromEntries((global?.headers ?? []).map(header => [header.key, header.value]))
    const csp = headers['Content-Security-Policy'] ?? ''

    expect(csp).toContain("script-src 'self'")
    expect(csp).toContain("style-src 'self' https://fonts.googleapis.com")
    expect(csp).toContain("style-src-attr 'unsafe-inline'")
    expect(csp).not.toContain("style-src 'self' 'unsafe-inline'")
    // CSP-FONTS (2026-09-08): SW fetch Google Fonts (CacheFirst trong sw.ts) chịu
    // CSP của chính response sw.js — connect-src thiếu host này thì Inter fail
    // hoàn toàn trên production (chỉ còn fallback system-ui).
    expect(csp).toMatch(/connect-src[^;]*https:\/\/fonts\.googleapis\.com/)
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain('report-uri /api/csp-report')
    expect(csp).not.toContain("'unsafe-eval'")
    // CSP-TOOLBAR-1 (2026-09-23): Vercel Toolbar (vercel.live, script
    // `feedback.js` do Vercel edge inject cho viewer đã đăng nhập Vercel) dựng UI
    // bằng <style> element → luôn sinh `Applying inline style violates ... style-src`
    // mỗi lần tải và không thể chạy dưới A-NEW-23 (Vercel không hỗ trợ strict CSP).
    // Allow-list `script-src https://vercel.live` không làm toolbar chạy được, chỉ
    // mở XSS surface trên app origin → giữ policy thuần nội bộ, Toolbar Off cho
    // Production (xem SECURITY_AUDIT CSP-TOOLBAR-1 + DEPLOYMENT_GUIDE §7.0).
    expect(csp).not.toContain('vercel.live')
    expect(csp).not.toContain('assets.vercel.com')
    expect(cspDirective(csp, 'script-src')).toBe("'self'")
    expect(cspDirective(csp, 'style-src')).toBe("'self' https://fonts.googleapis.com")
    expect(cspDirective(csp, 'style-src-attr')).toBe("'unsafe-inline'")
    expect(headers['X-Frame-Options']).toBe('DENY')
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['Permissions-Policy']).toContain('camera=(self)')
    expect(headers['Permissions-Policy']).toContain('microphone=()')
    expect(config.git.deploymentEnabled.main).toBe(false)
    expect(config.installCommand).toBe('npm ci --allow-remote=all')
    expect(config.proxy).toEqual({ entrypoint: 'proxy.ts', matcher: ['/api/:path*', '/health'] })
    // One owner per path. An external rewrite for /api or /health competes with the
    // Routing Middleware and, in practice, left both inert: the SPA catch-all served
    // index.html for API requests. The proxy is the only backend ingress.
    expect(config.rewrites).toEqual([{ source: '/(.*)', destination: '/index.html' }])
  })

  it('excludes native PII from backup and requests only the camera capability', () => {
    const manifest = read('android/app/src/main/AndroidManifest.xml')
    expect(manifest).toContain('android:allowBackup="false"')
    expect(manifest).toContain('android:dataExtractionRules="@xml/data_extraction_rules"')
    expect(manifest).toContain('android:fullBackupContent="@xml/backup_rules"')
    expect(manifest).toContain('android.permission.CAMERA')
    expect(manifest).not.toContain('android.permission.RECORD_AUDIO')
    expect(read('android/app/src/main/res/xml/backup_rules.xml')).toContain('<exclude domain="database" path="." />')
    expect(read('android/app/src/main/res/xml/data_extraction_rules.xml')).toContain('<device-transfer>')
    expect(read('android/app/src/main/res/xml/file_paths.xml')).not.toContain('<external-path')
    expect(read('ios/App/App/Info.plist')).not.toContain('NSMicrophoneUsageDescription')
  })

  it('uses the Catevia product name in both native shells', () => {
    expect(JSON.parse(read('capacitor.config.json')).appName).toBe('Catevia')
    expect(read('android/app/src/main/res/values/strings.xml')).toContain('<string name="app_name">Catevia</string>')
    expect(read('ios/App/App/Info.plist')).toContain('<string>Catevia</string>')
  })

  it('deploys only a CI-verified SHA and proves both production releases match it', () => {
    const workflow = read('.github/workflows/deploy-production.yml')

    expect(workflow).toContain("VERIFIED_SHA: ${{ github.event.workflow_run.head_sha }}")
    expect(workflow).toContain('github.event.workflow_run.conclusion == \'success\'')
    expect(workflow).toContain('backend_release" != "$VERIFIED_SHA"')
    expect(workflow).toContain('frontend_release" != "$VERIFIED_SHA"')
    expect(workflow).toContain('Unauthenticated auth smoke expected 401')
    expect(workflow).toContain("grep -qi '^content-security-policy:'")
    expect(workflow).toContain("grep -qi '^strict-transport-security:'")
    expect(workflow).toContain('npm ci --ignore-scripts --no-audit --no-fund')
    expect(workflow).toContain('db:preflight:cloudflare')
    expect(workflow).toContain('db:preflight:backup')
    expect(workflow).toContain('R2_ENDPOINT')
    expect(workflow).toContain('verify-production-boundary.mjs')
  })

  it('keeps the Render browser origin allowlist aligned with the production auth policy', () => {
    const blueprint = read('render.yaml')
    const clientOrigin = blueprint.match(/- key: CLIENT_ORIGIN\s+value:\s*([^\r\n]+)/)?.[1]

    expect(clientOrigin?.split(',')).toEqual([
      'https://tnttvn.vercel.app',
      'capacitor://localhost',
      'https://localhost',
    ])
    expect(clientOrigin).not.toContain('http://localhost')
  })

  it('moves production ingress only through a recorded, reversible cutover', () => {
    const deploy = read('.github/workflows/deploy-production.yml')
    const cutover = read('.github/workflows/cutover-production.yml')

    // One recorded truth for the backend target drives CI, so a half-applied
    // cutover can never be published or verified against the wrong boundary.
    expect(deploy).toContain('CATEVIA_BACKEND_TARGET: ${{ vars.CATEVIA_BACKEND_TARGET }}')
    expect(deploy).toContain('CATEVIA_BACKEND_TARGET must be render or worker')
    expect(deploy).toContain('"$VERIFIED_SHA" "$CATEVIA_BACKEND_TARGET"')
    // The closed-Worker proof is a pre-cutover fact; post-cutover it asserts the
    // open Worker serves the exact release through the operator token instead.
    expect(deploy).toContain('Backend cutover pending')
    expect(deploy).toContain('Authorization: Bearer ${OPS_TOKEN}')

    // Ingress moves only by hand, only to the recorded target, and only after the
    // owner has stopped Render's scheduled writers.
    expect(cutover).toContain('workflow_dispatch:')
    expect(cutover).not.toContain('push:')
    expect(cutover).toContain('CATEVIA_BACKEND_TARGET is')
    expect(cutover).toContain('CATEVIA_MAINTENANCE_OWNER')
    expect(cutover).toContain('verify-production-boundary.mjs')
    // Rollback must not need the Worker credential that rollback removes.
    expect(cutover).toContain('remove_env_by_key CATEVIA_PROXY_SHARED_SECRET')
    expect(cutover).toContain('https://tnttvn.onrender.com')
  })
})
