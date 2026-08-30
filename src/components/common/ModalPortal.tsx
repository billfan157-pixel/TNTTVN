import { createPortal } from 'react-dom'

interface ModalPortalProps {
  children: React.ReactNode
}

/**
 * Mount dialog layers at document.body so route-transition transforms and
 * mobile shell stacking contexts cannot clip them below the top bar/nav.
 */
export function ModalPortal({ children }: ModalPortalProps) {
  if (typeof document === 'undefined') return null
  return createPortal(children, document.body)
}

export default ModalPortal
