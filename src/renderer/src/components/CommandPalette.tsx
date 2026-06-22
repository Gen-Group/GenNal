import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import type { CodePanelTab } from '../store'

type ResultGroup = 'Sessions' | 'Tabs' | 'Settings' | 'Actions'

interface PaletteItem {
  key: string
  group: ResultGroup
  label: string
  hint?: string
  badge?: string
  keywords?: string
  run: () => void
}

const GROUP_ORDER: ResultGroup[] = ['Sessions', 'Tabs', 'Settings', 'Actions']
const PANEL_TABS: CodePanelTab[] = ['CODE', 'CHAT', 'OUTPUT', 'PREVIEW', 'TERMINAL', 'PROBLEMS']

export default function CommandPalette(): JSX.Element | null {
  const open = useStore((s) => s.paletteOpen)
  const toggle = useStore((s) => s.togglePalette)
  const models = useStore((s) => s.models)
  const sessions = useStore((s) => s.sessions)
  const addSession = useStore((s) => s.addSession)
  const setActive = useStore((s) => s.setActive)
  const setGrid = useStore((s) => s.setGrid)
  const openWorkspace = useStore((s) => s.openWorkspace)
  const browseProject = useStore((s) => s.browseProject)
  const createWorkspaceFile = useStore((s) => s.createWorkspaceFile)
  const createWorkspaceFolder = useStore((s) => s.createWorkspaceFolder)
  const toggleSettings = useStore((s) => s.toggleSettings)
  const toggleProfileSetup = useStore((s) => s.toggleProfileSetup)
  const toggleTasks = useStore((s) => s.toggleTasks)
  const togglePanel = useStore((s) => s.togglePanel)
  const setCodePanelTab = useStore((s) => s.setCodePanelTab)
  const openPreview = useStore((s) => s.openPreview)
  const previewUrl = useStore((s) => s.previewUrl)
  const homeUrl = useStore((s) => s.browserSettings.homeUrl)

  const [q, setQ] = useState('')
  const [active, setActiveIndex] = useState(0)
  const activeRef = useRef<HTMLButtonElement | null>(null)

  // Reset the query and selection every time the palette opens.
  useEffect(() => {
    if (open) {
      setQ('')
      setActiveIndex(0)
    }
  }, [open])

  const items = useMemo<PaletteItem[]>(() => {
    const list: PaletteItem[] = []

    // Sessions — the app's "recent worktrees": jump to a running terminal.
    for (const session of sessions) {
      list.push({
        key: `session-${session.id}`,
        group: 'Sessions',
        label: session.label,
        hint: session.cwd ?? session.command,
        badge: session.tag,
        keywords: `${session.modelId} ${session.status} ${session.tag}`,
        run: () => {
          toggleTasks(false)
          setActive(session.id)
        }
      })
    }

    // Tabs — focus a tab inside the side panel.
    for (const tab of PANEL_TABS) {
      list.push({
        key: `tab-${tab}`,
        group: 'Tabs',
        label: tab.charAt(0) + tab.slice(1).toLowerCase(),
        hint: 'panel',
        keywords: `tab panel ${tab}`,
        run: () => {
          togglePanel(true)
          setCodePanelTab(tab)
        }
      })
    }

    // Settings.
    list.push({
      key: 'settings-open',
      group: 'Settings',
      label: 'Open Settings',
      hint: 'preferences',
      keywords: 'settings preferences theme privacy editor terminal browser',
      run: () => toggleSettings(true)
    })
    list.push({
      key: 'settings-profile',
      group: 'Settings',
      label: 'Edit Profile',
      hint: 'account',
      keywords: 'profile account name avatar',
      run: () => toggleProfileSetup(true)
    })

    // Actions.
    for (const model of models) {
      list.push({
        key: `launch-${model.id}`,
        group: 'Actions',
        label: `Launch ${model.label}`,
        hint: model.tag,
        keywords: `launch new session ${model.id} ${model.tag}`,
        run: () => {
          toggleTasks(false)
          addSession(model.id)
        }
      })
    }
    list.push(
      {
        key: 'new-file',
        group: 'Actions',
        label: 'New File',
        hint: 'workspace',
        keywords: 'new file create workspace',
        run: () => {
          const name = window.prompt('New file path')
          if (name?.trim()) void createWorkspaceFile(name.trim())
        }
      },
      {
        key: 'new-folder',
        group: 'Actions',
        label: 'New Folder',
        hint: 'workspace',
        keywords: 'new folder directory create workspace',
        run: () => {
          const name = window.prompt('New folder path')
          if (name?.trim()) void createWorkspaceFolder(name.trim())
        }
      },
      {
        key: 'open-file',
        group: 'Actions',
        label: 'Upload File',
        hint: 'workspace',
        keywords: 'open upload file workspace',
        run: () => void openWorkspace('file')
      },
      {
        key: 'open-project',
        group: 'Actions',
        label: 'Upload Project',
        hint: 'workspace',
        keywords: 'open upload project folder workspace',
        run: () => void browseProject()
      },
      {
        key: 'browser-preview',
        group: 'Actions',
        label: 'New Browser Tab',
        hint: 'preview',
        keywords: 'browser website preview web localhost url open tab',
        run: () => openPreview(previewUrl || homeUrl.trim() || 'https://www.google.com')
      },
      {
        key: 'tasks',
        group: 'Actions',
        label: 'Open Automations',
        hint: 'tasks',
        keywords: 'tasks automations',
        run: () => toggleTasks(true)
      },
      {
        key: 'new-window',
        group: 'Actions',
        label: 'New Window',
        hint: 'app',
        keywords: 'new window open',
        run: () => window.api.win.newWindow()
      },
      {
        key: 'grid-2',
        group: 'Actions',
        label: 'Layout: Grid 2×2',
        hint: 'layout',
        keywords: 'layout grid four panes',
        run: () => setGrid(2, 2)
      },
      {
        key: 'grid-1',
        group: 'Actions',
        label: 'Layout: Single',
        hint: 'layout',
        keywords: 'layout single one pane',
        run: () => setGrid(1, 1)
      }
    )

    return list
  }, [
    sessions,
    models,
    addSession,
    setActive,
    setGrid,
    openWorkspace,
    browseProject,
    createWorkspaceFile,
    createWorkspaceFolder,
    toggleSettings,
    toggleProfileSetup,
    toggleTasks,
    togglePanel,
    setCodePanelTab,
    openPreview,
    previewUrl,
    homeUrl
  ])

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const matched = needle
      ? items.filter((item) =>
          `${item.label} ${item.hint ?? ''} ${item.badge ?? ''} ${item.keywords ?? ''}`
            .toLowerCase()
            .includes(needle)
        )
      : items
    // Keep a stable, grouped order regardless of source order.
    return matched
      .slice()
      .sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group))
  }, [items, q])

  // Clamp the active row whenever the result set shrinks.
  useEffect(() => {
    setActiveIndex((i) => (results.length === 0 ? 0 : Math.min(i, results.length - 1)))
  }, [results.length])

  // Keep the highlighted row visible as the user arrows through.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (results.length ? (i + 1) % results.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (results.length ? (i - 1 + results.length) % results.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = results[active]
      if (item) {
        item.run()
        toggle(false)
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      toggle(false)
    }
  }

  let lastGroup: ResultGroup | null = null

  return (
    <div className="palette-overlay" onMouseDown={() => toggle(false)}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <div className="palette-search">
          <svg
            className="palette-search-icon"
            viewBox="0 0 16 16"
            width="15"
            height="15"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="7" cy="7" r="4.5" />
            <path d="M11 11l3 3" />
          </svg>
          <input
            autoFocus
            className="palette-input"
            placeholder="Search sessions, settings, tabs, and actions…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={onKeyDown}
          />
        </div>

        <div className="palette-list">
          {results.map((item, index) => {
            const showHeader = item.group !== lastGroup
            lastGroup = item.group
            const isActive = index === active
            return (
              <div key={item.key}>
                {showHeader && <div className="palette-group">{item.group}</div>}
                <button
                  ref={isActive ? activeRef : null}
                  className={`palette-item${isActive ? ' is-active' : ''}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => {
                    item.run()
                    toggle(false)
                  }}
                >
                  <span className="palette-item-main">
                    <span className="palette-dot" aria-hidden="true" />
                    <span className="palette-label">{item.label}</span>
                    {item.hint && <span className="palette-hint">{item.hint}</span>}
                  </span>
                  {item.badge && <span className="palette-badge">{item.badge}</span>}
                </button>
              </div>
            )
          })}
          {results.length === 0 && <div className="palette-empty">No matching results</div>}
        </div>

        <div className="palette-footer">
          <span className="palette-foot-group">
            <kbd>Enter</kbd>
            <span>Open</span>
          </span>
          <span className="palette-foot-group">
            <kbd>Esc</kbd>
            <span>Close</span>
          </span>
          <span className="palette-foot-group">
            <kbd>↑↓</kbd>
            <span>Move</span>
          </span>
        </div>
      </div>
    </div>
  )
}
