import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { useStore, activeProjectPath } from '../store'
import ModelPane from './ModelPane'
import ModelMenu from './ModelMenu'
import logoUrl from '../assets/gennal-logo.png'

function fitGrid(count: number, preferredRows: number, preferredCols: number): { rows: number; cols: number } {
  if (count <= 1) return { rows: 1, cols: 1 }

  if (count <= preferredRows * preferredCols) {
    // Rows/Cols are a *cap*, not a fixed reservation: only allocate as many
    // cells as there are panes so a lone terminal fills the whole area instead
    // of being parked in one quarter with dead space around it. Fill columns
    // first (reading order), then add only the rows those columns require.
    const cols = Math.min(preferredCols, count)
    const rows = Math.min(preferredRows, Math.ceil(count / cols))
    return { rows, cols }
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
  // edge (or using the pane's grow/shrink buttons) scales just that terminal,
  // anchored top-left, without disturbing its neighbours. Sizes live in the
  // store (keyed by session id) so the header buttons and the drag share state.
  const paneSizes = useStore((s) => s.paneSizes)
  const collapsedIds = useStore((s) => s.collapsedIds)
  const setPaneSize = useStore((s) => s.setPaneSize)
  const resetPaneSizeStore = useStore((s) => s.resetPaneSize)
  const prunePaneSizes = useStore((s) => s.prunePaneSizes)
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

  // Collapsed terminals dock as header-only bars at the bottom of the grid, so
  // the expanded terminals only have to share the freed-up space. We render
  // expanded panes first, then the docked bars, then the off-screen sessions
  // (kept mounted but hidden so their ptys survive) — all as direct children of
  // the same grid container, so toggling collapse only reorders nodes and never
  // re-parents a pane (which would unmount it and kill its shell).
  const collapsedSet = new Set(collapsedIds)
  const visibleExpanded = sessions.filter((s) => visibleIds.has(s.id) && !collapsedSet.has(s.id))
  const visibleCollapsed = sessions.filter((s) => visibleIds.has(s.id) && collapsedSet.has(s.id))
  const offscreen = sessions.filter((s) => !visibleIds.has(s.id))
  const ordered = [...visibleExpanded, ...visibleCollapsed, ...offscreen]

  // Size the tiled area to the expanded panes only; docked bars flow into
  // implicit auto-height rows beneath it.
  const expandedCount = visibleExpanded.length
  const grid = fitGrid(expandedCount || 1, rows, cols)
  const hasDock = visibleCollapsed.length > 0

  // Drop any per-pane sizes for sessions that have closed, so the map doesn't
  // grow unbounded as terminals come and go.
  useEffect(() => {
    prunePaneSizes(sessions.map((s) => s.id))
  }, [sessions, prunePaneSizes])

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
      const current = useStore.getState().paneSizes[id] ?? { w: 1, h: 1 }
      const next = { ...current }
      if (axis !== 'row') next.w = clamp((moveEvent.clientX - rect.left) / Math.max(rect.width, 1), 0.2, 1)
      if (axis !== 'col') next.h = clamp((moveEvent.clientY - rect.top) / Math.max(rect.height, 1), 0.2, 1)
      setPaneSize(id, next)
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
    if (axis === 'both') {
      resetPaneSizeStore(id)
      return
    }
    const current = useStore.getState().paneSizes[id] ?? { w: 1, h: 1 }
    setPaneSize(id, { w: axis === 'row' ? current.w : 1, h: axis === 'col' ? current.h : 1 })
  }

  return (
    <div
      ref={gridRef}
      className={`pane-grid mode-${mode} ${hasDock ? 'has-dock' : ''}`}
      style={{
        gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`,
        gridTemplateRows: expandedCount > 0 ? `repeat(${grid.rows}, minmax(0, 1fr))` : undefined
      }}
    >
      {ordered.map((s) => {
        const number = mine.findIndex((m) => m.id === s.id) + 1
        const visible = visibleIds.has(s.id)
        const isCollapsed = visible && collapsedSet.has(s.id)
        const size = isCollapsed ? { w: 1, h: 1 } : sizeFor(s.id)
        return (
          <div
            key={s.id}
            className={`pane-cell ${isCollapsed ? 'collapsed-cell' : ''}`}
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
              {tiled && visible && !isCollapsed && (
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
