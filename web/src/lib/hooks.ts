import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'

/**
 * Load data on mount and whenever `deps` change; `reload` refetches.
 * With `poll` (ms) it also refetches quietly in the background while the tab is visible.
 */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[] = [], poll?: number) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  })

  const reload = useCallback(() => {
    setLoading(true)
    return loadRef
      .current()
      .then((d) => {
        setData(d)
        setError(null)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => void reload(), deps)

  useEffect(() => {
    if (!poll) return
    const id = setInterval(() => {
      if (!document.hidden) void reload()
    }, poll)
    return () => clearInterval(id)
  }, [poll, reload])

  return { data, error, loading, reload, setData }
}

export type CameraState = 'idle' | 'starting' | 'live' | 'denied' | 'unsupported'

/** Webcam stream bound to a <video>, plus a way to grab JPEG frames from it. */
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [state, setState] = useState<CameraState>('idle')

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setState('idle')
  }, [])

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState('unsupported')
      return
    }
    setState('starting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      setState('live')
    } catch {
      setState('denied')
    }
  }, [])

  const capture = useCallback((width = 960, quality = 0.85) => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return null
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = Math.round((video.videoHeight / video.videoWidth) * width)
    canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', quality)
  }, [])

  useEffect(() => stop, [stop])

  return { videoRef, state, start, stop, capture }
}

// Face photos need the auth header, so they're fetched as blobs and cached per student.
const photoCache = new Map<number, Promise<string | null>>()

export function forgetPhoto(id: number) {
  photoCache.delete(id)
}

export function usePhoto(id: number | undefined, enabled = true) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!id || !enabled) return
    let live = true
    if (!photoCache.has(id)) {
      photoCache.set(
        id,
        api
          .photo(id)
          .then((b) => URL.createObjectURL(b))
          .catch(() => null),
      )
    }
    photoCache.get(id)!.then((u) => live && setUrl(u))
    return () => {
      live = false
    }
  }, [id, enabled])
  return enabled ? url : null
}

/** Run `fn` on a keyboard shortcut like "mod+k" (mod = Ctrl or ⌘). */
export function useHotkey(combo: string, fn: () => void) {
  const fnRef = useRef(fn)
  useEffect(() => {
    fnRef.current = fn
  })
  useEffect(() => {
    const [mod, key] = combo.includes('+') ? combo.split('+') : [null, combo]
    const onKey = (e: KeyboardEvent) => {
      if (mod === 'mod' && !(e.ctrlKey || e.metaKey)) return
      if (e.key.toLowerCase() !== key) return
      e.preventDefault()
      fnRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [combo])
}

/** Ticks every `ms` so time-based UI (countdowns, "x min ago") re-renders. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}
