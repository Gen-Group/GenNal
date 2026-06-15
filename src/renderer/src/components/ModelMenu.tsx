import { useState, useRef, useEffect } from 'react'
import { useStore } from '../store'

/** A small "+ New Model Session" dropdown reused in the title bar and toolbar. */
export default function ModelMenu({
  label = '+ New Session',
  variant = 'ghost'
}: {
  label?: string
  variant?: 'ghost' | 'primary'
}): JSX.Element {
  const models = useStore((s) => s.models)
  const addSession = useStore((s) => s.addSession)
  const removeModel = useStore((s) => s.removeModel)
  const toggleAddModel = useStore((s) => s.toggleAddModel)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  return (
    <div className="menu-wrap" ref={ref}>
      <button className={`btn btn-${variant}`} onClick={() => setOpen((v) => !v)}>
        {label}
      </button>
      {open && (
        <div className="menu">
          <div className="menu-title">Launch a model</div>
          {models.map((m) => (
            <div key={m.id} className="menu-row">
              <button
                className="menu-item"
                onClick={() => {
                  addSession(m.id)
                  setOpen(false)
                }}
              >
                <span className="menu-dot" style={{ background: m.accent }} />
                <span>{m.label}</span>
                <span className="menu-tag">{m.tag}</span>
              </button>
              {m.custom && (
                <button
                  className="menu-remove"
                  title={`Remove ${m.label}`}
                  aria-label={`Remove ${m.label}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    void removeModel(m.id)
                  }}
                >
                  <svg viewBox="0 0 16 16" width="13" height="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                    <path d="M4 4l8 8M12 4l-8 8" />
                  </svg>
                </button>
              )}
            </div>
          ))}
          <button
            className="menu-item menu-add"
            onClick={() => {
              toggleAddModel(true)
              setOpen(false)
            }}
          >
            <span className="menu-dot menu-dot-add">+</span>
            <span>Add model…</span>
          </button>
        </div>
      )}
    </div>
  )
}
