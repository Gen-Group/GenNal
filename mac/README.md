# GenNal — macOS install

macOS builds **must be made on a Mac** — GenNal uses the native `node-pty` module
(compiled per-OS) and `.dmg` packaging relies on macOS-only tools. Neither can be
produced on Windows, which is why the release page only ships the Windows `.exe`.

## Option A — one command (build + install)

On a Mac with [Node.js 20+](https://nodejs.org) and `git` installed:

```bash
git clone https://github.com/Gen-Group/GenNal.git
cd GenNal
bash mac/install.sh
```

This installs **GenNal.app** into `/Applications` and also leaves the distributable
installers in `dist/`:

- `GenNal-1.0.4-arm64.dmg` — Apple Silicon (M1/M2/M3/M4)
- `GenNal-1.0.4-x64.dmg` — Intel

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

## Publishing the `.dmg` to the GitHub release

After building on a Mac, attach the installers to the release so others can download them:

```bash
gh release upload v1.0.4 dist/GenNal-1.0.4-arm64.dmg dist/GenNal-1.0.4-x64.dmg
```
