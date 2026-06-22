# GenNal — Download Website

Static landing/download site for the GenNal multi-model AI cockpit. No build step,
no dependencies — plain HTML/CSS.

## Files
```
website/
├─ index.html        landing page (hero, features, models, requirements, download)
├─ styles.css        dark theme matching the app brand
├─ vercel.json       static-site config (clean URLs + asset caching)
└─ downloads/        local-only installer drop (gitignored — see below)
```

## Where the installers are hosted
- **Windows (`.exe`)** is **self-hosted** from this site at
  `/downloads/GenNal-Setup-1.0.8.exe`. The current release `.exe` is committed
  (the `.gitignore` allows only that one file) so it ships inside the Docker
  build context. Older `.exe`s stay ignored.
- **macOS (`.dmg`)** is built on CI (`.github/workflows/release-mac.yml`,
  macOS runner) and uploaded to the matching **GitHub Release**. The download
  buttons point at:
  ```
  https://github.com/Gen-Group/GenNal/releases/download/v1.0.8/GenNal-1.0.8-arm64.dmg
  https://github.com/Gen-Group/GenNal/releases/download/v1.0.8/GenNal-1.0.8-x64.dmg
  ```

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
1. Build the installer: `npm run dist:win` (from repo root) → `dist/GenNal-Setup-<ver>.exe`
2. Create/upload it to a GitHub Release: `gh release create v<ver> dist/GenNal-Setup-<ver>.exe`
3. Update the two download `href`s and the `v<ver>` label in `index.html`
4. Push — Vercel redeploys automatically.
