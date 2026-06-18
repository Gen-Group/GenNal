import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type UIEvent
} from 'react'
import { useStore, type CodePanelTab } from '../store'
import PanelTerminal from './PanelTerminal'
import ChatPanel from './ChatPanel'
import BrowserPreview from './BrowserPreview'

const CODE_TABS: CodePanelTab[] = ['CODE', 'CHAT', 'OUTPUT', 'PREVIEW', 'TERMINAL', 'PROBLEMS']

const SAMPLE = `import 'package:flutter/material.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'GenNal',
      home: const HomePage(),
    );
  }
}`

const TOKEN_RE =
  /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\/.*|\b(?:abstract|as|async|await|break|case|catch|class|const|continue|default|do|else|enum|extends|false|final|for|if|import|in|is|new|null|return|static|super|switch|this|throw|true|try|var|void|while|with|yield)\b|\b[A-Z][A-Za-z0-9_]*\b|\b\d+(?:\.\d+)?\b|@\w+|[{}()[\].,;:])/g

function tokenClass(token: string): string {
  if (token.startsWith('//')) return 'tok-comment'
  if (token.startsWith("'") || token.startsWith('"')) return 'tok-string'
  if (/^@\w+$/.test(token)) return 'tok-meta'
  if (/^\d/.test(token)) return 'tok-number'
  if (/^[A-Z]/.test(token)) return 'tok-type'
  if (/^[{}()[\].,;:]$/.test(token)) return 'tok-punctuation'
  return 'tok-keyword'
}

function highlightLine(line: string): JSX.Element[] {
  const tokens: JSX.Element[] = []
  let lastIndex = 0

  for (const match of line.matchAll(TOKEN_RE)) {
    const token = match[0]
    const index = match.index ?? 0

    if (index > lastIndex) {
      tokens.push(<span key={`${index}-plain`}>{line.slice(lastIndex, index)}</span>)
    }

    tokens.push(
      <span key={`${index}-${token}`} className={tokenClass(token)}>
        {token}
      </span>
    )
    lastIndex = index + token.length
  }

  if (lastIndex < line.length) {
    tokens.push(<span key="tail">{line.slice(lastIndex)}</span>)
  }

  return tokens
}

