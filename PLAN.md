# GenNal — Multi-Model AI Cockpit · Build Plan

A Windows desktop **.exe** to launch, run, and manage **Codex, Claude, and Gemini
simultaneously**, each in its own live pane, with shared code context and a unified
assistant. Layout is based on the "DevTerm Pro" screenshot (terminals → AI model sessions).

> **STATUS: BUILT.** Phases 1–7 and 9 are implemented in this repo. Run `npm install`,
> `npm run rebuild` (native node-pty), then `npm run dev`. Package with `npm run dist:win`
> (Phase 8). The checkboxes below are marked to reflect what's done.

## What exists now
- `package.json`, `electron.vite.config.ts`, `tsconfig.json`, `electron-builder.yml` — toolchain.
- `src/main/` — Electron main: window, `pty-manager`, `model-registry`, `stats-service`, IPC.
- `src/preload/` — typed `window.api` contextBridge.
- `src/renderer/` — React UI: TitleBar, Sidebar, LayoutToolbar, PaneGrid, ModelPane (xterm),
  RightPanel (code + assistant), StatusBar, BottomDock, CommandPalette, Zustand store.
- `website/` — download landing page (Phase 9).
- `models.json` — Claude / Codex / Gemini / Shell registry.

---

## 0. Decisions (already made — change only if you want)

- **Model engine:** each model runs as a real OS process driving its official CLI
  (`claude`, `codex`, `gemini`) inside a PTY pane — NOT direct API calls.
  - Cheapest on a laptop, no API keys, reuses vendors' own agents, truly simultaneous.
- **Shell:** Electron (rich Monaco/xterm stack is easier than Tauri here).
- **Model registry is data, not code:** adding a model = one entry in `models.json`.

Alternatives if you change your mind later: Tauri (smaller .exe, Rust), or direct-API panes.

---

## 1. Tech stack

| Layer      | Choice                          | Purpose                                  |
|------------|---------------------------------|------------------------------------------|
| Shell      | Electron                        | Native window, packages to one `.exe`    |
| UI         | React + TypeScript + Vite       | Typed, fast, component-heavy layout      |
| Terminals  | xterm.js + node-pty             | Real PTY per pane (color/resize/interactive) |
| Editor     | Monaco                          | Code panel with minimap/syntax           |
| Layout     | react-mosaic (or Allotment)     | Grid / Tabs / Stack / Float split modes  |
| State      | Zustand                         | workspaces / sessions / layout store     |
| Styling    | Tailwind CSS                    | Dark theme, accent dots, chips           |
| Stats      | systeminformation               | CPU / Memory sparklines                  |
| Packaging  | electron-builder                | Produces Windows and macOS installers    |

---

## 2. Process architecture

```
┌────────────── Main process (Node) ──────────────┐
│  PtyManager     spawn/kill node-pty per session  │
│  ModelRegistry  load/validate models.json        │
│  WorkspaceStore persist workspaces+sessions       │
│  StatsService   systeminformation → 1Hz stream    │
│  FsBridge       read/write file open in Monaco    │
└───────────────────────┬──────────────────────────┘
              IPC (typed, contextBridge)
┌───────────────────────┴──────────────────────────┐
│  Renderer (React)                                 │
│   TitleBar · Sidebar · PaneGrid · CodePanel ·     │
│   AssistantPanel · StatusBar · BottomDock · ⌘K    │
└───────────────────────────────────────────────────┘
```

Security: `contextIsolation: true`, `nodeIntegration: false`, all PTY/FS access through a
typed `preload` bridge. No raw Node in the renderer.

---

## 3. Screenshot → component map

- **Top bar** → `TitleBar`: logo, ⌘K Quick command, workspace switcher,
  **+ New Model Session**, settings, window min/max/close.
- **Left sidebar** → `Sidebar`:
  - `WorkspaceList` (Main / Workspace 2 / Workspace 3, with running-count badges)
  - `SessionList` → **Model Sessions** w/ status dots 🟢 Running / 🔴 Stopped
  - `SystemOverview` → N Models Active, Memory, CPU sparklines
  - `QuickActions` → New Session (Ctrl+N), Command Palette (Ctrl+Shift+P)
