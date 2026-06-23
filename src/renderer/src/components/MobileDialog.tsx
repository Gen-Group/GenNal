import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { useStore } from '../store'
import Modal from './Modal'
import type { MobileStatus } from '../../../shared/types'

export default function MobileDialog(): JSX.Element | null {
  const open = useStore((s) => s.mobileOpen)
  const toggleMobile = useStore((s) => s.toggleMobile)

  const [status, setStatus] = useState<MobileStatus | null>(null)
  const [qr, setQr] = useState('')
  const [starting, setStarting] = useState(false)
  const [copied, setCopied] = useState(false)
  // Which LAN address the QR currently points at. The server listens on every
  // interface, so switching this just re-encodes the QR — no restart needed.
  const [activeHost, setActiveHost] = useState<string | null>(null)
  // Start the bridge when the dialog opens. The server keeps running after the
  // dialog closes so Settings → Mobile can show connected devices; it's stopped
  // explicitly from there ("Stop sharing") or when the app quits.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setStarting(true)
    setQr('')
    void window.api.mobile
      .start()
      .then((s) => {
        if (cancelled) return
        setStatus(s)
        setActiveHost(s.host ?? null)
        setStarting(false)
      })
      .catch(() => {
        if (!cancelled) {
          setStatus({ running: false, error: 'Could not start the mobile server.' })
          setStarting(false)
        }
      })
    return () => {
      cancelled = true
      setStatus(null)
      setActiveHost(null)
      setQr('')
    }
  }, [open])

  // (Re)generate the QR whenever the running server or the chosen address
  // changes. Building the URL here (rather than using status.url) lets the user
  // switch to another LAN address without restarting the server.
  const port = status?.port
  const token = status?.token
  useEffect(() => {
    if (!status?.running || !activeHost || !port || !token) {
      setQr('')
      return
    }
    let cancelled = false
    const url = `http://${activeHost}:${port}/?t=${token}`
    void QRCode.toDataURL(url, {
      margin: 1,
      width: 260,
      color: { dark: '#10101a', light: '#ffffff' }
    }).then((data) => {
      if (!cancelled) setQr(data)
    })
    return () => {
      cancelled = true
    }
  }, [status?.running, activeHost, port, token])

  // Poll the bridge while paired so connected phones (and their names) show up
  // under the QR as soon as they scan it.
  useEffect(() => {
    if (!open || !status?.running) return
    let cancelled = false
    const timer = window.setInterval(() => {
      void window.api.mobile.status().then((s) => {
        if (!cancelled) setStatus((prev) => (prev ? { ...prev, devices: s.devices } : prev))
      })
    }, 1500)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [open, status?.running])

  if (!open) return null

  const close = (): void => toggleMobile(false)
  const host = activeHost ?? status?.host ?? null
  const currentUrl =
    host && port && token ? `http://${host}:${port}/?t=${token}` : status?.url
  const currentDisplayUrl = host && port ? `http://${host}:${port}` : status?.displayUrl
  const addresses = status?.addresses ?? []
  const devices = status?.devices ?? []
  const copyUrl = (): void => {
    if (!currentUrl) return
    window.api.writeClipboardText(currentUrl)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Modal onClose={close}>
      <div
        className="mobile-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-title"
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
              <code>{currentDisplayUrl}</code>
              <button className="mobile-copy" onClick={copyUrl}>
                {copied ? 'Copied' : 'Copy link'}
              </button>
            </div>

            {addresses.length > 1 && (
              <div className="mobile-addresses">
                <span className="mobile-addresses-label">
                  Page won&apos;t load? Pick the address on your Wi-Fi network:
                </span>
                <div className="mobile-addresses-list">
                  {addresses.map((addr) => (
                    <button
                      key={addr}
                      className={'mobile-addr' + (addr === host ? ' active' : '')}
                      onClick={() => setActiveHost(addr)}
                    >
                      {addr}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mobile-devices">
              <span className="mobile-devices-label">
                {devices.length > 0
                  ? `Connected ${devices.length === 1 ? 'device' : 'devices'} (${devices.length})`
                  : 'No device connected yet'}
              </span>
              {devices.length === 0 ? (
                <p className="mobile-devices-empty">A device appears here the moment it scans the code.</p>
              ) : (
                <div className="mobile-devices-list">
                  {devices.map((d) => (
                    <div className="mobile-device" key={d.id}>
                      <span className="mobile-device-dot" aria-hidden="true" />
                      <span className="mobile-device-name">{d.name}</span>
                      <span className="mobile-device-ip">{d.ip}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mobile-note">
              <span className="mobile-lock" aria-hidden="true">🔒</span>
              The link carries a one-time pairing token, so only a device that scans this code can connect.
              The connection runs commands on this computer — only pair devices you trust. Sharing keeps
              running after you close this window; stop it any time from Settings → Mobile.
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
