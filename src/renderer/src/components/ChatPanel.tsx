import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent
} from 'react'
import { useStore } from '../store'
import type { CliUsage } from '../../../shared/types'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

// "4h 59m (06/16 03:41)" — time left until the window resets, plus the clock time.
function fmtReset(iso?: string): string {
  if (!iso) return ''
  const when = new Date(iso)
  if (Number.isNaN(when.getTime())) return ''
  const at = `${pad2(when.getMonth() + 1)}/${pad2(when.getDate())} ${pad2(when.getHours())}:${pad2(when.getMinutes())}`
  const diff = when.getTime() - Date.now()
  if (diff <= 0) return `now (${at})`
  const mins = Math.floor(diff / 60000)
  const days = Math.floor(mins / 1440)
  const hrs = Math.floor((mins % 1440) / 60)
  const rem = mins % 60
  const parts: string[] = []
  if (days) parts.push(`${days}d`)
  if (days || hrs) parts.push(`${hrs}h`)
  parts.push(`${rem}m`)
  return `${parts.join(' ')} (${at})`
}

// "2026-05-29 20:50"
function fmtDateTime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function isWeeklyLimit(label: string, windowMinutes?: number): boolean {
  return /week/i.test(label) || (typeof windowMinutes === 'number' && windowMinutes >= 1440)
}

// "just now" / "5m ago" / "3h ago" / "2d ago" for the chat-history list.
function relTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''
  const mins = Math.round((Date.now() - then) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

interface ChatAttachment {
  path: string
  name: string
  dataUrl: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  pending?: boolean
  error?: boolean
  images?: ChatAttachment[]
}

interface MessagePart {
  type: 'text' | 'code'
  content: string
  lang?: string
}

// Built-in CLIs (claude/codex/gemini) chat through their known headless print
// mode; user-added models chat by running their own command with the prompt
// appended. So any model with a command qualifies — only the command-less Shell
// model is excluded (see the chatModels filter below).

function uid(): string {
  return 'msg_' + Math.random().toString(36).slice(2, 10)
}

function baseCommand(command: string): string {
  return command.trim().split(/\s+/)[0] ?? ''
}

type DroppedFile = File & { path?: string }

function isImageType(type: string): boolean {
  return type.startsWith('image/')
}

function isImagePath(path: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|svg|ico|avif)$/i.test(path)
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

// Headless replies are mostly plain text, but may carry a few colour codes.
function stripAnsi(input: string): string {
  return input
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[=>NOABCDEFGHIJKM78]/g, '')
}

function cleanText(raw: string): string {
  return stripAnsi(raw).replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

// The most recent meaningful progress line a CLI prints to stderr while it works
// (e.g. codex's "thinking" / tool activity), shown so a long run doesn't look
// frozen. Skips banner separators and blank lines, and trims to one short line.
function lastProgressLine(raw: string): string {
  const lines = cleanText(raw)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^[-_=*\s]+$/.test(l))
  const last = lines[lines.length - 1] ?? ''
  return last.length > 90 ? last.slice(0, 89) + '…' : last
}

function parseParts(text: string): MessagePart[] {
  const parts: MessagePart[] = []
  const re = /```([\w+#.-]*)\r?\n?([\s\S]*?)```/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push({ type: 'text', content: text.slice(last, match.index).trim() })
    parts.push({ type: 'code', lang: match[1] || undefined, content: match[2].replace(/\n$/, '') })
    last = re.lastIndex
  }
  if (last < text.length) parts.push({ type: 'text', content: text.slice(last).trim() })
  return parts.filter((p) => p.type === 'code' || p.content.length > 0)
}

// Code fences tagged as shell commands or command output are instructions to
// run, not file contents — writing them into the open file would corrupt it, so
// they never get an Apply button and are skipped by auto-apply.
const NON_FILE_LANGS = new Set([
  'bash', 'sh', 'shell', 'zsh', 'fish', 'console', 'terminal',
  'powershell', 'pwsh', 'ps', 'ps1', 'cmd', 'bat', 'batch', 'dosbatch',
  'text', 'txt', 'plaintext', 'log', 'output', 'diff', 'patch'
])

