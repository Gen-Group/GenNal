import { useEffect, useRef, useState } from 'react'
import { useStore, type LayoutMode } from '../store'
import ModelMenu from './ModelMenu'

const MODES: { id: LayoutMode; label: string; icon: string }[] = [
  { id: 'grid', label: 'Grid', icon: '▦' },
  { id: 'tabs', label: 'Tabs', icon: '▭' },
  { id: 'stack', label: 'Stack', icon: '☰' },
  { id: 'float', label: 'Float', icon: '◳' }
]

type GridMenu = 'rows' | 'cols' | null

export default function LayoutToolbar(): JSX.Element {
  const [openMenu, setOpenMenu] = useState<GridMenu>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const mode = useStore((s) => s.mode)
  const setMode = useStore((s) => s.setMode)
  const rows = useStore((s) => s.rows)
  const cols = useStore((s) => s.cols)
  const setGrid = useStore((s) => s.setGrid)
  const previewCenter = useStore((s) => s.previewCenter)
  const setPreviewCenter = useStore((s) => s.setPreviewCenter)
  const gridValues = [1, 2, 3]

  useEffect(() => {
    if (!openMenu) return

    const close = (event: MouseEvent): void => {
      if (menuRef.current?.contains(event.target as Node)) return
      setOpenMenu(null)
    }
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpenMenu(null)
    }

    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [openMenu])

  const chooseRows = (value: number): void => {
    setGrid(value, cols)
    setOpenMenu(null)
  }

  const chooseCols = (value: number): void => {
    setGrid(rows, value)
    setOpenMenu(null)
  }

  return (
    <div className="toolbar">
      {!previewCenter && (
        <div className="seg">
          {MODES.map((m) => (
            <button
              key={m.id}
              className={`seg-btn ${mode === m.id ? 'active' : ''}`}
              onClick={() => setMode(m.id)}
            >
              <span className="seg-ico">{m.icon}</span>
              {m.label}
            </button>
          ))}
        </div>
      )}

      <div className="seg">
        <button
          className={`seg-btn ${previewCenter ? '' : 'active'}`}
          onClick={() => setPreviewCenter(false)}
        >
          <span className="seg-ico">▦</span>
          Sessions
        </button>
        <button
          className={`seg-btn ${previewCenter ? 'active' : ''}`}
          title="Show the website preview on the main screen"
          onClick={() => setPreviewCenter(true)}
        >
          <span className="seg-ico">🌐</span>
          Preview
        </button>
      </div>

      <div className="tb-spacer" />

      {!previewCenter && (
      <div className="grid-dropdowns" ref={menuRef}>
        <div className="grid-select">
          <span className="dim-label">Rows</span>
          <button
            className={`grid-select-btn ${openMenu === 'rows' ? 'open' : ''}`}
            aria-haspopup="menu"
            aria-expanded={openMenu === 'rows'}
            onClick={() => setOpenMenu(openMenu === 'rows' ? null : 'rows')}
          >
            <span>{rows}</span>
            <span className="select-chevron" aria-hidden="true" />
          </button>
          {openMenu === 'rows' && (
            <div className="grid-menu" role="menu">
              {gridValues.map((value) => (
                <button
                  key={value}
                  className={rows === value ? 'active' : ''}
                  role="menuitemradio"
                  aria-checked={rows === value}
                  onClick={() => chooseRows(value)}
                >
                  <span>{value}</span>
                  <span className="grid-menu-check" aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid-select">
          <span className="dim-label">Cols</span>
          <button
            className={`grid-select-btn ${openMenu === 'cols' ? 'open' : ''}`}
            aria-haspopup="menu"
            aria-expanded={openMenu === 'cols'}
            onClick={() => setOpenMenu(openMenu === 'cols' ? null : 'cols')}
          >
            <span>{cols}</span>
            <span className="select-chevron" aria-hidden="true" />
          </button>
          {openMenu === 'cols' && (
            <div className="grid-menu" role="menu">
              {gridValues.map((value) => (
                <button
                  key={value}
                  className={cols === value ? 'active' : ''}
                  role="menuitemradio"
                  aria-checked={cols === value}
                  onClick={() => chooseCols(value)}
                >
                  <span>{value}</span>
                  <span className="grid-menu-check" aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      )}

      <ModelMenu label="+ New Session" variant="primary" />
    </div>
  )
}
