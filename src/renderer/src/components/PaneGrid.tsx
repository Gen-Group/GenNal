import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useStore, activeProjectPath } from '../store'
import ModelPane from './ModelPane'
import ModelMenu from './ModelMenu'
import logoUrl from '../assets/gennal-logo.png'

function fitGrid(count: number, preferredRows: number, preferredCols: number): { rows: number; cols: number } {
  if (count <= preferredRows * preferredCols) {
    return { rows: preferredRows, cols: preferredCols }
  }

  const cols = Math.ceil(Math.sqrt(count))
  return { rows: Math.ceil(count / cols), cols }
}

const clamp = (value: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, value))

/** Fraction (0.2–1) of its grid cell a pane fills on each axis. */
type PaneSize = { w: number; h: number }

export default function PaneGrid(): JSX.Element {
  const gridRef = useRef<HTMLDivElement>(null)
  const sessions = useStore((s) => s.sessions)
  const workspace = useStore((s) => s.workspace)
  const rows = useStore((s) => s.rows)
  const cols = useStore((s) => s.cols)
  const mode = useStore((s) => s.mode)
  const activeId = useStore((s) => s.activeId)
  // Each pane is resized independently within its own grid cell: dragging an
  // edge shrinks/grows just that terminal (anchored top-left, leaving a gap),
  // without disturbing its neighbours. Sizes are keyed by session id.
  const [paneSizes, setPaneSizes] = useState<Record<string, PaneSize>>({})
  const sizeFor = (id: string): PaneSize => paneSizes[id] ?? { w: 1, h: 1 }

  // Terminals belong to the project they were opened in. We always render every
  // session so its live shell is never unmounted (which would kill the pty), and
  // simply hide the ones that don't belong to the active project. Switching
  // projects therefore swaps which terminals are shown and brings the previous
  // project's terminals back exactly as they were left.
  const projectPath = activeProjectPath(workspace)
  const mine = sessions.filter((s) => s.projectPath === projectPath)

  // Stack / Tabs collapse to a single visible pane; Grid/Float tile them.
  const tiled = mode === 'grid' || mode === 'float'
  const focusedId = mine.some((s) => s.id === activeId) ? activeId : mine[0]?.id
  const visibleIds = new Set(tiled ? mine.map((s) => s.id) : focusedId ? [focusedId] : [])

  const grid = fitGrid(mine.length, rows, cols)

  // Drop any per-pane sizes for sessions that have closed, so the map doesn't
  // grow unbounded as terminals come and go.
  useEffect(() => {
    setPaneSizes((prev) => {
      const live = Object.keys(prev).filter((id) => sessions.some((s) => s.id === id))
      if (live.length === Object.keys(prev).length) return prev
      return Object.fromEntries(live.map((id) => [id, prev[id]]))
    })
  }, [sessions])

  // Drag a pane's edge: measure its grid cell once, then map the pointer
  // position to a 0.2–1 fraction of that cell. The cell tracks stay fixed
  // (all 1fr), so a shrinking pane only opens a gap — neighbours don't move.
  const startPaneResize = (
    id: string,
    axis: 'col' | 'row' | 'both',
    event: ReactPointerEvent
  ): void => {
    event.preventDefault()
    event.stopPropagation()

    const cell = (event.currentTarget as HTMLElement).closest('.pane-cell')
    const rect = cell?.getBoundingClientRect()
    if (!rect) return

    const onMove = (moveEvent: PointerEvent): void => {
      setPaneSizes((prev) => {
        const current = prev[id] ?? { w: 1, h: 1 }
        const next = { ...current }
        if (axis !== 'row') next.w = clamp((moveEvent.clientX - rect.left) / Math.max(rect.width, 1), 0.2, 1)
        if (axis !== 'col') next.h = clamp((moveEvent.clientY - rect.top) / Math.max(rect.height, 1), 0.2, 1)
        return { ...prev, [id]: next }
      })
    }

    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.classList.remove('resizing-grid')
    }

    document.body.classList.add('resizing-grid')
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // Double-click a resizer to snap that axis (or both) back to an even split.
  const resetPaneSize = (id: string, axis: 'col' | 'row' | 'both'): void => {
    setPaneSizes((prev) => {
      const current = prev[id] ?? { w: 1, h: 1 }
      const next = { ...current }
      if (axis !== 'row') next.w = 1
      if (axis !== 'col') next.h = 1
      return { ...prev, [id]: next }
    })
  }

  return (
    <div
      ref={gridRef}
      className={`pane-grid mode-${mode}`}
      style={{
        gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${grid.rows}, minmax(0, 1fr))`
      }}
    >
      {sessions.map((s) => {
        const number = mine.findIndex((m) => m.id === s.id) + 1
        const visible = visibleIds.has(s.id)
        const size = sizeFor(s.id)
        return (
          <div
            key={s.id}
            className="pane-cell"
            style={{ display: visible ? undefined : 'none' }}
          >
            <div
              className="pane-cell-inner"
              style={{
                width: size.w >= 0.999 ? undefined : `${size.w * 100}%`,
                height: size.h >= 0.999 ? undefined : `${size.h * 100}%`
              }}
            >
              <ModelPane session={s} hidden={!visible} number={number || undefined} />
              {tiled && visible && (
                <>
                  <button
                    className="pane-edge-resizer pane-edge-right"
                    aria-label={`Resize terminal ${number} width (double-click to reset)`}
                    title="Drag to resize · double-click to reset"
                    onPointerDown={(event) => startPaneResize(s.id, 'col', event)}
                    onDoubleClick={() => resetPaneSize(s.id, 'col')}
                  />
                  <button
                    className="pane-edge-resizer pane-edge-bottom"
                    aria-label={`Resize terminal ${number} height (double-click to reset)`}
                    title="Drag to resize · double-click to reset"
                    onPointerDown={(event) => startPaneResize(s.id, 'row', event)}
                    onDoubleClick={() => resetPaneSize(s.id, 'row')}
                  />
                  <button
                    className="pane-edge-resizer pane-edge-corner"
                    aria-label={`Resize terminal ${number} (double-click to reset)`}
                    title="Drag to resize · double-click to reset"
                    onPointerDown={(event) => startPaneResize(s.id, 'both', event)}
                    onDoubleClick={() => resetPaneSize(s.id, 'both')}
                  />
                </>
              )}
            </div>
          </div>
        )
      })}

      {mine.length === 0 && (
        <div className="grid-empty-overlay">
          <div className="ge-card">
            <img className="ge-mark" src={logoUrl} alt="GenNal logo" />
            <h2>Launch your first model</h2>
            <p>Run Codex, Claude &amp; Gemini side by side — each in its own live session.</p>
            <ModelMenu label="+ New Session" variant="primary" />
          </div>
        </div>
      )}
    </div>
  )
}
