# GenNal — Multi-Model AI Cockpit

A Windows desktop app to **launch, run, and manage Codex, Claude & Gemini simultaneously**,
each in its own live terminal pane, with a shared code view and an AI assistant panel.

![status](https://img.shields.io/badge/status-built-7c5cff) ![platform](https://img.shields.io/badge/platform-Windows-4285f4)

## Quick start (dev)

```powershell
cd E:\GenNal
npm install            # installs deps
npm run dev            # launch the app with hot reload
```

> `node-pty` 1.0 ships **N-API prebuilt binaries** (`prebuilds/win32-x64`), so no compiler
> is needed — verified booting on this machine. Only if you ever hit a native load error on
> an unusual arch should you run `npm run rebuild` (that path needs Visual Studio C++ build
> tools: "Desktop development with C++").

## Build the .exe

```powershell
npm run dist:win       # → dist/GenNal-Setup-1.0.0.exe  (NSIS installer)
```

Then publish it on the website:

```powershell
Copy-Item dist\GenNal-Setup-1.0.0.exe website\downloads\GenNal-Setup.exe
```

## What it does

- **Model launcher** — `+ New Session` / `+ New Model` spawns Claude, Codex, Gemini, or a
  plain shell in a new pane. Models are defined in `models.json` (data, not code).
- **Live panes** — each pane is a real PTY (PowerShell) running the model's CLI, with full
  color, interactive prompts, restart, and close.
- **Layouts** — Grid (Rows×Cols), Tabs, Stack, Float via the toolbar / bottom dock.
- **Sidebar** — workspaces, live model-session list with status dots, and a System Overview
  (active models, memory, CPU) fed by live `systeminformation` stats.
- **Right panel** — a code view (CODE/OUTPUT/TERMINAL/PROBLEMS) + the GenNal AI assistant UI.
- **Command palette** — `Ctrl+K` to launch models / switch layouts.

## Architecture

- **Main** (`src/main`): `BrowserWindow` (frameless), `pty-manager` (node-pty),
  `model-registry`, `stats-service`, IPC.
- **Preload** (`src/preload`): typed `window.api` over `contextBridge` —
  `contextIsolation: true`, `nodeIntegration: false`.
- **Renderer** (`src/renderer`): React + Zustand + xterm.js.

See `PLAN.md` for the full build plan and phase status, and `website/README.md` for the
download site.

## Adding a model

Edit `models.json` (or drop a `models.json` in the app's userData dir to override):

```json
{ "id": "aider", "label": "Aider", "tag": "aider-cli", "command": "aider", "accent": "#34d399" }
```
