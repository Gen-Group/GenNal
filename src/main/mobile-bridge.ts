import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import { networkInterfaces } from 'os'
import { randomBytes } from 'crypto'
import { startChat, cancelChat, type ChatSink } from './chat-manager'
import { writeSession, addPtyListeners, listSessionIds } from './pty-manager'
import { loadModels } from './model-registry'
import type { MobileContext, MobileStatus } from '../shared/types'
import { MOBILE_CLIENT_HTML } from './mobile-client'

// Preferred port for the LAN bridge. If it's taken we fall back to an
// OS-assigned ephemeral port so a second window (or a leftover process) can't
// block the feature.
const PREFERRED_PORT = 8765

interface BridgeState {
  server: Server
  token: string
  host: string
  /** Every LAN address the server is reachable on, best guess first. */
  addresses: string[]
  port: number
  /** Open Server-Sent-Events connections streaming chat replies to phones. */
  chatStreams: Set<ServerResponse>
  /** Open SSE connections streaming terminal output to phones. */
  ptyStreams: Set<ServerResponse>
  detachPty: () => void
  heartbeat: NodeJS.Timeout
}

let state: BridgeState | null = null

// Live desktop context (open project dir + terminal panes) pushed from the
// renderer. The phone reads this so its chat runs in the right folder and its
// terminal tab lists the same panes the desktop shows.
let context: MobileContext = { panes: [] }

export function setMobileContext(next: MobileContext): void {
  context = { cwd: next.cwd, panes: Array.isArray(next.panes) ? next.panes : [] }
}

// Virtual adapters (VirtualBox/VMware host-only nets, Hyper-V/WSL "vEthernet",
// Docker bridges) hand out private IPv4s in the same ranges as real Wi-Fi, but a
// phone can't route to them — so the QR pointing at one just times out. Match
// them by interface name and push them to the back of the list.
const VIRTUAL_IFACE =
  /\b(virtual|vmware|vbox|virtualbox|hyper-?v|vethernet|wsl|docker|loopback|default switch|tailscale|zerotier|tunnel|tap)\b/i

// Collect every LAN-reachable IPv4 address, best candidate first. A phone can
// only reach the desktop over a real network address, never 127.0.0.1, so prefer
// physical adapters and the private ranges home/office networks hand out.
function lanAddresses(): string[] {
  const candidates: { ip: string; virtual: boolean }[] = []
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    const virtual = VIRTUAL_IFACE.test(name)
    for (const addr of addrs ?? []) {
      if (addr.family !== 'IPv4' || addr.internal) continue
      candidates.push({ ip: addr.address, virtual })
    }
  }
  const rangeRank = (ip: string): number =>
    ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : ip.startsWith('172.') ? 2 : 3
  candidates.sort((a, b) => {
    // Real adapters always beat virtual ones, then sort by private-range order.
    if (a.virtual !== b.virtual) return a.virtual ? 1 : -1
    return rangeRank(a.ip) - rangeRank(b.ip)
  })
  return candidates.map((c) => c.ip)
}

function statusFrom(s: BridgeState): MobileStatus {
  const base = `http://${s.host}:${s.port}`
  return {
    running: true,
    host: s.host,
    addresses: s.addresses,
    port: s.port,
    token: s.token,
    url: `${base}/?t=${s.token}`,
    displayUrl: base
  }
}

export function mobileStatus(): MobileStatus {
  return state ? statusFrom(state) : { running: false }
}

// ---- request helpers -------------------------------------------------------

function tokenOf(req: IncomingMessage): string {
  const url = new URL(req.url ?? '/', 'http://local')
  return url.searchParams.get('t') ?? (req.headers['x-gennal-token'] as string) ?? ''
}

function authed(req: IncomingMessage): boolean {
  return Boolean(state) && tokenOf(req) === state!.token
}

function sendJson(res: ServerResponse, code: number, body: unknown): void {
  const text = JSON.stringify(body)
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  })
  res.end(text)
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 1_000_000) req.destroy() // guard against absurd payloads
    })
    req.on('end', () => {
      try {
        resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {})
      } catch {
        resolve({})
      }
    })
    req.on('error', () => resolve({}))
  })
}

// Open an SSE connection: stream events until the client disconnects.
function openStream(res: ServerResponse, pool: Set<ServerResponse>): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive'
  })
  res.write(': connected\n\n')
  pool.add(res)
  res.on('close', () => pool.delete(res))
}

function broadcast(pool: Set<ServerResponse>, event: string, data: unknown): void {
  const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of pool) {
    try {
      res.write(frame)
    } catch {
      pool.delete(res)
    }
  }
}

