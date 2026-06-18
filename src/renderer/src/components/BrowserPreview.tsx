import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useStore } from '../store'

// Minimal surface of Electron's <webview> tag that we drive imperatively.
interface WebviewElement extends HTMLElement {
  src: string
  canGoBack(): boolean
  canGoForward(): boolean
  goBack(): void
  goForward(): void
  reload(): void
  stop(): void
  loadURL(url: string): Promise<void>
  getURL(): string
  executeJavaScript(code: string): Promise<unknown>
}

const FALLBACK_HOME = 'https://www.google.com'

/** Turn whatever the user typed in the address bar into a loadable URL. */
function normalizeAddress(input: string): string {
  const value = input.trim()
  if (!value) return FALLBACK_HOME
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) || value.startsWith('file:')) return value
  // A bare host (has a dot, no spaces) is a URL; anything else is a web search.
  if (/^[^\s]+\.[^\s]+$/.test(value) && !value.includes(' ')) return `https://${value}`
  return `https://www.google.com/search?q=${encodeURIComponent(value)}`
}

function shortLabel(url: string): string {
  try {
    const u = new URL(url)
    return u.protocol === 'file:' ? u.pathname.split('/').pop() || url : u.host
  } catch {
    return url
  }
}

export default function BrowserPreview({ active }: { active: boolean }): JSX.Element {
  const webviewRef = useRef<WebviewElement | null>(null)
  const readyRef = useRef(false)
  const lastNonceRef = useRef(-1)
  const pendingRef = useRef<string | null>(null)

  const previewUrl = useStore((s) => s.previewUrl)
  const previewNonce = useStore((s) => s.previewNonce)
  const homeUrl = useStore((s) => s.browserSettings.homeUrl)

  const home = homeUrl.trim() || FALLBACK_HOME
  // Resolved once: the very first page the guest loads via its `src` attribute.
  const initialSrcRef = useRef(previewUrl ?? home)

  const [address, setAddress] = useState(previewUrl ?? home)
  const [currentUrl, setCurrentUrl] = useState(previewUrl ?? home)
  const [loading, setLoading] = useState(false)
  const [canBack, setCanBack] = useState(false)
  const [canForward, setCanForward] = useState(false)

  const navigate = (url: string): void => {
    const view = webviewRef.current
    if (!view) return
    if (readyRef.current) {
      void view.loadURL(url)
    } else {
      pendingRef.current = url
    }
  }

  // Wire up the guest's lifecycle events once it is mounted.
  useEffect(() => {
    const view = webviewRef.current
    if (!view) return

    const syncNav = (): void => {
      try {
        setCanBack(view.canGoBack())
        setCanForward(view.canGoForward())
      } catch {
        /* guest not ready */
      }
    }
    const onReady = (): void => {
      readyRef.current = true
      if (pendingRef.current) {
        void view.loadURL(pendingRef.current)
        pendingRef.current = null
      }
      syncNav()
    }
    const onStart = (): void => setLoading(true)
    const onStop = (): void => {
      setLoading(false)
      syncNav()
    }
    const onNavigate = (e: Event): void => {
      const url = (e as unknown as { url?: string }).url
      if (url) {
        setCurrentUrl(url)
        setAddress(url)
      }
      syncNav()
    }

    view.addEventListener('dom-ready', onReady)
    view.addEventListener('did-start-loading', onStart)
    view.addEventListener('did-stop-loading', onStop)
    view.addEventListener('did-navigate', onNavigate)
    view.addEventListener('did-navigate-in-page', onNavigate)

    return () => {
      view.removeEventListener('dom-ready', onReady)
      view.removeEventListener('did-start-loading', onStart)
      view.removeEventListener('did-stop-loading', onStop)
      view.removeEventListener('did-navigate', onNavigate)
      view.removeEventListener('did-navigate-in-page', onNavigate)
    }
  }, [])

  // Follow the store: load a new URL whenever openPreview bumps the nonce.
  useEffect(() => {
    if (previewNonce === lastNonceRef.current) return
    lastNonceRef.current = previewNonce
    if (previewUrl) navigate(previewUrl)
  }, [previewUrl, previewNonce])

  // Self-heal the blank-webview case: Chromium gives a <webview> attached while
  // its container is display:none a 0×0 paint surface that never recovers on
  // show. When the preview becomes visible, ask the guest for its viewport width
  // and, if it's zero, reload once so it repaints at the real size.
  useEffect(() => {
    if (!active) return
    const view = webviewRef.current
    if (!view || !readyRef.current) return
    let cancelled = false
    requestAnimationFrame(() => {
      if (cancelled) return
      void view
        .executeJavaScript('window.innerWidth')
        .then((width) => {
          if (!cancelled && !width) view.reload()
        })
        .catch(() => {
          /* guest navigating — ignore */
        })
    })
    return () => {
      cancelled = true
    }
  }, [active])

  const onAddressKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const url = normalizeAddress(address)
      setAddress(url)
      navigate(url)
    } else if (e.key === 'Escape') {
      setAddress(currentUrl)
      e.currentTarget.blur()
    }
  }

  const goBack = (): void => webviewRef.current?.goBack()
  const goForward = (): void => webviewRef.current?.goForward()
  const reload = (): void => {
    const view = webviewRef.current
    if (!view) return
    if (loading) view.stop()
    else view.reload()
  }
  const goHome = (): void => navigate(home)
  const openExternal = (): void => window.api.openExternal(currentUrl)

  return (
    <div className={`rp-browser${active ? '' : ' hidden'}`}>
      <div className="rp-browser-bar">
        <button className="rp-browser-nav" title="Back" disabled={!canBack} onClick={goBack} aria-label="Back">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 3 5 8l5 5" />
          </svg>
        </button>
        <button className="rp-browser-nav" title="Forward" disabled={!canForward} onClick={goForward} aria-label="Forward">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 3l5 5-5 5" />
          </svg>
        </button>
        <button className="rp-browser-nav" title={loading ? 'Stop' : 'Reload'} onClick={reload} aria-label={loading ? 'Stop' : 'Reload'}>
          {loading ? (
            <svg viewBox="0 0 16 16" width="13" height="13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M13 8a5 5 0 1 1-1.5-3.5M13 3v2.5h-2.5" />
            </svg>
          )}
        </button>
        <button className="rp-browser-nav" title="Home" onClick={goHome} aria-label="Home">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2.5 7.5 8 3l5.5 4.5M4 6.8V13h8V6.8" />
          </svg>
        </button>
        <input
          className="rp-browser-address"
          value={address}
          spellCheck={false}
          placeholder="Enter a URL or search…"
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={onAddressKeyDown}
          onFocus={(e) => e.currentTarget.select()}
        />
        <button className="rp-browser-nav" title="Open in system browser" onClick={openExternal} aria-label="Open in system browser">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 3h4v4M13 3 7 9M11 9.5V12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2.5" />
          </svg>
        </button>
      </div>
      <div className="rp-browser-view">
        <webview
          ref={(el) => {
            webviewRef.current = el as unknown as WebviewElement | null
          }}
          className="rp-webview"
          src={initialSrcRef.current}
          allowpopups
        />
      </div>
      <div className="rp-browser-status" title={currentUrl}>
        {loading ? 'Loading…' : shortLabel(currentUrl)}
      </div>
    </div>
  )
}