export default function RightPanel(): JSX.Element {
  const [terminalMounted, setTerminalMounted] = useState(false)
  const [chatMounted, setChatMounted] = useState(false)
  const [previewMounted, setPreviewMounted] = useState(false)
  const [scroll, setScroll] = useState({ left: 0, top: 0 })
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const codeTab = useStore((s) => s.codePanelTab)
  const setCodeTab = useStore((s) => s.setCodePanelTab)
  const workspace = useStore((s) => s.workspace)
  const workspaceError = useStore((s) => s.workspaceError)
  const panelSide = useStore((s) => s.panelSide)
  const setPanelSide = useStore((s) => s.setPanelSide)
  const panelWidth = useStore((s) => s.panelWidth)
  const setPanelWidth = useStore((s) => s.setPanelWidth)
  const panelMaximized = useStore((s) => s.panelMaximized)
  const togglePanelMaximized = useStore((s) => s.togglePanelMaximized)
  const togglePanel = useStore((s) => s.togglePanel)
  const openWorkspace = useStore((s) => s.openWorkspace)
  const createWorkspaceFile = useStore((s) => s.createWorkspaceFile)
  const updateWorkspaceContent = useStore((s) => s.updateWorkspaceContent)
  const saveWorkspaceFile = useStore((s) => s.saveWorkspaceFile)
  const runOutput = useStore((s) => s.runOutput)
  const running = useStore((s) => s.running)
  const runFile = useStore((s) => s.runFile)
  const stopRun = useStore((s) => s.stopRun)
  const clearRunOutput = useStore((s) => s.clearRunOutput)
  const editorSettings = useStore((s) => s.editorSettings)
  const outputRef = useRef<HTMLDivElement>(null)
  const autoSaveDirtyRef = useRef(false)
  const autoSavePathRef = useRef<string | undefined>(undefined)
  const [sampleCode, setSampleCode] = useState(SAMPLE)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const selectedFile = workspace?.selectedFile
  const code = workspace?.content ?? sampleCode
  const fileLabel = selectedFile?.relativePath ?? 'main.dart'
  const lineNumbers = useMemo(
    () => Array.from({ length: Math.max(code.split('\n').length, 1) }, (_, i) => i + 1),
    [code]
  )
  const highlightedLines = useMemo(() => code.split('\n').map(highlightLine), [code])

  const handleCodeChange = (value: string): void => {
    setSaveState('idle')
    if (workspace) {
      autoSaveDirtyRef.current = workspace.kind === 'project' && Boolean(selectedFile)
      updateWorkspaceContent(value)
    } else {
      setSampleCode(value)
    }
  }

  const handleSave = async (): Promise<void> => {
    if (!selectedFile) return
    setSaveState('saving')
    const saved = await saveWorkspaceFile(code)
    if (saved) {
      autoSaveDirtyRef.current = false
      setSaveState('saved')
    } else {
      setSaveState('idle')
    }
  }

  const handleScroll = (event: UIEvent<HTMLTextAreaElement>): void => {
    const target = event.currentTarget
    setScroll({ left: target.scrollLeft, top: target.scrollTop })
  }

  // Insert a real Tab or the configured number of spaces instead of moving focus.
  const handleEditorKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== 'Tab') return
    event.preventDefault()
    const target = event.currentTarget
    const { selectionStart, selectionEnd, value } = target
    const insert = editorSettings.insertSpaces ? ' '.repeat(editorSettings.tabSize) : '\t'
    const next = value.slice(0, selectionStart) + insert + value.slice(selectionEnd)
    handleCodeChange(next)
    const caret = selectionStart + insert.length
    requestAnimationFrame(() => {
      target.selectionStart = caret
      target.selectionEnd = caret
    })
  }

  const handleRun = (): void => {
    if (running) {
      stopRun()
      return
    }
    setCodeTab('OUTPUT')
    void runFile()
  }

  const handleNewFile = (): void => {
    const name = window.prompt('New file path')
    if (name?.trim()) void createWorkspaceFile(name.trim())
  }

  const startPanelResize = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    event.preventDefault()
    event.stopPropagation()

    const startX = event.clientX
    const startWidth = panelWidth
    const maxWidth = Math.min(720, Math.max(320, window.innerWidth - 520))

    const onMove = (moveEvent: PointerEvent): void => {
      const delta = panelSide === 'right' ? startX - moveEvent.clientX : moveEvent.clientX - startX
      setPanelWidth(Math.min(maxWidth, Math.max(280, startWidth + delta)))
    }

    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.classList.remove('resizing-panel')
    }

    document.body.classList.add('resizing-panel')
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // Spin up the panel shell the first time the TERMINAL tab is opened, then keep
  // it mounted (hidden) so the session survives switching between tabs.
  useEffect(() => {
    if (codeTab === 'TERMINAL') setTerminalMounted(true)
    // Keep the chat panel mounted once opened so its messages, draft input and
    // any in-flight reply survive switching to OUTPUT or other tabs.
    if (codeTab === 'CHAT') setChatMounted(true)
    // Keep the website preview alive across tab switches so its page, history and
    // scroll position survive (and a running dev server isn't reloaded).
    if (codeTab === 'PREVIEW') setPreviewMounted(true)
  }, [codeTab])

  useEffect(() => {
    if (panelMaximized && codeTab !== 'CODE' && codeTab !== 'CHAT' && codeTab !== 'PREVIEW') {
      setCodeTab('CODE')
    }
  }, [codeTab, panelMaximized, setCodeTab])

  // Keep the console pinned to the newest output.
  useEffect(() => {
    if (codeTab !== 'OUTPUT') return
    const el = outputRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [runOutput, codeTab])

  useEffect(() => {
    autoSaveDirtyRef.current = false
    autoSavePathRef.current = selectedFile?.path
    setSaveState('idle')
  }, [selectedFile?.path])

  useEffect(() => {
    if (workspace?.kind !== 'project' || !selectedFile || !autoSaveDirtyRef.current) return

    const filePath = selectedFile.path
    const timeout = window.setTimeout(() => {
      if (autoSavePathRef.current !== filePath) return
      setSaveState('saving')
      void saveWorkspaceFile(code).then((saved) => {
        if (autoSavePathRef.current !== filePath) return
        if (saved) {
          autoSaveDirtyRef.current = false
          setSaveState('saved')
        } else {
          setSaveState('idle')
        }
      })
    }, 900)

    return () => window.clearTimeout(timeout)
  }, [code, saveWorkspaceFile, selectedFile, workspace?.kind])

  const visibleTabs = panelMaximized
    ? CODE_TABS.filter((tab) => tab === 'CODE' || tab === 'CHAT' || tab === 'PREVIEW')
    : CODE_TABS
  const moveToLeft = panelSide === 'right'
  const showPanelMove = codeTab === 'CODE' || codeTab === 'TERMINAL'

  return (
    <aside className="rightpanel">
      <button
        className="panel-resizer"
        title="Drag to resize code panel. Double-click to reset."
        aria-label="Resize code panel"
        onPointerDown={startPanelResize}
        onDoubleClick={() => setPanelWidth(360)}
      />
      <div className="rp-code">
        <div className="rp-tabs">
          <div className="rp-tabgroup" role="tablist">
            {visibleTabs.map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={codeTab === t}
                className={codeTab === t ? 'active' : ''}
                onClick={() => setCodeTab(t)}
                onContextMenu={(event) => {
                  if (t !== 'CODE' && t !== 'CHAT') return
                  event.preventDefault()
                  setCodeTab(t)
                  togglePanelMaximized(true)
                }}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="rp-actions">
            {showPanelMove && (
              <button
                className="panel-move-btn"
                title={moveToLeft ? 'Move code panel to the left' : 'Move code panel to the right'}
                onClick={() => setPanelSide(moveToLeft ? 'left' : 'right')}
              >
                <span className="mv-arrow" aria-hidden="true">{moveToLeft ? '‹' : '›'}</span>
                <span>Move {moveToLeft ? 'left' : 'right'}</span>
              </button>
            )}
            <button
              className={`rp-icon-btn ${panelMaximized ? 'active' : ''}`}
              title={panelMaximized ? 'Exit full screen' : 'Full screen code panel'}
              aria-label={panelMaximized ? 'Exit full screen' : 'Full screen code panel'}
              aria-pressed={panelMaximized}
              onClick={() => togglePanelMaximized()}
            >
              {panelMaximized ? (
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 2v2.5A1.5 1.5 0 0 1 4.5 6H2M14 6h-2.5A1.5 1.5 0 0 1 10 4.5V2M10 14v-2.5A1.5 1.5 0 0 1 11.5 10H14M2 10h2.5A1.5 1.5 0 0 1 6 11.5V14" />
                </svg>
              ) : (
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2 6V3.5A1.5 1.5 0 0 1 3.5 2H6M10 2h2.5A1.5 1.5 0 0 1 14 3.5V6M14 10v2.5a1.5 1.5 0 0 1-1.5 1.5H10M6 14H3.5A1.5 1.5 0 0 1 2 12.5V10" />
                </svg>
              )}
            </button>
            <button
              className="rp-icon-btn rp-close-btn"
              title="Close code panel"
              aria-label="Close code panel"
              onClick={() => togglePanel(false)}
            >
              <svg viewBox="0 0 16 16" width="14" height="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
            <button
              className={`run-btn${running ? ' is-running' : ''}`}
              onClick={handleRun}
              title={running ? 'Stop the running file' : 'Run the open file'}
            >
              <span className="run-glyph" aria-hidden="true">{running ? '■' : '▶'}</span>
              {running ? 'Stop' : 'Run'}
            </button>
          </div>
        </div>

        {codeTab === 'CODE' && (
          <>
            <div className="rp-file">
              <span className="file-path-label" title={fileLabel}>{fileLabel}</span>
              {workspace?.truncated && <span className="rp-warn">Preview truncated</span>}
              {workspaceError && <span className="rp-warn">{workspaceError}</span>}
              {workspace?.kind === 'project' && selectedFile && (
                <span className="rp-warn">
                  {saveState === 'saving' ? 'Auto saving...' : 'Auto save on'}
                </span>
              )}
              <button disabled={!selectedFile || saveState === 'saving'} onClick={() => void handleSave()}>
                {saveState === 'saving' ? 'Saving...' : saveState === 'saved' ? 'Saved' : 'Save'}
              </button>
              <button disabled={workspace?.kind !== 'project'} onClick={handleNewFile}>New File</button>
              <button onClick={() => void openWorkspace('file')}>Upload File</button>
            </div>
            <div
              className={`code-editor${editorSettings.wordWrap ? ' wrap' : ''}${editorSettings.lineNumbers ? '' : ' no-gutter'}`}
              style={{ fontSize: editorSettings.fontSize, tabSize: editorSettings.tabSize }}
            >
              {editorSettings.lineNumbers && (
                <div className="code-gutter" aria-hidden="true">
                  <div style={{ transform: `translateY(${-scroll.top}px)` }}>
                    {lineNumbers.map((line) => (
                      <span key={line}>{line}</span>
                    ))}
                  </div>
                </div>
              )}
              <div className="code-input-wrap">
                <pre
                  className="code-highlight"
                  aria-hidden="true"
                  style={{ transform: `translate(${-scroll.left}px, ${-scroll.top}px)` }}
                >
                  {highlightedLines.map((line, index) => (
                    <div className="code-highlight-line" key={index}>
                      {line.length > 0 ? line : '\u00a0'}
                    </div>
                  ))}
                </pre>
                <textarea
                  ref={inputRef}
                  className="code-input"
                  spellCheck={editorSettings.spellCheck}
                  value={code}
                  onChange={(e) => handleCodeChange(e.target.value)}
                  onKeyDown={handleEditorKeyDown}
                  onScroll={handleScroll}
                />
              </div>
            </div>
          </>
        )}

        {chatMounted && <ChatPanel active={codeTab === 'CHAT'} />}

        {codeTab === 'OUTPUT' && (
          <>
            <div className="rp-output-bar">
              <span className={`run-status ${running ? 'on' : ''}`}>
                {running ? 'Running\u2026' : 'Idle'}
              </span>
              <span className="file-path-label" title={fileLabel}>{fileLabel}</span>
              <button className="grow" disabled={!running} onClick={() => stopRun()}>
                Stop
              </button>
              <button disabled={running || runOutput.length === 0} onClick={() => clearRunOutput()}>
                Clear
              </button>
            </div>
            <div className="rp-output" ref={outputRef}>
              <pre className="rp-output-body">
                {runOutput.length === 0 ? (
                  <span className="out-system">
                    No output yet. Press Run to execute the open file.
                  </span>
                ) : (
                  runOutput.map((line, index) => (
                    <span key={index} className={`out-${line.stream}`}>
                      {line.chunk}
                    </span>
                  ))
                )}
              </pre>
            </div>
          </>
        )}

        {previewMounted && <BrowserPreview active={codeTab === 'PREVIEW'} />}

        {terminalMounted && (
          <PanelTerminal
            active={codeTab === 'TERMINAL'}
            cwd={workspace?.kind === 'project' ? workspace.path : undefined}
          />
        )}

        {codeTab === 'PROBLEMS' && (
          <div className="rp-empty">No problems detected in the open file.</div>
        )}
      </div>

    </aside>
  )
}
