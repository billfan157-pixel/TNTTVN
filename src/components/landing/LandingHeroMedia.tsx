import React, { useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'

interface LandingHeroMediaProps {
  videoSrc?: string
}

/** The real parish photograph always remains the first paint and video fallback. */
export function LandingHeroMedia({ videoSrc }: LandingHeroMediaProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [canLoadVideo, setCanLoadVideo] = useState(false)
  const [videoReady, setVideoReady] = useState(false)
  const [videoFailed, setVideoFailed] = useState(false)
  const [userPaused, setUserPaused] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video || !videoSrc) return

    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
    if (connection?.saveData) return

    let inView = false
    const syncPlayback = () => {
      if (motion?.matches || !inView || userPaused || document.visibilityState !== 'visible') {
        video.pause()
        return
      }
      setCanLoadVideo(true)
      if (canLoadVideo && !videoFailed) {
        void video.play().catch(() => {
          // The photograph stays visible when the browser declines autoplay.
          setVideoFailed(true)
        })
      }
    }

    const observer = new IntersectionObserver(([entry]) => {
      inView = !!entry?.isIntersecting
      syncPlayback()
    }, { threshold: 0.08 })

    observer.observe(video)
    motion?.addEventListener('change', syncPlayback)
    document.addEventListener('visibilitychange', syncPlayback)
    syncPlayback()
    return () => {
      observer.disconnect()
      motion?.removeEventListener('change', syncPlayback)
      document.removeEventListener('visibilitychange', syncPlayback)
      video.pause()
    }
  }, [canLoadVideo, userPaused, videoFailed, videoSrc])

  return (
    <div className="landing-hero-media absolute inset-0" aria-hidden="false">
      <img
        src="/images/xu-doan-tap-the-original.jpg"
        srcSet="/images/xu-doan-tap-the.jpg 1600w, /images/xu-doan-tap-the-original.jpg 2480w"
        sizes="100vw"
        alt="Tập thể huynh trưởng và thiếu nhi Xứ Đoàn Đức Mẹ Fatima, Giáo Xứ Gia Tôn chụp ảnh lưu niệm trước thánh đường"
        width={2480}
        height={1772}
        decoding="async"
        fetchPriority="high"
        className="scene-hero-bg landing-hero-photo absolute inset-0 w-full h-full object-cover object-center"
      />
      {videoSrc && !videoFailed && (
        <video
          ref={videoRef}
          className="landing-hero-video absolute inset-0 w-full h-full object-cover"
          aria-hidden="true"
          tabIndex={-1}
          muted
          playsInline
          loop
          preload="none"
          poster="/images/xu-doan-tap-the.jpg"
          src={canLoadVideo ? videoSrc : undefined}
          data-ready={videoReady}
          onPlaying={() => setVideoReady(true)}
          onError={() => setVideoFailed(true)}
        />
      )}
      {videoSrc && videoReady && !videoFailed && <button
        type="button"
        className="landing-video-control"
        aria-label={userPaused ? 'Phát video Xứ Đoàn' : 'Tạm dừng video Xứ Đoàn'}
        onClick={() => setUserPaused(value => !value)}
      >{userPaused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}</button>}
    </div>
  )
}
