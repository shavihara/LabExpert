import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'

const FullscreenContext = createContext()

export function FullscreenProvider({ children }) {
  const [isFullscreen, setIsFullscreen] = useState(() => !!document.fullscreenElement)
  const [fullscreenElement, setFullscreenElement] = useState(() => document.fullscreenElement || null)
  const [scope, setScope] = useState(() => {
    const el = document.fullscreenElement
    if (!el) return 'none'
    return el === document.documentElement ? 'app' : 'component'
  })
  const activeRef = useRef(null)

  useEffect(() => {
    const onFsChange = () => {
      const el = document.fullscreenElement || null
      setFullscreenElement(el)
      setIsFullscreen(!!el)
      setScope(!el ? 'none' : (el === document.documentElement ? 'app' : 'component'))
      try {
        // Only hide overflow if we are in component-specific fullscreen
        // If we are in app-wide fullscreen (document.documentElement), we generally still want scrolling
        const isAppFullscreen = el === document.documentElement;
        document.body.style.overflow = (el && !isAppFullscreen) ? 'hidden' : '';
      } catch {}
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  const requestAppFullscreen = async () => {
    const el = document.documentElement
    const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen
    if (req) {
      try { await req.call(el) } catch {}
    }
  }

  const requestFullscreenFor = async (el) => {
    if (!el) return
    const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen
    if (req) {
      try { await req.call(el); activeRef.current = el } catch {}
    }
  }

  const exitFullscreen = async () => {
    if (document.fullscreenElement) {
      try { await document.exitFullscreen() } catch {}
    }
  }

  const toggleAppFullscreen = async () => {
    if (document.fullscreenElement) {
      await exitFullscreen()
    } else {
      await requestAppFullscreen()
    }
  }

  const value = useMemo(() => ({
    isFullscreen,
    fullscreenElement,
    scope,
    requestAppFullscreen,
    requestFullscreenFor,
    exitFullscreen,
    toggleAppFullscreen
  }), [isFullscreen, fullscreenElement, scope])

  return (
    <FullscreenContext.Provider value={value}>
      {children}
    </FullscreenContext.Provider>
  )
}

export const useFullscreen = () => useContext(FullscreenContext)

