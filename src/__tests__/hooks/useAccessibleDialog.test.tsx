import { fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAccessibleDialog } from '../../hooks/useAccessibleDialog'

interface DialogProbeProps {
  isOpen: boolean
  label: string
  onClose: () => void
}

function DialogProbe({ isOpen, label, onClose }: DialogProbeProps) {
  const { dialogRef, titleId } = useAccessibleDialog(isOpen, onClose)

  if (!isOpen) return null

  return (
    <div ref={dialogRef} role="dialog" aria-labelledby={titleId}>
      <h2 id={titleId}>{label}</h2>
      <button type="button">Focusable control</button>
    </div>
  )
}

function DialogStackProbe({ showNested, onOuterClose, onNestedClose }: {
  showNested: boolean
  onOuterClose: () => void
  onNestedClose: () => void
}) {
  return (
    <>
      <DialogProbe isOpen label="Outer dialog" onClose={onOuterClose} />
      <DialogProbe isOpen={showNested} label="Nested dialog" onClose={onNestedClose} />
    </>
  )
}

afterEach(() => {
  // Tests use an explicit unmount, but preserve a clean body if an assertion
  // fails before React Testing Library's automatic cleanup runs.
  document.body.style.overflow = ''
  document.body.style.paddingRight = ''
})

describe('useAccessibleDialog', () => {
  it('routes Escape only to the top-most dialog and restores the outer dialog lifecycle', () => {
    const onOuterClose = vi.fn()
    const onNestedClose = vi.fn()
    document.body.style.overflow = 'visible'
    document.body.style.paddingRight = '3px'

    const { rerender, unmount } = render(
      <DialogStackProbe
        showNested={false}
        onOuterClose={onOuterClose}
        onNestedClose={onNestedClose}
      />,
    )

    expect(document.body.style.overflow).toBe('hidden')

    rerender(
      <DialogStackProbe
        showNested
        onOuterClose={onOuterClose}
        onNestedClose={onNestedClose}
      />,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onNestedClose).toHaveBeenCalledTimes(1)
    expect(onOuterClose).not.toHaveBeenCalled()

    rerender(
      <DialogStackProbe
        showNested={false}
        onOuterClose={onOuterClose}
        onNestedClose={onNestedClose}
      />,
    )
    expect(document.body.style.overflow).toBe('hidden')

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onOuterClose).toHaveBeenCalledTimes(1)

    unmount()
    expect(document.body.style.overflow).toBe('visible')
    expect(document.body.style.paddingRight).toBe('3px')
  })
})
