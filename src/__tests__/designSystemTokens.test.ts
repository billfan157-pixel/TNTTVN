import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Design System v4.1 Foundation Tokens & Classes', () => {
  const cssPath = path.resolve(__dirname, '../index.css')
  const cssContent = fs.readFileSync(cssPath, 'utf8')

  it('declares all mandatory interaction tokens in @theme', () => {
    const requiredTokens = [
      '--color-focus-ring',
      '--color-surface-selected',
      '--color-surface-selected-border',
      '--color-surface-disabled',
      '--color-text-disabled',
      '--color-border-disabled',
      '--color-surface-overlay',
      '--color-cell-clean',
      '--color-cell-edited',
      '--color-cell-edited-border',
      '--color-cell-saving',
      '--color-cell-saved',
      '--color-cell-conflict',
      '--color-cell-conflict-border',
      '--color-cell-locked',
      '--color-surface-raised',
      '--color-surface-sunken',
      '--color-parish-gold',
      '--motion-standard',
    ]

    for (const token of requiredTokens) {
      expect(cssContent).toContain(token)
    }
  })

  it('declares the shared hierarchy and shell primitives', () => {
    const classes = [
      '.page-header--card',
      '.section-card',
      '.metric-card',
      '.app-header',
      '.app-main-content',
      '.mobile-home-hero',
      '.mobile-quick-action',
      '.mobile-content-card',
      '.product-view',
      '.app-panel',
      '.view-toolbar',
      '.view-tabs',
      '.view-tab',
      '.mobile-page-header',
      '.mobile-filter-panel',
      '.entity-card',
      '.auth-page',
      '.auth-card',
      '.auth-hero',
      '.auth-option',
      '.state-feedback',
    ]

    for (const cls of classes) {
      expect(cssContent).toContain(cls)
    }
  })

  it('keeps mobile focus stable and honors reduced-motion preferences', () => {
    const tabletShellSection = cssContent.slice(cssContent.indexOf('@media (max-width: 1023px)'))
    const phoneSection = cssContent.slice(cssContent.indexOf('@media (max-width: 767px)'))
    expect(tabletShellSection).toMatch(/\.mobile-app-shell input,[\s\S]*?font-size:\s*16px/)
    expect(tabletShellSection).toMatch(/\.mobile-app-shell button,[\s\S]*?min-height:\s*44px/)
    expect(phoneSection).toMatch(/\.modal-content[\s\S]*?border-radius:\s*20px 20px 0 0/)

    const reducedMotionSection = cssContent.slice(cssContent.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(reducedMotionSection).toContain('animation-duration: 0.01ms !important')
    expect(reducedMotionSection).toContain('transition-duration: 0.01ms !important')
  })

  it('declares dark mode equivalents for interaction and domain cell tokens', () => {
    const darkSection = cssContent.slice(cssContent.indexOf('.dark {'))
    expect(darkSection).toContain('--color-focus-ring')
    expect(darkSection).toContain('--color-surface-selected')
    expect(darkSection).toContain('--color-surface-disabled')
    expect(darkSection).toContain('--color-cell-edited')
    expect(darkSection).toContain('--color-cell-conflict')
    expect(darkSection).toContain('--color-cell-locked')
  })

  it('declares all Typography Roles System classes (DS v3.1)', () => {
    const typographyClasses = [
      '.typography-display',
      '.typography-page-title',
      '.typography-section-title',
      '.typography-card-title',
      '.typography-body',
      '.typography-body-sm',
      '.typography-caption',
      '.typography-label',
      '.typography-metadata',
      '.typography-numeric',
      '.typography-numeric-emphasis',
      '.typography-grade-value',
      '.typography-status-label',
    ]

    for (const cls of typographyClasses) {
      expect(cssContent).toContain(cls)
    }
  })

  it('declares Density & Spacing Scale classes (DS v3.1)', () => {
    const densityClasses = [
      '.density-comfortable',
      '.density-dense',
      '.density-ultra-dense',
    ]

    for (const cls of densityClasses) {
      expect(cssContent).toContain(cls)
    }
  })

  it('declares Domain Cell States classes for Grades / Matrix / Attendance', () => {
    const cellClasses = [
      '.cell-state-clean',
      '.cell-state-edited',
      '.cell-state-saving',
      '.cell-state-saved',
      '.cell-state-conflict',
      '.cell-state-locked',
    ]

    for (const cls of cellClasses) {
      expect(cssContent).toContain(cls)
    }
  })

  it('declares Sprint DS-02 primitives (Button variants, Form helpers, Badges)', () => {
    const primitiveClasses = [
      '.btn-quiet',
      '.btn-icon',
      '.btn-loading',
      '.form-help-text',
      '.badge-syncing',
      '.badge-locked',
      '.badge-conflict',
      '.badge-offline',
    ]

    for (const cls of primitiveClasses) {
      expect(cssContent).toContain(cls)
    }
  })

  it('declares dark mode overrides for new badges and button variants', () => {
    const darkSection = cssContent.slice(cssContent.indexOf('.dark {'))
    expect(darkSection).toContain('.badge-syncing')
    expect(darkSection).toContain('.badge-locked')
    expect(darkSection).toContain('.badge-conflict')
    expect(darkSection).toContain('.badge-offline')
    expect(darkSection).toContain('.btn-quiet')
  })
})
