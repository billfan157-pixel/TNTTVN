import { createElement } from 'react'
import type { HTMLAttributes } from 'react'

export type SurfaceVariant = 'panel' | 'card' | 'entity' | 'sunken' | 'plain'
export type SurfaceElement = 'div' | 'section' | 'article' | 'aside'

export interface SurfaceProps extends HTMLAttributes<HTMLElement> {
  as?: SurfaceElement
  variant?: SurfaceVariant
  interactive?: boolean
}

const VARIANT_CLASSES: Record<SurfaceVariant, string> = {
  panel: 'app-panel',
  card: 'card',
  entity: 'entity-card',
  sunken: 'surface-sunken',
  plain: '',
}

export function Surface({ as = 'div', variant = 'panel', interactive = false, className = '', children, ...props }: SurfaceProps) {
  return createElement(as, {
    ...props,
    className: `${VARIANT_CLASSES[variant]} ${interactive ? 'app-panel--interactive' : ''} ${className}`.trim(),
  }, children)
}