// A line that begins with a shell tool (or a *.cmd/*.ps1 wrapper) is a command,
// not code. Catches blocks the model mislabels — e.g. `npm.cmd run lint` fenced
// as ```js — which must never be written into a source file.
const COMMAND_LINE_RE =
  /^(?:\$\s*|>\s*|PS[^>]*>\s*)?(?:npm|npx|yarn|pnpm|bun|node|deno|ts-node|tsx|git|python3?|pip3?|cargo|rustc|go|dotnet|dart|flutter|gradle|gradlew|mvn|make|cmake|cd|ls|dir|mkdir|rmdir|rm|del|copy|cp|mv|cat|type|echo|curl|wget|sudo|chmod|chown|export|set|source|brew|apt|apt-get|docker|kubectl)\b|^\.[\\/]\S+|^[\w./\\-]+\.(?:cmd|ps1|bat|sh)\b/i

/** True when every non-empty line of a block reads as a shell command. */
function looksLikeCommandBlock(content: string): boolean {
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return false
  return lines.every((l) => COMMAND_LINE_RE.test(l))
}

/** True when a code block looks like real file content the user can apply. */
function isFileCode(part: MessagePart): boolean {
  return (
    part.type === 'code' &&
    part.content.trim().length > 0 &&
    !NON_FILE_LANGS.has((part.lang ?? '').toLowerCase()) &&
    !looksLikeCommandBlock(part.content)
  )
}

// The code block most likely to be the full updated file (the largest one that
// actually looks like file content, not a shell command).
function bestCodeBlock(text: string): string | null {
  const blocks = parseParts(text).filter(isFileCode)
  if (blocks.length === 0) return null
  return blocks.reduce((a, b) => (b.content.length > a.content.length ? b : a)).content
}

// Map a file path to a Markdown fence language so the attached code reads with
// the right syntax highlighting in the model's view.
function langFromPath(path: string): string {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  const map: Record<string, string> = {
    ts: 'ts', tsx: 'tsx', js: 'js', jsx: 'jsx', dart: 'dart', py: 'python',
    rs: 'rust', go: 'go', java: 'java', kt: 'kotlin', swift: 'swift', rb: 'ruby',
    php: 'php', cs: 'csharp', cpp: 'cpp', cc: 'cpp', c: 'c', h: 'c', hpp: 'cpp',
    css: 'css', scss: 'scss', html: 'html', json: 'json', yaml: 'yaml', yml: 'yaml',
    md: 'markdown', sh: 'bash', sql: 'sql'
  }
  return map[ext] ?? ''
}

