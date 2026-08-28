import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('OMR field evidence release provenance configuration', () => {
  it('web build binds explicit or platform Git SHA and keeps dev fail-closed fallback', () => {
    const vite = source('vite.config.ts')
    expect(vite).toContain('process.env.VITE_APP_RELEASE_ID')
    expect(vite).toContain('process.env.VERCEL_GIT_COMMIT_SHA')
    expect(vite).toContain('process.env.RENDER_GIT_COMMIT')
    expect(vite).toContain("|| 'dev'")
    expect(vite).toContain('__APP_RELEASE_ID__')
    expect(source('.env.example')).toContain('VITE_APP_RELEASE_ID=')
  })

  it('Codemagic iOS và Android đều inject đúng CM_COMMIT', () => {
    const codemagic = source('codemagic.yaml')
    expect(codemagic.match(/VITE_APP_RELEASE_ID="\$CM_COMMIT" npm run build:frontend/g)).toHaveLength(2)
  })

  it('GitHub sideload IPA inject đúng checkout SHA', () => {
    expect(source('.github/workflows/ios-ipa.yml')).toContain('VITE_APP_RELEASE_ID: ${{ github.sha }}')
  })
})
