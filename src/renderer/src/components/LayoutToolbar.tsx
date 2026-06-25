import { useEffect, useRef, useState } from 'react'
import { useStore, type LayoutMode } from '../store'
import ModelMenu from './ModelMenu'

const svgProps = {
  viewBox: '0 0 16 16',
  width: 15,
  height: 15,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.4,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true
}

function ModeIcon({ id }: { id: LayoutMode | 'sessions' | 'preview' }): JSX.Element {
  switch (id) {
    case 'grid':
    case 'sessions':
      return (
        <svg {...svgProps}>
          <rect x="2" y="2" width="5" height="5" rx="1" />
          <rect x="9" y="2" width="5" height="5" rx="1" />
          <rect x="2" y="9" width="5" height="5" rx="1" />
          <rect x="9" y="9" width="5" height="5" rx="1" />
        </svg>
      )
    case 'tabs':
      return (
        <svg {...svgProps}>
          <rect x="2" y="3" width="12" height="10" rx="1.5" />
          <path d="M2 6h12M6 3v3" />
        </svg>
      )
    case 'stack':
      return (
        <svg {...svgProps}>
          <rect x="2" y="2.5" width="12" height="4" rx="1" />
          <rect x="2" y="9.5" width="12" height="4" rx="1" />
        </svg>
      )
    case 'float':
      return (
        <svg {...svgProps}>
          <rect x="2" y="2" width="8" height="8" rx="1" />
          <rect x="6" y="6" width="8" height="8" rx="1" />
        </svg>
      )
    case 'preview':
      return (
        <svg {...svgProps}>
          <circle cx="8" cy="8" r="6" />
          <path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12" />
        </svg>
      )
  }
}

type GridMenu = 'rows' | 'cols' | null

export default function LayoutToolbar(): JSX.Element {
  const [openMenu, setOpenMenu] = useState<GridMenu>(null)
  const menuRef = useRef<HTMLDivElement>(null)
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
      <div className="seg">
        <button
          className={`seg-btn ${previewCenter ? '' : 'active'}`}
          aria-pressed={!previewCenter}
          onClick={() => setPreviewCenter(false)}
        >
          <span className="seg-ico">
            <ModeIcon id="sessions" />
          </span>
          Sessions
        </button>
        <button
          className={`seg-btn ${previewCenter ? 'active' : ''}`}
          title="Show the website preview on the main screen"
          aria-pressed={previewCenter}
          onClick={() => setPreviewCenter(true)}
        >
          <span className="seg-ico">
            <ModeIcon id="preview" />
          </span>
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