// ---- routing ---------------------------------------------------------------

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', 'http://local')
  const path = url.pathname

  if (!authed(req)) {
    if (path === '/' || path === '') {
      res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end('<h1>GenNal Mobile</h1><p>Invalid or missing pairing token. Scan the QR code again from the desktop app.</p>')
      return
    }
    sendJson(res, 403, { error: 'unauthorized' })
    return
  }

  // The phone's single-page app.
  if (req.method === 'GET' && (path === '/' || path === '')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(MOBILE_CLIENT_HTML)
    return
  }

  // Everything the phone needs on load: available models + current context.
  if (req.method === 'GET' && path === '/api/bootstrap') {
    const models = loadModels()
      .filter((m) => m.command.trim().length > 0)
      .map((m) => ({ id: m.id, label: m.label, tag: m.tag, accent: m.accent }))
    sendJson(res, 200, { models, context, panes: knownPanes() })
    return
  }

  // Chat reply stream (one persistent connection per phone; events carry the id
  // of the message they belong to so the client can match them up).
  if (req.method === 'GET' && path === '/api/chat/stream') {
    openStream(res, state!.chatStreams)
    return
  }

  if (req.method === 'POST' && path === '/api/chat') {
    void startChatFromPhone(req, res)
    return
  }

  if (req.method === 'POST' && path === '/api/chat/cancel') {
    void readBody(req).then((body) => {
      const id = typeof body.id === 'string' ? body.id : ''
      if (id) cancelChat(id)
      sendJson(res, 200, { ok: true })
    })
    return
  }

  // Terminal mirroring.
  if (req.method === 'GET' && path === '/api/pty/stream') {
    openStream(res, state!.ptyStreams)
    return
  }

  if (req.method === 'POST' && path === '/api/pty/input') {
    void readBody(req).then((body) => {
      const id = typeof body.id === 'string' ? body.id : ''
      const data = typeof body.data === 'string' ? body.data : ''
      if (id && data) writeSession(id, data)
      sendJson(res, 200, { ok: true })
    })
    return
  }

  sendJson(res, 404, { error: 'not found' })
}

// Only expose panes the desktop reported that still have a live session, so the
// phone never lists a terminal that has since closed.
function knownPanes(): MobileContext['panes'] {
  const live = new Set(listSessionIds())
  return context.panes.filter((p) => live.has(p.id))
}

async function startChatFromPhone(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readBody(req)
  const id = typeof body.id === 'string' ? body.id : ''
  const modelId = typeof body.modelId === 'string' ? body.modelId : ''
  const prompt = typeof body.prompt === 'string' ? body.prompt : ''
  if (!id || !prompt) {
    sendJson(res, 400, { error: 'id and prompt are required' })
    return
  }
  // Resolve the command server-side from the model registry — the phone never
  // gets to specify an arbitrary command to run.
  const model = loadModels().find((m) => m.id === modelId)
  if (!model || !model.command.trim()) {
    sendJson(res, 400, { error: 'unknown model' })
    return
  }

  const sink: ChatSink = (channel, payload) => {
    broadcast(state!.chatStreams, channel === 'chat:exit' ? 'exit' : 'data', payload)
  }
  startChat(sink, {
    id,
    modelId: model.id,
    command: model.command,
    prompt,
    cwd: context.cwd
  })
  sendJson(res, 202, { ok: true })
}

// ---- lifecycle -------------------------------------------------------------

function listen(server: Server, port: number, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException): void => {
      server.off('listening', onListening)
      reject(err)
    }
    const onListening = (): void => {
      server.off('error', onError)
      const addr = server.address()
      resolve(typeof addr === 'object' && addr ? addr.port : port)
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, host)
  })
}

export async function startMobileBridge(): Promise<MobileStatus> {
  if (state) return statusFrom(state)

  const addresses = lanAddresses()
  const host = addresses[0]
  if (!host) {
    return {
      running: false,
      error: 'No local network connection found. Connect this computer to Wi-Fi or Ethernet, then try again.'
    }
  }

  const token = randomBytes(16).toString('hex')
  const server = createServer((req, res) => {
    try {
      handleRequest(req, res)
    } catch {
      if (!res.headersSent) sendJson(res, 500, { error: 'internal error' })
    }
  })
  // Phones hold SSE connections open indefinitely; don't let Node time them out.
  server.timeout = 0

  let port: number
  try {
    port = await listen(server, PREFERRED_PORT, '0.0.0.0')
  } catch {
    try {
      port = await listen(server, 0, '0.0.0.0') // 0 → ephemeral free port
    } catch (err) {
      return { running: false, error: `Could not start the mobile server: ${(err as Error).message}` }
    }
  }

  const chatStreams = new Set<ServerResponse>()
  const ptyStreams = new Set<ServerResponse>()

  // Mirror every terminal pane's output/exit to connected phones.
  const detachPty = addPtyListeners(
    (id, data) => broadcast(ptyStreams, 'data', { id, data }),
    (id, code) => broadcast(ptyStreams, 'exit', { id, code })
  )

  // Keep SSE connections from being dropped by intermediaries during idle gaps.
  const heartbeat = setInterval(() => {
    for (const res of [...chatStreams, ...ptyStreams]) {
      try {
        res.write(': ping\n\n')
      } catch {
        chatStreams.delete(res)
        ptyStreams.delete(res)
      }
    }
  }, 25_000)

  state = { server, token, host, addresses, port, chatStreams, ptyStreams, detachPty, heartbeat }
  return statusFrom(state)
}

export function stopMobileBridge(): MobileStatus {
  if (!state) return { running: false }
  const s = state
  state = null
  clearInterval(s.heartbeat)
  s.detachPty()
  for (const res of [...s.chatStreams, ...s.ptyStreams]) {
    try {
      res.end()
    } catch {
      /* already closed */
    }
  }
  s.chatStreams.clear()
  s.ptyStreams.clear()
  try {
    s.server.close()
  } catch {
    /* already closing */
  }
  return { running: false }
}
