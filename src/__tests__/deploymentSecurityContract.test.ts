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

  it('keeps the password compute retry observable and watched', () => {
    const alert = read('.github/workflows/alert-password-cpu-retries.yml')
    const detector = read('tools/cloudflare-free-feasibility/detect-password-cpu-retries.mjs')
    const adapter = read('server/src/utils/passwordCompute.ts')

    // The 2026-09-24 intermittent HTTP 500 stayed unattributed because the retry branch
    // was invisible and the code-update reset cannot be reproduced on demand. The log
    // line, its parser, and a scheduled watcher must all exist together.
    expect(adapter).toContain('PASSWORD_CPU_RETRY')
    expect(detector).toContain('PASSWORD_CPU_RETRY')
    // The retry must never log credential material. String literals are stripped first
    // so the event type name itself does not count as a credential reference.
    const adapterCode = adapter.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g, "''")
    expect(adapterCode).not.toMatch(/console\.log\([^)]*\b(password|hash)\b/i)
    expect(alert).toContain('schedule:')
    expect(alert).toContain('detect-password-cpu-retries.mjs')
    expect(alert).toContain('issues: write')
    // A quiet window must stay green; only a real event may fail the run.
    expect(alert).toContain("steps.detect.outputs.detected == 'true'")
  })

  it('probes the deployed Vercel artifact instead of trusting the routing config', () => {
    const deploy = read('.github/workflows/deploy-production.yml')

    // Routing Middleware and an external rewrite can both claim /api and /health.
    // Which one wins is invisible to unit tests, so the deployment gate probes the
    // artifact it just published and fails before Render is touched.
    expect(deploy).toContain('Verify Vercel ingress is owned by the proxy')
    expect(deploy).toContain('verify-preview-ingress.mjs')
    expect(deploy).toContain('${{ steps.vercel.outputs.deployment_id }}')
    // The ingress proof must precede the Render deploy so a broken ingress can never
    // leave a half-applied release in production.
    expect(deploy.indexOf('verify-preview-ingress.mjs'))
      .toBeLessThan(deploy.indexOf('Deploy exact SHA to Render production'))
  })

  it('keeps production Worker password posture aligned with the no-reversible-password policy', () => {
    expect(read('server/src/cloudflare/entry.js')).not.toContain('PASSWORD_CIPHER_KEY')
    expect(read('tools/cloudflare-free-feasibility/put-production-secrets.mjs')).not.toContain('PASSWORD_CIPHER_KEY')
  })

  it('alerts on production Worker writer failures, not only password retries', () => {
    const alert = read('.github/workflows/alert-worker-incidents.yml')
    // Password retries are a login-path concern. After cutover the Worker owns the
    // scheduled writers, so a quiet maintenance or backup failure is the incident
    // that actually threatens data.
    expect(alert).toContain('detect-worker-incidents.mjs')
    expect(alert).toContain("steps.detect.outputs.watched != 'true'")
    expect(read('tools/cloudflare-free-feasibility/detect-worker-incidents.mjs'))
      .toContain('MAINTENANCE_JOB_FAILED')
    expect(read('server/src/cloudflare/maintenanceJob.js')).toContain("type: 'MAINTENANCE_JOB_FAILED'")
  })

  it('keeps the production Worker bundle inside the server package', () => {
    // The deployed entry is server/src/cloudflare/entry.js. A Durable Object class
    // living under tools/ resolves its runtime dependency from a deploy-tool
    // devDependency, so the production bundle silently depends on the toolchain
    // instead of the package that owns the entry.
    for (const entry of ['server/src/cloudflare/entry.js', 'tools/cloudflare-free-feasibility/src/catevia-dryrun.js']) {
      const source = read(entry)
      expect(source).toContain('PdfJob')
      expect(source).not.toMatch(/from\s+['"][^'"]*tools\//)
    }
    expect(read('server/src/cloudflare/pdfJob.js')).toContain("from '@cloudflare/puppeteer'")
    expect(read('server/package.json')).toContain('"@cloudflare/puppeteer"')
  })

  it('keeps every cutover step uniquely addressable and correctly ordered', () => {
    const cutover = read('.github/workflows/cutover-production.yml')
    // A duplicated step id silently empties the outputs the rollback deploy and the
    // boundary proof read, so the workflow would pass its own name checks while
    // proving nothing.
    const ids = [...cutover.matchAll(/^\s+id: (\S+)$/gm)].map(match => match[1])
    expect(ids.length).toBeGreaterThan(0)
    expect(new Set(ids).size).toBe(ids.length)

    const steps = cutover.split('\n      - name: ').slice(1)
    const step = (name: string) => {
      const found = steps.find(block => block.startsWith(name))
      expect(found, `cutover step not found: ${name}`).toBeDefined()
      return found!
    }
    const at = (name: string) => cutover.indexOf(step(name))

    // Data protection and single-writer ownership are proven before ingress moves,
    // and a rollback target is redeployed before any boundary claim.
    expect(at('Capture and restore-verify the pre-cutover backup'))
      .toBeLessThan(at('Prove Render no longer owns scheduled writes when opening traffic'))
    expect(at('Prove Render no longer owns scheduled writes when opening traffic'))
      .toBeLessThan(at('Point Vercel ingress at the recorded backend'))
    expect(at('Capture and restore-verify the pre-cutover backup'))
      .toBeLessThan(at('Open the verified Worker only after backup and ownership checks'))
    expect(at('Open the verified Worker only after backup and ownership checks'))
      .toBeLessThan(at('Verify the destination release before moving ingress'))
    expect(at('Prepare the Render rollback release with writers disabled'))
      .toBeLessThan(at('Point Vercel ingress at the recorded backend'))
    expect(at('Wait for the Vercel deployment that carries the new ingress'))
      .toBeLessThan(at('Drain Cloudflare jobs before closing the rollback source'))
    expect(at('Drain Cloudflare jobs before closing the rollback source'))
      .toBeLessThan(at('Close Worker traffic and writers after rollback ingress is ready'))
    expect(step('Drain Cloudflare jobs before closing the rollback source'))
      .toContain('.active == false and .nextAlarm == null')
    expect(at('Close Worker traffic and writers after rollback ingress is ready'))
      .toBeLessThan(at('Restore Render to the verified release before rollback boundary'))
    expect(at('Restore Render to the verified release before rollback boundary'))
      .toBeLessThan(at('Prove the recorded production boundary'))
    // The single-writer proof is an open-path gate. Running it during rollback would
    // demand the very ownership state rollback is undoing.
    expect(step('Prove Render no longer owns scheduled writes when opening traffic'))
      .toContain("if: env.CUTOVER_MODE == 'open'")
    expect(cutover).toContain('group: production-deployment')
    expect(cutover).not.toContain('.latestDeployment')
    expect(cutover).toContain('&upsert=true')
    expect(cutover).toContain('Require successful CI for the exact cutover release')
  })

  it('keeps production migrations explicit, approved, and separate from Worker startup', () => {
    const migration = read('server/src/scripts/applyProductionMigrations.ts')
    expect(migration).toContain('ALLOW_PRODUCTION_MIGRATION')
    expect(migration).toContain('MIGRATION_APPROVED_SHA')
    expect(migration).toContain('assertNotRecoveryQuarantined')
    expect(migration).toContain('assertDatabaseReady')
    expect(read('server/package.json')).toContain('db:migrate:production')
  })

  it('moves production ingress only through a recorded, reversible cutover', () => {
    const deploy = read('.github/workflows/deploy-production.yml')
    const cutover = read('.github/workflows/cutover-production.yml')

    // One recorded truth for the backend target drives CI, so a half-applied
    // cutover can never be published or verified against the wrong boundary.
    expect(deploy).toContain('CATEVIA_BACKEND_TARGET: ${{ vars.CATEVIA_BACKEND_TARGET }}')
    expect(deploy).toContain('CATEVIA_BACKEND_TARGET must be render or worker')
    expect(deploy).toContain('Render rollback has not been proven; use cutover-production first')
    expect(deploy).toContain('Worker cutover has not been proven; use cutover-production first')
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
    expect(cutover).toContain('Verify production Worker secret inventory')
    expect(cutover).toContain('put-production-secrets.mjs --check')
    expect(cutover).toContain('Capture and restore-verify the pre-cutover backup')
    expect(cutover).toContain('expected_worker_release')
    expect(cutover).toContain('drill-production-backup-restore.mjs')
    // Rollback must not need the Worker credential that rollback removes.
    expect(cutover).toContain('remove_env_by_key CATEVIA_PROXY_SHARED_SECRET')
    expect(cutover).toContain('https://tnttvn.onrender.com')
    expect(cutover).toContain('Restore Render to the verified release before rollback boundary')
  })
})
