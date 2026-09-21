import { render, screen } from '@testing-library/react'
import { beforeEach, expect, it } from 'vitest'
import { ToastContainer } from '../../components/common/ToastContainer'
import { useToastStore } from '../../stores/toastStore'

// Production CSP (vercel.json / nginx / server middleware, A-NEW-23) applies
// `style-src 'self'` WITHOUT 'unsafe-inline' for <style> elements: any inline
// <style> block in the main document is blocked on production. The toast enter
// animation must live in the static stylesheet (index.css), never in JSX.
beforeEach(() => {
  useToastStore.setState({ toasts: [] })
})

it('renders nothing when there are no toasts', () => {
  const { container } = render(<ToastContainer />)
  expect(container).toBeEmptyDOMElement()
})

it('renders toasts with the static animation class and no inline <style> element', () => {
  useToastStore.setState({
    toasts: [{ id: 't1', message: 'Xong việc', type: 'success' }],
  })
  const { container } = render(<ToastContainer />)
  expect(screen.getByText('Xong việc')).toBeInTheDocument()
  expect(container.querySelector('style')).toBeNull()
  const toast = screen.getByText('Xong việc').closest('div')
  expect(toast?.className).toContain('toast-slide-in')
})
