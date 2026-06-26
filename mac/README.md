# GenNal — macOS install

macOS builds **must be made on a Mac** — GenNal uses the native `node-pty` module
(compiled per-OS) and `.dmg` packaging relies on macOS-only tools.

## Option A — one command (build + install)

On a Mac with [Node.js 20+](https://nodejs.org) and `git` installed:

```bash
git clone https://github.com/Gen-Group/GenNal.git
cd GenNal
bash mac/install.sh
```

This installs **GenNal.app** into `/Applications` and also leaves the distributable
installers in `dist/`:

- `GenNal-1.0.11-arm64.dmg` — Apple Silicon (M1/M2/M3/M4)
- `GenNal-1.0.11-x64.dmg` — Intel

## Option B — build the `.dmg` only

```bash
npm install
npm run dist:mac
```

Then open the `.dmg` matching your Mac and drag **GenNal** into **Applications**.

## First launch (unsigned build)

The build is unsigned, so the first time macOS will warn you. Either:

- **Right-click GenNal → Open → Open**, or
- run once: `xattr -cr /Applications/GenNal.app`

(`mac/install.sh` clears this automatically.)

## Publishing the `.dmg`

After building on a Mac, copy the installers into the website download folder so
the Download buttons can serve them:

```bash
cp dist/GenNal-1.0.11-arm64.dmg website/downloads/
cp dist/GenNal-1.0.11-x64.dmg website/downloads/
```
