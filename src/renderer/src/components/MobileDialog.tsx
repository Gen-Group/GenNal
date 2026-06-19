import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { useStore } from '../store'
import type { MobileStatus } from '../../../shared/types'

export default function MobileDialog(): JSX.Element | null {
  const open = useStore((s) => s.mobileOpen)
  const toggleMobile = useStore((s) => s.toggleMobile)
  const workspace = useStore((s) => s.workspace)
  const sessions = useStore((s) => s.sessions)

  const [status, setStatus] = useState<MobileStatus | null>(null)
  const [qr, setQr] = useState('')
  const [starting, setStarting] = useState(false)
  const [copied, setCopied] = useState(false)
  // Track the latest "open" so an async start that resolves after the dialog was
  // closed doesn't leave the server running.
  const openRef = useRef(open)
  openRef.current = open

  // Start the bridge when the dialog opens; stop it when it closes.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setStarting(true)
    setQr('')
    void window.api.mobile
      .start()
      .then((s) => {
        if (cancelled || !openRef.current) {
          if (s.running) void window.api.mobile.stop()
          return
        }
        setStatus(s)
        setStarting(false)
        if (s.running && s.url) {
          void QRCode.toDataURL(s.url, {
            margin: 1,
            width: 260,
            color: { dark: '#10101a', light: '#ffffff' }
          }).then((data) => {
            if (!cancelled) setQr(data)
          })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus({ running: false, error: 'Could not start the mobile server.' })
          setStarting(false)
        }
      })
    return () => {
      cancelled = true
      void window.api.mobile.stop()
      setStatus(null)
      setQr('')
    }
  }, [open])

  // Keep the bridge's view of the open project + terminals current while paired.
  useEffect(() => {
    if (!open || !status?.running) return
    window.api.mobile.setContext({
      cwd: workspace?.kind === 'project' ? workspace.path : undefined,
      panes: sessions.map((s) => ({ id: s.id, label: s.label, tag: s.tag }))
    })
  }, [open, status?.running, workspace, sessions])

  if (!open) return null

  const close = (): void => toggleMobile(false)
  const copyUrl = (): void => {
    if (!status?.url) return
    window.api.writeClipboardText(status.url)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="mobile-overlay" onMouseDown={close}>
      <div
        className="mobile-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button className="mobile-close" aria-label="Close" onClick={close}>
          <svg viewBox="0 0 14 14" width="13" height="13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d="M3.5 3.5 L10.5 10.5 M10.5 3.5 L3.5 10.5" />
          </svg>
        </button>

        <div className="mobile-head">
          <div className="mobile-phone-ico" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="7" y="2" width="10" height="20" rx="2.5" />
              <path d="M10.5 18.5h3" />
            </svg>
          </div>
          <div>
            <h2 id="mobile-title">GenNal Mobile</h2>
            <p>Scan the code with your phone to chat and control GenNal from anywhere on your network.</p>
          </div>
        </div>

        {starting && <div className="mobile-state">Starting the mobile server…</div>}

        {!starting && status && !status.running && (
          <div className="mobile-error">{status.error || 'The mobile server is not running.'}</div>
        )}

        {!starting && status?.running && (
          <>
            <div className="mobile-qr">
              {qr ? <img src={qr} alt="Pairing QR code" /> : <div className="mobile-qr-skeleton" />}
            </div>

            <div className="mobile-steps">
              <ol>
                <li>Connect your phone to the same Wi-Fi as this computer.</li>
                <li>Open the camera and point it at the code.</li>
                <li>Tap the link to open GenNal Mobile.</li>
              </ol>
            </div>

            <div className="mobile-url">
              <code>{status.displayUrl}</code>
              <button className="mobile-copy" onClick={copyUrl}>
                {copied ? 'Copied' : 'Copy link'}
              </button>
            </div>

            <div className="mobile-note">
              <span className="mobile-lock" aria-hidden="true">🔒</span>
              The link carries a one-time pairing token, so only a device that scans this code can connect.
              The connection runs commands on this computer — only pair devices you trust, and the server
              stops the moment you close this window.
            </div>
          </>
        )}
      </div>
    </div>
  )
}
