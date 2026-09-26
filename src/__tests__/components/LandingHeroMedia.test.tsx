import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LandingHeroMedia } from '../../components/landing/LandingHeroMedia'

describe('landing hero video lifecycle', () => {
  let observerCallback: IntersectionObserverCallback
  let motionChange: (() => void) | undefined
  let reduce: boolean
  let saveData: boolean
  let play: ReturnType<typeof vi.spyOn>
  let pause: ReturnType<typeof vi.spyOn>
  const enter = async (isIntersecting: boolean) => {
    await act(async () => observerCallback([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver))
  }

  beforeEach(() => {
    reduce = false
    saveData = false
    motionChange = undefined
    vi.stubGlobal('matchMedia', () => ({
      get matches() { return reduce },
      addEventListener: (_: string, callback: () => void) => { motionChange = callback },
      removeEventListener: vi.fn(),
    }))
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) { observerCallback = callback }
      observe() {}
      disconnect() {}
    })
    Object.defineProperty(navigator, 'connection', { configurable: true, get: () => ({ saveData }) })
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    delete (navigator as Navigator & { connection?: unknown }).connection
  })

  it('keeps a real photo and requests no video when no approved clip exists', () => {
    const { container } = render(<LandingHeroMedia />)
    expect(screen.getByRole('img')).toHaveAttribute('fetchpriority', 'high')
    expect(container.querySelector('video')).toBeNull()
    expect(play).not.toHaveBeenCalled()
  })

  it('loads only in view, reveals only on playing, and pauses off screen', async () => {
    const { container } = render(<LandingHeroMedia videoSrc="/approved-parish.mp4" />)
    const video = container.querySelector('video')!
    expect(video).not.toHaveAttribute('src')
    await enter(true)
    await enter(true)
    expect(video).toHaveAttribute('src', '/approved-parish.mp4')
    expect(play).toHaveBeenCalled()
    expect(video).toHaveAttribute('data-ready', 'false')
    fireEvent.playing(video)
    expect(video).toHaveAttribute('data-ready', 'true')
    fireEvent.click(screen.getByRole('button', { name: /tạm dừng/i }))
    expect(screen.getByRole('button', { name: /phát video/i })).toBeInTheDocument()
    await enter(false)
    expect(pause).toHaveBeenCalled()
  })

  it('does not load with reduced motion or data saving', async () => {
    reduce = true
    const { container, unmount } = render(<LandingHeroMedia videoSrc="/approved-parish.mp4" />)
    await enter(true)
    expect(container.querySelector('video')).not.toHaveAttribute('src')
    expect(play).not.toHaveBeenCalled()
    unmount()
    reduce = false
    saveData = true
    const saved = render(<LandingHeroMedia videoSrc="/approved-parish.mp4" />)
    expect(saved.container.querySelector('video')).not.toHaveAttribute('src')
    expect(play).not.toHaveBeenCalled()
  })

  it('pauses when motion preference changes or the document is hidden', async () => {
    render(<LandingHeroMedia videoSrc="/approved-parish.mp4" />)
    await enter(true)
    await enter(true)
    pause.mockClear()
    reduce = true
    act(() => motionChange?.())
    expect(pause).toHaveBeenCalled()
    pause.mockClear()
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    fireEvent(document, new Event('visibilitychange'))
    expect(pause).toHaveBeenCalled()
  })

  it('retains the photograph when video loading fails', async () => {
    const { container } = render(<LandingHeroMedia videoSrc="/approved-parish.mp4" />)
    await enter(true)
    fireEvent.error(container.querySelector('video')!)
    expect(container.querySelector('video')).toBeNull()
    expect(screen.getByRole('img')).toBeInTheDocument()
  })

  it('retains the photograph when autoplay is rejected', async () => {
    play.mockRejectedValue(new Error('Autoplay blocked'))
    const { container } = render(<LandingHeroMedia videoSrc="/approved-parish.mp4" />)
    await enter(true)
    await enter(true)
    await waitFor(() => expect(container.querySelector('video')).toBeNull())
    expect(screen.getByRole('img')).toBeInTheDocument()
  })
})