export default function ChatPanel({ active = true }: { active?: boolean }): JSX.Element {
  const models = useStore((s) => s.models)
  const applyCode = useStore((s) => s.applyCode)
  const workspace = useStore((s) => s.workspace)
  const addChatHistoryEntry = useStore((s) => s.addChatHistoryEntry)
  const chatHistory = useStore((s) => s.chatHistory)
  const clearChatHistory = useStore((s) => s.clearChatHistory)
  const toggleAddModel = useStore((s) => s.toggleAddModel)

  const [modelId, setModelId] = useState('')
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [includeFile, setIncludeFile] = useState(true)
  const [autoApply, setAutoApply] = useState(true)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [showUsage, setShowUsage] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [usage, setUsage] = useState<CliUsage | null>(null)
  const [usageLoading, setUsageLoading] = useState(false)
  const [usageError, setUsageError] = useState('')
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [progress, setProgress] = useState('')

  // The file currently open in the CODE panel on the left, if any.
  const openFile = workspace?.selectedFile
  const openPath = openFile?.relativePath ?? openFile?.path
  const openContent = workspace?.content
  const canAttach = Boolean(openPath && typeof openContent === 'string')

  const listRef = useRef<HTMLDivElement>(null)
  const modelMenuRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const stdoutRef = useRef('')
  const stderrRef = useRef('')
  const requestIdRef = useRef<string | null>(null)
  const pendingMsgRef = useRef<string | null>(null)
  const dragDepth = useRef(0)
  const activePromptRef = useRef<{
    modelId: string
    modelLabel: string
    prompt: string
  } | null>(null)
  // Mirrors `autoApply` so the (empty-deps) reply handler always sees the latest value.
  const autoApplyRef = useRef(autoApply)
  useEffect(() => {
    autoApplyRef.current = autoApply
  }, [autoApply])

  const chatModels = useMemo(
    () => models.filter((m) => baseCommand(m.command).length > 0),
    [models]
  )

  useEffect(() => {
    if (modelId || chatModels.length === 0) return
    setModelId(chatModels[0].id)
  }, [chatModels, modelId])

  const activeModel = chatModels.find((m) => m.id === modelId)
  const ready = Boolean(activeModel)
  const accent = activeModel?.accent ?? '#7c5cff'

  // Tick a "Thinking Ns" counter while a reply is in flight, so a slow model
  // (e.g. a reasoning run) clearly looks busy rather than frozen.
  useEffect(() => {
    if (!busy) {
      setElapsed(0)
      return
    }
    setElapsed(0)
    const started = Date.now()
    const t = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => window.clearInterval(t)
  }, [busy])

  useEffect(() => {
    if (!modelMenuOpen) return

    const close = (event: MouseEvent): void => {
      if (modelMenuRef.current?.contains(event.target as Node)) return
      setModelMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setModelMenuOpen(false)
    }

    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [modelMenuOpen])

  const chooseModel = (id: string): void => {
    setModelId(id)
    setModelMenuOpen(false)
  }

  // Pull the active model's local usage (plan + rate-limit windows) whenever the
  // usage view is open or the chosen model changes.
  useEffect(() => {
    if (!showUsage || !modelId) return
    let cancelled = false
    setUsageLoading(true)
    setUsageError('')
    window.api
      .getUsage(modelId)
      .then((data) => {
        if (!cancelled) setUsage(data)
      })
      .catch(() => {
        if (!cancelled) setUsageError('Could not read usage data.')
      })
      .finally(() => {
        if (!cancelled) setUsageLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [showUsage, modelId])

  // Load a saved exchange back into the view so the user can read it again or
  // keep the thread going. Cancels any in-flight reply first.
  const loadHistoryEntry = (entry: (typeof chatHistory)[number]): void => {
    if (requestIdRef.current) window.api.chatCancel(requestIdRef.current)
    pendingMsgRef.current = null
    requestIdRef.current = null
    activePromptRef.current = null
    stdoutRef.current = ''
    stderrRef.current = ''
    setBusy(false)
    setProgress('')
    setNotice(null)
    setAttachments([])
    if (chatModels.some((m) => m.id === entry.modelId)) setModelId(entry.modelId)
    setMessages(
      entry.messages.map((m) => ({ id: uid(), role: m.role, text: m.text, error: m.error }))
    )
    setShowHistory(false)
    setShowUsage(false)
  }

  const newChat = (): void => {
    if (requestIdRef.current) window.api.chatCancel(requestIdRef.current)
    pendingMsgRef.current = null
    requestIdRef.current = null
    activePromptRef.current = null
    stdoutRef.current = ''
    stderrRef.current = ''
    setMessages([])
    setAttachments([])
    setNotice(null)
    setBusy(false)
    setProgress('')
  }

  // Write the reply's code straight into the file open in the CODE tab. Reads
  // live store state because the reply handler runs from a stable subscription.
  const autoApplyReply = (text: string): void => {
    if (!autoApplyRef.current) return
    const state = useStore.getState()
    if (!state.workspace?.selectedFile) return
    const code = bestCodeBlock(text)
    if (!code) return
    void state.applyCode(code).then((r) => setNotice(`Auto-applied: ${r.message}`))
  }

  const finalize = (text: string, error: boolean, apply = true): void => {
    const msgId = pendingMsgRef.current
    if (!msgId) return
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, text, pending: false, error } : m))
    )
    pendingMsgRef.current = null
    requestIdRef.current = null
    stdoutRef.current = ''
    stderrRef.current = ''
    setBusy(false)
    setProgress('')
    const activePrompt = activePromptRef.current
    activePromptRef.current = null
    if (activePrompt && text.trim()) {
      addChatHistoryEntry({
        modelId: activePrompt.modelId,
        modelLabel: activePrompt.modelLabel,
        messages: [
          { role: 'user', text: activePrompt.prompt },
          { role: 'assistant', text, error }
        ]
      })
    }
    if (!error && apply) autoApplyReply(text)
  }

  // Subscribe once to the streamed reply; filter by the in-flight request id.
  useEffect(() => {
    const offData = window.api.onChatData((d) => {
      if (d.id !== requestIdRef.current) return
      if (d.stream === 'stdout') stdoutRef.current += d.chunk
      else {
        stderrRef.current += d.chunk
        const line = lastProgressLine(stderrRef.current)
        if (line) setProgress(line)
      }
      const live = cleanText(stdoutRef.current)
      const msgId = pendingMsgRef.current
      if (msgId && live) {
        setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, text: live } : m)))
      }
    })
    const offExit = window.api.onChatExit((e) => {
      if (e.id !== requestIdRef.current) return
      const out = cleanText(stdoutRef.current)
      if (out) {
        finalize(out, false)
        return
      }
      const err = e.error ?? cleanText(stderrRef.current)
      finalize(err || 'No response from the model.', true)
    })
    return () => {
      offData()
      offExit()
    }
  }, [])

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  // Prepend the open file so the model can "view" the code on the left. Inside a
  // project the CLI also runs in the project dir (cwd below), so it can read
  // sibling files and write changes back that Approve / the editor will pick up.
  const buildPrompt = (text: string): string => {
    if (!includeFile || !canAttach || !openPath || typeof openContent !== 'string') return text
    return [
      `Here is the file \`${openPath}\` I currently have open in my editor:`,
      '```' + langFromPath(openPath),
      openContent,
      '```',
      '',
      text
    ].join('\n')
  }

  const addAttachments = (items: ChatAttachment[]): void => {
    if (items.length === 0) return
    setAttachments((prev) => {
      const seen = new Set(prev.map((a) => a.path))
      const next = [...prev]
      for (const it of items) if (!seen.has(it.path)) next.push(it)
      return next
    })
  }

  const removeAttachment = (path: string): void => {
    setAttachments((prev) => prev.filter((a) => a.path !== path))
  }

  const pickImages = async (): Promise<void> => {
    try {
      const picked = await window.api.pickImages()
      addAttachments(picked)
    } catch (err) {
      setNotice((err as Error).message || 'Could not attach images.')
    }
  }

  // Convert dropped/pasted File objects (which carry an absolute path in Electron)
  // into attachments the model can read.
  const attachFiles = async (files: DroppedFile[]): Promise<void> => {
    const images = files.filter((f) => isImageType(f.type) || (f.path && isImagePath(f.path)))
    if (images.length === 0) return
    try {
      const built = await Promise.all(
        images.map(async (f) => {
          if (!f.path) return null
          return { path: f.path, name: f.name, dataUrl: await readAsDataUrl(f) }
        })
      )
      addAttachments(built.filter((a): a is ChatAttachment => a !== null))
    } catch {
      setNotice('Could not read the attached image.')
    }
  }

  const onPaste = (e: ReactClipboardEvent<HTMLDivElement>): void => {
    const files = Array.from(e.clipboardData.files) as DroppedFile[]
    const imageFiles = files.filter((f) => isImageType(f.type) || (f.path && isImagePath(f.path)))
    // An image file copied from the file system (e.g. in Explorer) carries a real
    // on-disk path the model can read, so attach it directly.
    if (imageFiles.length > 0 && imageFiles.every((f) => f.path)) {
      e.preventDefault()
      void attachFiles(imageFiles)
      return
    }
    // Otherwise the clipboard holds a path-less bitmap — a screenshot
    // (PrintScreen / Snipping Tool) or an image copied from another app. The paste
    // event can't give us a readable file, so persist it via main, which reads the
    // OS clipboard and writes a real PNG. Detect it from the `image/*` item even
    // when `files` is empty; bail on plain-text pastes so the textarea handles them.
    const hasClipboardImage =
      imageFiles.length > 0 ||
      Array.from(e.clipboardData.items).some((it) => it.type.startsWith('image/'))
    if (!hasClipboardImage) return
    e.preventDefault()
    void window.api
      .saveClipboardImage()
      .then((att) => {
        if (att) addAttachments([att])
        else setNotice('Could not read the pasted image from the clipboard.')
      })
      .catch((err) => setNotice((err as Error).message || 'Could not read the pasted image.'))
  }

  const onDrop = (e: ReactDragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    dragDepth.current = 0
    setDragActive(false)
    void attachFiles(Array.from(e.dataTransfer.files) as DroppedFile[])
  }

  const onDragEnter = (e: ReactDragEvent<HTMLDivElement>): void => {
    if (!Array.from(e.dataTransfer.items).some((i) => i.kind === 'file')) return
    e.preventDefault()
    dragDepth.current += 1
    setDragActive(true)
  }

  const onDragOver = (e: ReactDragEvent<HTMLDivElement>): void => {
    if (!Array.from(e.dataTransfer.items).some((i) => i.kind === 'file')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  const onDragLeave = (): void => {
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragActive(false)
  }

  const send = (): void => {
    const text = input.trim()
    if ((!text && attachments.length === 0) || busy) return
    if (!ready || !activeModel) {
      setNotice('Pick a model to chat with.')
      return
    }
    const requestId = uid()
    const assistantId = uid()
    const sentImages = attachments
    setMessages((prev) => [
      ...prev,
      { id: uid(), role: 'user', text, images: sentImages.length ? sentImages : undefined },
      { id: assistantId, role: 'assistant', text: '', pending: true }
    ])
    setInput('')
    setAttachments([])
    setNotice(null)
    setProgress('')
    stdoutRef.current = ''
    stderrRef.current = ''
    requestIdRef.current = requestId
    pendingMsgRef.current = assistantId
    activePromptRef.current = {
      modelId: activeModel.id,
      modelLabel: activeModel.label,
      prompt: text
    }
    setBusy(true)
    window.api.chatSend({
      id: requestId,
      modelId: activeModel.id,
      command: activeModel.command,
      prompt: buildPrompt(text || 'Please look at the attached image(s).'),
      cwd: workspace?.kind === 'project' ? workspace.path : undefined,
      images: sentImages.map((a) => a.path)
    })
  }

  const stop = (): void => {
    if (requestIdRef.current) window.api.chatCancel(requestIdRef.current)
    finalize(cleanText(stdoutRef.current) || 'Stopped.', false, false)
  }

  const onInputKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const approve = async (code: string): Promise<void> => {
    let suggestedName: string | undefined
    if (!workspace?.selectedFile && workspace?.kind === 'project') {
      const name = window.prompt('Save this code as (path inside the project):')
      if (!name?.trim()) return
      suggestedName = name.trim()
    }
    const result = await applyCode(code, suggestedName)
    setNotice(result.message)
  }

  const canSend = (Boolean(input.trim()) || attachments.length > 0) && ready

  return (
    <div
      className={`chatpanel${active ? '' : ' hidden'}${dragActive ? ' dragging' : ''}`}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onPaste={onPaste}
    >
      <div className="chat-conn">
        {ready ? (
          <span className="chat-model-avatar" style={{ background: accent }} aria-hidden="true">
            {(activeModel?.label ?? 'A').slice(0, 1).toUpperCase()}
          </span>
        ) : (
          <span className={`chat-dot ${ready ? 'on' : ''}`} aria-hidden="true" />
        )}
        {chatModels.length > 0 ? (
          <div className="chat-model-select" ref={modelMenuRef}>
            <button
              className={`chat-model-btn ${modelMenuOpen ? 'open' : ''}`}
              aria-haspopup="menu"
              aria-expanded={modelMenuOpen}
              aria-label="Model to chat with"
              onClick={() => setModelMenuOpen((value) => !value)}
            >
              <span>{activeModel?.label ?? 'Select model'}</span>
              <span className="select-chevron" aria-hidden="true" />
            </button>
            {modelMenuOpen && (
              <div className="chat-model-menu" role="menu">
                {chatModels.map((m) => (
                  <button
                    key={m.id}
                    className={m.id === modelId ? 'active' : ''}
                    role="menuitemradio"
                    aria-checked={m.id === modelId}
                    onClick={() => chooseModel(m.id)}
                  >
                    <span className="chat-model-dot" style={{ background: m.accent ?? '#7c5cff' }} aria-hidden="true" />
                    <span>{m.label}</span>
                    <span className="grid-menu-check" aria-hidden="true" />
                  </button>
                ))}
                <div className="chat-model-menu-sep" role="separator" />
                <button
                  className="chat-model-add"
                  role="menuitem"
                  onClick={() => {
                    setModelMenuOpen(false)
                    toggleAddModel(true)
                  }}
                >
                  <span className="chat-model-add-icon" aria-hidden="true">
                    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                      <path d="M8 3.2v9.6M3.2 8h9.6" />
                    </svg>
                  </span>
                  <span>Add model</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <span className="chat-status">No chat-capable model configured</span>
        )}
        <span className={`chat-status-pill ${busy ? 'busy' : ready ? 'ready' : ''}`}>
          {busy ? `Thinking ${elapsed}s` : ready ? 'Ready' : 'Offline'}
        </span>
        <div className="chat-conn-actions">
          <button
            className={`chat-head-btn ${showHistory ? 'active' : ''}`}
            onClick={() => {
              setShowHistory((v) => !v)
              setShowUsage(false)
            }}
            aria-pressed={showHistory}
            title="Open a past chat"
          >
            History
          </button>
          <button
            className={`chat-head-btn ${showUsage ? 'active' : ''}`}
            onClick={() => {
              setShowUsage((v) => !v)
              setShowHistory(false)
            }}
            disabled={!ready}
            aria-pressed={showUsage}
            title="View this model's plan and usage limits"
          >
            Usage
          </button>
          <button
            className="chat-head-btn"
            onClick={newChat}
            disabled={messages.length === 0 && !busy}
            title="Start a new chat"
          >
            New chat
          </button>
        </div>
      </div>

      {showUsage && ready && (
        <div className="chat-usage">
          {usageLoading ? (
            <div className="chat-usage-empty">Reading usage…</div>
          ) : usageError ? (
            <div className="chat-usage-empty">{usageError}</div>
          ) : !usage?.available ? (
            <div className="chat-usage-empty">
              No local usage data for {activeModel?.label}. Sign in to its CLI to see limits.
            </div>
          ) : (
            <>
              <div className="cu-head">
                <span className="cu-avatar" style={{ background: activeModel?.accent }}>
                  {(usage.account?.name || usage.account?.email || activeModel?.label || '?')
                    .slice(0, 1)
                    .toUpperCase()}
                </span>
                <div className="cu-id">
                  <span className="cu-name">
                    {usage.account?.name || usage.account?.email || activeModel?.label}
                  </span>
                  {(usage.account?.org || usage.source) && (
                    <span className="cu-sub">
                      {usage.account?.org ? `Team: ${usage.account.org}` : usage.source}
                    </span>
                  )}
                </div>
                {usage.account?.plan && <span className="usage-plan-pill">{usage.account.plan}</span>}
              </div>

              {usage.limits && usage.limits.length > 0 ? (
                <div className="cu-limits">
                  {usage.limits.map((l) => {
                    const pct = Math.max(0, Math.min(100, Math.round(l.usedPercent)))
                    const weekly = isWeeklyLimit(l.label, l.windowMinutes)
                    return (
                      <div className="cu-limit" key={l.label}>
                        <div className="cu-limit-row">
                          <span className="cu-limit-icon" aria-hidden="true">
                            {weekly ? (
                              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="2" y="3" width="12" height="11" rx="1.6" />
                                <path d="M2 6.5h12M5.5 2v2.5M10.5 2v2.5" />
                              </svg>
                            ) : (
                              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="8" cy="8.5" r="5.5" />
                                <path d="M8 5.5v3l2 1.3" />
                              </svg>
                            )}
                          </span>
                          <span className="cu-limit-label">{l.label}</span>
                          <span className="cu-limit-pct">{pct}%</span>
                        </div>
                        <div className="cu-limit-bar">
                          <span style={{ width: `${pct}%` }} />
                        </div>
                        {l.resetsAt && <div className="cu-limit-reset">{fmtReset(l.resetsAt)}</div>}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="chat-usage-empty">No rate-limit windows reported.</div>
              )}

              {usage.account?.trialEndsAt && (() => {
                const ends = new Date(usage.account.trialEndsAt)
                const expired = !Number.isNaN(ends.getTime()) && ends.getTime() <= Date.now()
                return (
                  <div className={`cu-term ${expired ? 'expired' : ''}`}>
                    <span className="cu-term-icon" aria-hidden="true">
                      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="3" width="12" height="11" rx="1.6" />
                        <path d="M2 6.5h12M5.5 2v2.5M10.5 2v2.5" />
                      </svg>
                    </span>
                    <span className="cu-term-label">{expired ? 'Term Expired' : 'Trial ends'}</span>
                    <span className="cu-term-date">{fmtDateTime(usage.account.trialEndsAt)}</span>
                  </div>
                )
              })()}

              {usage.note && <p className="cu-foot">{usage.note}</p>}
            </>
          )}
        </div>
      )}

      {showHistory && (
        <div className="chat-history">
          <div className="chat-history-head">
            <span>Recent chats</span>
            {chatHistory.length > 0 && (
              <button className="chat-history-clear" onClick={() => clearChatHistory()}>
                Clear all
              </button>
            )}
          </div>
          {chatHistory.length === 0 ? (
            <div className="chat-usage-empty">No past chats yet. Finished chats show up here.</div>
          ) : (
            <div className="chat-history-list">
              {[...chatHistory].reverse().map((entry) => {
                const firstUser = entry.messages.find((m) => m.role === 'user')
                const title = firstUser?.text.trim() || '(image only)'
                const dot = models.find((m) => m.id === entry.modelId)?.accent ?? '#7c5cff'
                return (
                  <button
                    key={entry.id}
                    className="chat-history-item"
                    title={title}
                    onClick={() => loadHistoryEntry(entry)}
                  >
                    <span className="chat-history-dot" style={{ background: dot }} aria-hidden="true" />
                    <span className="chat-history-main">
                      <span className="chat-history-title">{title}</span>
                      <span className="chat-history-meta">
                        {entry.modelLabel} · {relTime(entry.createdAt)}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      <div className="chat-messages" ref={listRef}>
        {messages.length === 0 ? (
          <div className="chat-empty">
            <span className="chat-empty-glyph" aria-hidden="true">✦</span>
            <p className="chat-empty-title">Ask {activeModel?.label ?? 'the model'} anything</p>
            <p className="chat-empty-sub">
              With <strong>Write code to open file</strong> on, replies are written straight into the
              file open in the CODE tab; otherwise use <strong>Approve</strong> on a code block. Drop,
              paste, or attach an image to send it to the model.
              {workspace?.kind === 'project' && (
                <>
                  {' '}
                  Running in <code>{workspace.name}</code>.
                </>
              )}
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === 'user'
            const name = isUser ? 'You' : activeModel?.label ?? 'AI'
            const avatarColor = isUser ? '#7c5cff' : activeModel?.accent ?? '#7c5cff'
            return (
              <div key={msg.id} className={`chat-msg ${msg.role}`}>
                <span className="chat-avatar" style={{ background: avatarColor }} aria-hidden="true">
                  {name.slice(0, 1).toUpperCase()}
                </span>
                <div className="chat-bubble-wrap">
                  <div className="chat-role">{name}</div>
                  {msg.images && msg.images.length > 0 && (
                    <div className="chat-msg-images">
                      {msg.images.map((img) => (
                        <img key={img.path} src={img.dataUrl} alt={img.name} title={img.name} />
                      ))}
                    </div>
                  )}
                  {msg.pending && !msg.text ? (
                    <div className="chat-bubble pending">
                      <span className="chat-typing">
                        <i />
                        <i />
                        <i />
                      </span>
                      {progress && <span className="chat-progress">{progress}</span>}
                    </div>
                  ) : msg.error ? (
                    <div className="chat-bubble error">
                      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                        <circle cx="8" cy="8" r="6.25" />
                        <path d="M8 5v3.5M8 10.6v.1" />
                      </svg>
                      <span>{msg.text}</span>
                    </div>
                  ) : msg.text ? (
                    parseParts(msg.text).map((part, i) =>
                      part.type === 'code' ? (
                        <div className="chat-code" key={i}>
                          <div className="chat-code-head">
                            <span className="chat-code-lang">{part.lang ?? 'code'}</span>
                            {isFileCode(part) && (
                              <button className="chat-approve" onClick={() => void approve(part.content)}>
                                {autoApply && canAttach ? 'Re-apply' : 'Approve'}
                              </button>
                            )}
                          </div>
                          <pre>{part.content}</pre>
                        </div>
                      ) : (
                        <div className="chat-bubble" key={i}>
                          {part.content}
                        </div>
                      )
                    )
                  ) : null}
                </div>
              </div>
            )
          })
        )}
      </div>

      {notice && <div className="chat-notice">{notice}</div>}

      <div className="chat-input">
        <div className="chat-toggles">
          <label
            className={`chat-attach${canAttach ? '' : ' disabled'}`}
            title={
              canAttach
                ? `Send \`${openPath}\` as context so the AI can view it`
                : 'Open a file in the CODE tab to let the AI view it'
            }
          >
            <input
              type="checkbox"
              checked={includeFile && canAttach}
              disabled={!canAttach}
              onChange={(e) => setIncludeFile(e.target.checked)}
            />
            <span>{canAttach && openPath ? `Attach open file (${openPath})` : 'Attach open file'}</span>
          </label>
          <label
            className={`chat-attach${canAttach ? '' : ' disabled'}`}
            title={
              canAttach
                ? `Write the AI's code straight into ${openPath}`
                : 'Open a file in the CODE tab to write the AI code into it'
            }
          >
            <input
              type="checkbox"
              checked={autoApply && canAttach}
              disabled={!canAttach}
              onChange={(e) => setAutoApply(e.target.checked)}
            />
            <span>Write code to open file</span>
          </label>
        </div>

        {attachments.length > 0 && (
          <div className="chat-attachments">
            {attachments.map((att) => (
              <div className="chat-attach-chip" key={att.path} title={att.name}>
                <img src={att.dataUrl} alt={att.name} />
                <span className="chat-attach-name">{att.name}</span>
                <button
                  className="chat-attach-remove"
                  onClick={() => removeAttachment(att.path)}
                  aria-label={`Remove ${att.name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="chat-composer">
          <button
            className="chat-img-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={!ready}
            title="Attach image(s) to send to the model"
            aria-label="Attach image"
          >
            <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2.75" y="3.75" width="14.5" height="12.5" rx="2.5" />
              <circle cx="7" cy="8" r="1.4" />
              <path d="M3.5 14.5 7.8 10.5l2.7 2.4 3-3.2 3 3.3" />
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []) as DroppedFile[]
              // The file picker's File objects may lack `.path`; fall back to the
              // main-process dialog picker which returns absolute paths.
              if (files.some((f) => !f.path)) void pickImages()
              else void attachFiles(files)
              e.target.value = ''
            }}
          />
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder={ready ? 'Ask the model to build or fix something…' : 'Select a model to start chatting'}
            rows={2}
          />
          {busy ? (
            <button className="chat-finish" onClick={stop} title="Stop the model">
              <svg viewBox="0 0 14 14" width="11" height="11" aria-hidden="true">
                <rect x="2" y="2" width="10" height="10" rx="2" fill="currentColor" />
              </svg>
              <span>Stop</span>
            </button>
          ) : (
            <button className="chat-send" onClick={send} disabled={!canSend} title="Send (Enter)">
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3.5 10h12M10 4.5 15.5 10 10 15.5" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {dragActive && (
        <div className="chat-drop-overlay" aria-hidden="true">
          <div className="chat-drop-card">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="3" />
              <circle cx="8.5" cy="9.5" r="1.6" />
              <path d="M4 17l5-5 3.5 3 4-4.5L20 15" />
            </svg>
            <span>Drop image to attach</span>
          </div>
        </div>
      )}
    </div>
  )
}
