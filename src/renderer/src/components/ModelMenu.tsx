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
            <button
              key={m.id}
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
          ))}
        </div>
      )}
    </div>
  )
}
