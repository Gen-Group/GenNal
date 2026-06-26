# GenNal — Download Website

Static landing/download site for the GenNal multi-model AI cockpit. No build step,
no dependencies — plain HTML/CSS.

## Files
```
website/
├─ index.html        landing page (3D hero, stats, features, how-it-works, layouts, models, use-cases, requirements, FAQ, download)
├─ styles.css        dark 3D theme matching the app brand (pointer-tilt, parallax orbs, scroll-reveal)
├─ vercel.json       static-site config (clean URLs + asset caching)
└─ downloads/        installer drop (gitignored except current release files)
```

## Where the installers are hosted
- **Windows (`.exe`)** is self-hosted from this site at
  `/downloads/GenNal-Setup-1.0.11.exe`.
- **macOS (`.dmg`)** is self-hosted from this site at:
  ```
  /downloads/GenNal-1.0.11-arm64.dmg
  /downloads/GenNal-1.0.11-x64.dmg
  ```
The `.gitignore` allowlist keeps only the current release installers committed
so they ship inside the Docker/Vercel build context. Older installers stay
ignored.

## Preview locally
```powershell
cd E:\GenNal\website
npx serve .          # or just open index.html in a browser
```

## Deploy on Vercel
Because this site lives in a subfolder of the Electron app repo, point Vercel at
the `website/` folder so it doesn't try to build the desktop app:

1. **Import** `Gen-Group/GenNal` at https://vercel.com/new
2. In project settings set **Root Directory = `website`**
3. **Framework Preset = Other**, leave Build Command and Output blank
   (`vercel.json` handles clean URLs and caching — there's nothing to build)
4. Deploy.

Or via CLI:
```powershell
cd E:\GenNal\website
npx vercel            # preview deploy
npx vercel --prod     # production deploy
```

## Cutting a new version
1. Build the installers from repo root:
   - Windows: `npm run dist:win` -> `dist/GenNal-Setup-<ver>.exe`
   - macOS: `npm run dist:mac` -> `dist/GenNal-<ver>-arm64.dmg` and `dist/GenNal-<ver>-x64.dmg`
2. Copy the current installer files into `website/downloads/`.
3. Update the download `href`s, the `v<ver>` label in `index.html`, and the
   `.gitignore` allowlist.
4. Push — Vercel redeploys automatically.
