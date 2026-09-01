import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

describe('deployment and native privacy contracts', () => {
  it('serves the web shell with a CSP-compatible pre-paint theme script', () => {
    const html = read('index.html')
    expect(html).toContain('<script src="/theme-boot.js"></script>')
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i)
    expect(read('public/theme-boot.js')).toContain("localStorage.getItem('parish_ui_boot')")
  })

  it('locks down Vercel HTML without disabling the OMR camera', () => {
    const config = JSON.parse(read('vercel.json')) as {
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
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain('report-uri /api/csp-report')
    expect(csp).not.toContain("'unsafe-eval'")
    expect(headers['X-Frame-Options']).toBe('DENY')
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['Permissions-Policy']).toContain('camera=(self)')
    expect(headers['Permissions-Policy']).toContain('microphone=()')
    expect(config.rewrites[0]).toEqual({ source: '/health', destination: 'https://tnttvn.onrender.com/health' })
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
})