- **Center** → `LayoutToolbar` (Grid/Tabs/Stack/Float, Rows×Cols) + `PaneGrid` of
  `ModelPane`. Pane header: status dot, model name, model-type tag, controls
  (**+ new, split, duplicate, kill, ⋮**).
- **Right top** → `CodePanel`: CODE/OUTPUT/TERMINAL/PROBLEMS tabs, Monaco, **Run**.
- **Right bottom** → `AssistantPanel` (GenNal): Chat/Explain/Refactor/Code Review/Generate,
  quick-action chips, model selector, context (file) selector.
- **Bottom** → `StatusBar` (workspace, layout, encoding, active model, Ln/Col, issues,
  CPU, mem, version) + `BottomDock` (New / Split H / Split V / Close / Maximize / View Code / Layouts).

---

## 4. Data model

```ts
interface ModelDef {            // models.json entry
  id: string                    // 'claude' | 'codex' | 'gemini' | custom
  label: string
  tag: string                   // shown where "powershell" was
  command: string               // executable
  args: string[]
  env?: Record<string, string>
  accent: string                // dot/border color
}

interface ModelSession {
  id: string
  modelId: string
  paneId: string
  status: 'idle' | 'running' | 'stopped' | 'error'
  ptyPid: number
  cwd: string                   // shared workspace root by default
}

interface Workspace {
  id: string
  name: string
  rootPath: string
  sessions: ModelSession[]
  layout: 'grid' | 'tabs' | 'stack' | 'float'
}
```

`models.json` (ship with these, user-editable in Settings):

```json
[
  { "id": "claude", "label": "Claude", "tag": "claude-code", "command": "claude", "args": [], "accent": "#D97757" },
  { "id": "codex",  "label": "Codex",  "tag": "codex-cli",   "command": "codex",  "args": [], "accent": "#10A37F" },
  { "id": "gemini", "label": "Gemini", "tag": "gemini-cli",  "command": "gemini", "args": [], "accent": "#4285F4" },
  { "id": "custom", "label": "Custom", "tag": "shell",       "command": "pwsh",   "args": [], "accent": "#A78BFA" }
]
```

---

## 5. Project structure

```
GenNal/                          (electron-vite layout — as built)
├─ src/
│  ├─ shared/types.ts            shared IPC types
│  ├─ main/                      Electron main process
│  │  ├─ index.ts                window, IPC wiring, lifecycle
│  │  ├─ pty-manager.ts          node-pty spawn/write/resize/kill
│  │  ├─ model-registry.ts       load models.json (+ userData override)
│  │  └─ stats-service.ts        systeminformation 1.5s stream
│  ├─ preload/index.ts           typed window.api contextBridge
│  └─ renderer/
│     ├─ index.html
│     └─ src/
│        ├─ App.tsx  main.tsx  store.ts  styles.css  env.d.ts
│        └─ components/  TitleBar Sidebar LayoutToolbar PaneGrid
│           ModelPane RightPanel StatusBar BottomDock
│           CommandPalette ModelMenu
├─ website/                      download landing page (Phase 9)
├─ models.json                   model registry
├─ electron.vite.config.ts
├─ electron-builder.yml
└─ package.json
```

---

## 6. Implementation phases (do in order; each ends runnable)

### Phase 1 — Scaffold ☑
- `npm create vite@latest` (React + TS), add Electron + `electron-vite`.
- Frameless `BrowserWindow`, custom `TitleBar` with working min/max/close.
- Tailwind set up, dark theme tokens matching the screenshot.
- **Done when:** `npm run dev` opens the window with title bar + empty dark shell.

### Phase 2 — One live pane ☑
- Add `node-pty` + `xterm.js`. `PtyManager.spawn()` in main, IPC to renderer.
- `ModelPane` renders an xterm bound to a PTY running `pwsh`.
- Handle write, `onData`, resize (fit addon), kill on unmount.
- **Done when:** you can type in a real PowerShell inside the app.

