import { useMemo, useState, type KeyboardEvent } from 'react'
import { useStore, activeProjectPath, type BoardCard, type BoardColumnId } from '../store'

interface ColumnDef {
  id: BoardColumnId
  name: string
  accent: string
}

const COLUMNS: ColumnDef[] = [
  { id: 'todo', name: 'Todo', accent: '#8b95a7' },
  { id: 'in-progress', name: 'In progress', accent: '#2f8cff' },
  { id: 'in-review', name: 'In review', accent: '#f5a524' },
  { id: 'done', name: 'Done', accent: '#22c55e' }
]

/** A card's terminal session, if it points to one that's still alive. */
function useCardSession(card: BoardCard): { id: string; label: string; accent: string; status: string } | null {
  const session = useStore((s) => (card.sessionId ? s.sessions.find((x) => x.id === card.sessionId) : undefined))
  if (!session) return null
  return { id: session.id, label: session.label, accent: session.accent, status: session.status }
}

function Card({
  card,
  onDragStart,
  onDragEnd,
  onDropBefore
}: {
  card: BoardCard
  onDragStart: (id: string) => void
  onDragEnd: () => void
  onDropBefore: (beforeId: string) => void
}): JSX.Element {
  const updateBoardCard = useStore((s) => s.updateBoardCard)
  const removeBoardCard = useStore((s) => s.removeBoardCard)
  const launchCardSession = useStore((s) => s.launchCardSession)
  const focusCardSession = useStore((s) => s.focusCardSession)
  const models = useStore((s) => s.models)
  const session = useCardSession(card)

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(card.title)
  const [menuOpen, setMenuOpen] = useState(false)
  const [over, setOver] = useState(false)

  const commit = (): void => {
    setEditing(false)
    const next = draft.trim()
    if (next && next !== card.title) updateBoardCard(card.id, { title: next })
    else setDraft(card.title)
  }

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      commit()
    }
    if (e.key === 'Escape') {
      setDraft(card.title)
      setEditing(false)
    }
  }

  return (
    <article
      className={`board-card ${over ? 'drop-before' : ''}`}
      draggable={!editing}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', card.id)
        onDragStart(card.id)
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setOver(false)
        onDropBefore(card.id)
      }}
    >
      {editing ? (
        <textarea
          className="board-card-edit"
          autoFocus
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKey}
        />
      ) : (
        <div className="board-card-title" onDoubleClick={() => setEditing(true)} title="Double-click to edit">
          {card.title}
        </div>
      )}

      {session ? (
        <button
          className="board-card-session live"
          title={`Open ${session.label} (${session.status})`}
          onClick={() => focusCardSession(session.id)}
        >
          <span className="board-sess-dot" style={{ background: session.accent }} />
          <span className="board-sess-label">{session.label}</span>
          <span className={`board-sess-status st-${session.status}`}>{session.status}</span>
        </button>
      ) : (
        <div className="board-card-launch">
          <button
            className="board-card-session"
            title="Launch a terminal session for this card"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2" y="2.5" width="12" height="11" rx="2" />
              <path d="M5 6l2.2 2L5 10M8.5 10.5H11" />
            </svg>
            <span>{card.modelId ? 'Relaunch' : 'Launch'}</span>
          </button>
          {menuOpen && (
            <div className="board-launch-menu" role="menu">
              {models.map((m) => (
                <button
                  key={m.id}
                  role="menuitem"
                  className="board-launch-item"
                  onClick={() => {
                    setMenuOpen(false)
                    launchCardSession(card.id, m.id)
                  }}
                >
                  <span className="board-launch-dot" style={{ background: m.accent }} />
                  {m.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <button className="board-card-del" title="Delete card" aria-label="Delete card" onClick={() => removeBoardCard(card.id)}>
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 4.5h10M6.5 4.5V3.6a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v.9M4.8 4.5l.55 8a1 1 0 0 0 1 .93h3.3a1 1 0 0 0 1-.93l.55-8" />
        </svg>
      </button>
    </article>
  )
}

function Column({
  col,
  cards,
  dragId,
  onDragStart,
  onDragEnd
}: {
  col: ColumnDef
  cards: BoardCard[]
  dragId: string | null
  onDragStart: (id: string) => void
  onDragEnd: () => void
}): JSX.Element {
  const addBoardCard = useStore((s) => s.addBoardCard)
  const moveBoardCard = useStore((s) => s.moveBoardCard)
  const [composing, setComposing] = useState(false)
  const [text, setText] = useState('')
  const [over, setOver] = useState(false)

  const add = (): void => {
    const title = text.trim()
    if (title) addBoardCard(col.id, title)
    setText('')
    setComposing(false)
  }

  return (
    <section
      className={`board-col ${over ? 'col-over' : ''}`}
      onDragOver={(e) => {
        if (!dragId) return
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        if (dragId) moveBoardCard(dragId, col.id)
      }}
    >
      <header className="board-col-head">
        <span className="board-col-dot" style={{ background: col.accent }} />
        <span className="board-col-name">{col.name}</span>
        <span className="board-col-count">{cards.length}</span>
        <button className="board-col-add" title={`Add to ${col.name}`} aria-label={`Add card to ${col.name}`} onClick={() => setComposing(true)}>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d="M8 3.5v9M3.5 8h9" />
          </svg>
        </button>
      </header>

      <div className="board-col-body">
        {cards.map((card) => (
          <Card
            key={card.id}
            card={card}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDropBefore={(beforeId) => dragId && dragId !== beforeId && moveBoardCard(dragId, col.id, beforeId)}
          />
        ))}

        {composing ? (
          <div className="board-compose">
            <textarea
              className="board-compose-input"
              autoFocus
              rows={2}
              placeholder="What needs doing?"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  add()
                }
                if (e.key === 'Escape') {
                  setText('')
                  setComposing(false)
                }
              }}
              onBlur={() => (text.trim() ? add() : setComposing(false))}
            />
            <div className="board-compose-actions">
              <button className="board-compose-add" onMouseDown={(e) => e.preventDefault()} onClick={add}>
                Add card
              </button>
              <button className="board-compose-cancel" onMouseDown={(e) => e.preventDefault()} onClick={() => { setText(''); setComposing(false) }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button className="board-col-addrow" onClick={() => setComposing(true)}>
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <path d="M8 3.5v9M3.5 8h9" />
            </svg>
            Add a card
          </button>
        )}
      </div>
    </section>
  )
}

export default function WorkspaceBoardPanel(): JSX.Element {
  const toggleBoard = useStore((s) => s.toggleBoard)
  const workspace = useStore((s) => s.workspace)
  const boardCards = useStore((s) => s.boardCards)
  const [dragId, setDragId] = useState<string | null>(null)

  const projectPath = activeProjectPath(workspace)
  const projectName = workspace?.kind === 'project' ? workspace.name : null

  const byColumn = useMemo(() => {
    const map: Record<BoardColumnId, BoardCard[]> = { todo: [], 'in-progress': [], 'in-review': [], done: [] }
    boardCards
      .filter((c) => c.projectPath === projectPath)
      .sort((a, b) => a.order - b.order)
      .forEach((c) => map[c.column]?.push(c))
    return map
  }, [boardCards, projectPath])

  const total = COLUMNS.reduce((n, c) => n + byColumn[c.id].length, 0)

  const onDragStart = (id: string): void => setDragId(id)
  const onDragEnd = (): void => setDragId(null)

  return (
    <div className="board-panel">
      <header className="board-head">
        <button className="tasks-icon-btn" title="Close" onClick={() => toggleBoard(false)}>
          <svg viewBox="0 0 16 16" width="15" height="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
        <div className="board-title-wrap">
          <span className="board-title">Workspace board</span>
          <span className="board-sub">
            {projectName ? projectName : 'No project'} · {total} {total === 1 ? 'card' : 'cards'}
          </span>
        </div>
      </header>

      <div className="board-cols">
        {COLUMNS.map((col) => (
          <Column
            key={col.id}
            col={col}
            cards={byColumn[col.id]}
            dragId={dragId}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        ))}
      </div>
    </div>
  )
}
