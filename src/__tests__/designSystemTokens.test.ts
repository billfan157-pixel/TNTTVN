import { describe, it, expect } from 'vitest'
import path from 'path'
import { readCssGraph } from './helpers/cssGraph'

type Rgb = readonly [number, number, number]

const hexToRgb = (hex: string): Rgb => {
  const normalized = hex.replace('#', '')
  return [0, 2, 4].map(index => Number.parseInt(normalized.slice(index, index + 2), 16)) as unknown as Rgb
}

const relativeLuminance = (color: Rgb) => {
  const [red, green, blue] = color.map(channel => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue)
}

const contrastRatio = (foreground: Rgb, background: Rgb) => {
  const foregroundLuminance = relativeLuminance(foreground)
  const backgroundLuminance = relativeLuminance(background)
  const lighter = Math.max(foregroundLuminance, backgroundLuminance)
  const darker = Math.min(foregroundLuminance, backgroundLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}

const blend = (foreground: Rgb, background: Rgb, alpha: number): Rgb => (
  foreground.map((channel, index) => Math.round((channel * alpha) + (background[index] * (1 - alpha)))) as unknown as Rgb
)

const tokenColor = (section: string, token: string): Rgb => {
  const match = section.match(new RegExp(`${token}:\\s*(#[0-9A-Fa-f]{6})`))
  if (!match) throw new Error(`Missing hex color token: ${token}`)
  return hexToRgb(match[1])
}

const ruleBody = (css: string, selector: string) => {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`Missing CSS rule: ${selector}`)
  const end = css.indexOf('}', start)
  return css.slice(start, end + 1)
}

const rgbaBackground = (css: string, selector: string) => {
  const match = ruleBody(css, selector).match(/background:\s*rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/)
  if (!match) throw new Error(`Missing rgba background: ${selector}`)
  return {
    color: [Number(match[1]), Number(match[2]), Number(match[3])] as Rgb,
    alpha: Number(match[4]),
  }
}

describe('Design System v4.5 Foundation Tokens & Classes', () => {
  const cssPath = path.resolve(__dirname, '../index.css')
  const cssContent = readCssGraph(cssPath)

  it('declares all mandatory interaction tokens in @theme', () => {
    const requiredTokens = [
      '--color-focus-ring',
      '--color-focus-ring-brand',
      '--color-text-placeholder-on-brand',
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

  it('keeps placeholder tokens at WCAG AA text contrast on supported input surfaces', () => {
    const themeSection = cssContent.slice(cssContent.indexOf('@theme {'), cssContent.indexOf('GLOBAL RESET & BASE'))
    const darkSection = cssContent.slice(cssContent.indexOf('.dark {'))
    const surfaceTokens = [
      '--color-surface-card',
      '--color-surface-raised',
      '--color-surface-sunken',
      '--color-surface-hover',
      '--color-surface-app',
    ]

    const lightPlaceholder = tokenColor(themeSection, '--color-text-placeholder')
    const darkPlaceholder = tokenColor(darkSection, '--color-text-placeholder')

    for (const surfaceToken of surfaceTokens) {
      expect(contrastRatio(lightPlaceholder, tokenColor(themeSection, surfaceToken)), `light ${surfaceToken}`).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(darkPlaceholder, tokenColor(darkSection, surfaceToken)), `dark ${surfaceToken}`).toBeGreaterThanOrEqual(4.5)
    }

    expect(cssContent).toMatch(/::placeholder\s*\{\s*opacity:\s*1;/)
  })

  it('keeps inverse placeholder and focus tokens visible on every navy brand surface', () => {
    const themeSection = cssContent.slice(cssContent.indexOf('@theme {'), cssContent.indexOf('GLOBAL RESET & BASE'))
    const placeholder = tokenColor(themeSection, '--color-text-placeholder-on-brand')
    const focusRing = tokenColor(themeSection, '--color-focus-ring-brand')
    const brandStops = ['.mobile-top-bar', '.app-header'].flatMap(selector => (
      [...ruleBody(cssContent, selector).matchAll(/#[0-9A-Fa-f]{6}/g)].map(match => hexToRgb(match[0]))
    ))

    for (const background of brandStops) {
      expect(contrastRatio(placeholder, background)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(focusRing, background)).toBeGreaterThanOrEqual(3)
    }

    const white: Rgb = [255, 255, 255]
    const scrim = rgbaBackground(cssContent, '.mobile-control-sheet__scrim')
    const sheet = rgbaBackground(cssContent, '.mobile-control-sheet')
    const worstCaseSheetBackground = blend(sheet.color, blend(scrim.color, white, scrim.alpha), sheet.alpha)
    expect(contrastRatio(placeholder, worstCaseSheetBackground)).toBeGreaterThanOrEqual(4.5)

    expect(cssContent).toContain('.app-header__search::placeholder { color: var(--color-text-placeholder-on-brand); }')
    expect(cssContent).toMatch(/\.mobile-control-search input::placeholder\s*\{\s*color:\s*var\(--color-text-placeholder-on-brand\);/)
    expect(cssContent).toMatch(/:is\(\.app-header, \.mobile-top-bar, \.mobile-control-sheet\) :focus-visible\s*\{[\s\S]*?outline:\s*3px solid var\(--color-focus-ring-brand\);/)
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