### Phase 3 — Model launcher ☑
- `model-registry.ts` loads `models.json`.
- "New Model Session" menu lists models; selecting one spawns its `command`.
- Pane header shows model label + tag + accent dot; status reflects PTY alive/dead.
- **Done when:** you can launch `claude`, `codex`, or `gemini` in a pane.

### Phase 4 — Grid + layout modes ☑
- Integrate `react-mosaic`. Toolbar: Grid / Tabs / Stack / Float + Rows×Cols.
- Pane controls: new, split H/V, duplicate, kill, maximize.
- **Done when:** 2×2 grid of independent model sessions, splittable.

### Phase 5 — Sidebar + stats ☑
- `WorkspaceList`, `SessionList` (live status dots), `SystemOverview`
  (N models active, Memory, CPU) fed by `stats-service.ts`.
- `QuickActions`. Persist workspaces/sessions to disk (`WorkspaceStore`).
- **Done when:** sidebar mirrors live state; restart restores workspaces.

### Phase 6 — Code panel + assistant shell ☑
- Monaco in `CodePanel` (CODE/OUTPUT/TERMINAL/PROBLEMS tabs, Run button).
- `AssistantPanel` UI (tabs, chips, model + context selectors). Wire to a model later.
- **Done when:** open/edit a file in Monaco; assistant panel renders.

### Phase 7 — Polish + power features ☑
- `CommandPalette` (Ctrl+K / Ctrl+Shift+P).
- **Broadcast mode:** type one prompt → send to all selected panes (compare models).
- `StatusBar` + `BottomDock` fully wired.
- Optional: per-pane resource cap via Windows Job Objects.
- **Done when:** keyboard-driven, broadcast works across panes.

### Phase 8 — Package installers ☐
- `electron-builder.yml` → NSIS, DMG, AppImage/deb/snap targets, app icon, productName "GenNal".
- `npm run dist:win` → `dist/GenNal-Setup-1.0.11.exe`.
- `npm run dist:mac` → `dist/GenNal-1.0.11-arm64.dmg` and `dist/GenNal-1.0.11-x64.dmg`.
- Optional: auto-update feed.
- **Done when:** the installers run on clean Windows and macOS machines.

### Phase 9 — Download website ☑ (scaffolded)
- `website/index.html` + `website/styles.css` — dark landing page (hero, features,
  models, requirements, download band). No build step, plain HTML/CSS.
- Download buttons point to the current release files in `website/downloads/`.
- **To finish:** copy the Phase 8 installers into `website/downloads/`, update the
  versioned links/allowlist, then deploy `website/` to GitHub Pages / Netlify /
  Vercel / Cloudflare Pages. See `website/README.md`.
- **Done when:** visitors can download working Windows and macOS installers from the live URL.

---

## 7. Key risks / notes

- **node-pty is native** → needs `electron-rebuild` (rebuild against Electron's Node ABI).
- **CLIs must be on PATH** → at launch, probe each `command`; if missing, show
  "Install / set path" in the model's pane instead of a crash.
- **Resource use** → 3 agentic CLIs at once can spike CPU/RAM; the System Overview is
  not decorative — surface it, and consider the optional per-pane cap.
- **Windows shells** → default custom slot to `pwsh`; fall back to `powershell.exe`.

---

## 8. First commands to run (Phase 1 start)

```powershell
cd E:\GenNal
npm create vite@latest . -- --template react-ts
npm install
npm install -D electron electron-builder electron-vite concurrently
npm install node-pty @xterm/xterm @xterm/addon-fit zustand systeminformation
npm install react-mosaic-component monaco-editor @monaco-editor/react
npm install -D tailwindcss postcss autoprefixer && npx tailwindcss init -p
```

Then wire `electron-vite` and add the frameless window (Phase 1).

---

*When you're ready, open this file and start at Phase 1 — or tell me "build Phase N"
and I'll write that code.*
