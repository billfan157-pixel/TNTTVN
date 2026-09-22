import { beforeEach, describe, expect, it } from 'vitest'
import { loadInterFontAsync } from '../lib/fontLoader'

describe('fontLoader (non-blocking Inter, CSP-safe)', () => {
  beforeEach(() => {
    document.head.querySelectorAll('link[data-inter-font]').forEach((node) => node.remove())
  })

  it('injects a preload stylesheet link without inline handlers', () => {
    loadInterFontAsync()
    const link = document.head.querySelector<HTMLLinkElement>('link[data-inter-font]')
    expect(link).not.toBeNull()
    expect(link?.rel).toBe('preload')
    expect(link?.getAttribute('as')).toBe('style')
    expect(link?.href).toContain('fonts.googleapis.com/css2')
    expect(link?.getAttribute('onload')).toBeNull()
  })

  it('is idempotent across repeated calls', () => {
    loadInterFontAsync()
    loadInterFontAsync()
    expect(document.head.querySelectorAll('link[data-inter-font]')).toHaveLength(1)
  })
})
