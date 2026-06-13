# GenNal — Download Website

Static landing/download site for the GenNal multi-model AI cockpit. No build step,
no dependencies — plain HTML/CSS.

## Files
```
website/
├─ index.html        landing page (hero, features, models, requirements, download)
├─ styles.css        dark theme matching the app brand
└─ downloads/
   └─ GanNal-Setup.exe   ← drop the built installer here (see downloads/README.txt)
```

## Preview locally
```powershell
cd E:\GenNal\website
# any static server, e.g.:
npx serve .
# or just open index.html in a browser
```

## Deploy (free options)
- **GitHub Pages:** push `website/` to a repo, enable Pages on that folder.
- **Netlify / Vercel:** drag-and-drop the `website/` folder, or point it at the repo.
- **Cloudflare Pages:** connect repo, set output dir to `website`.

After deploying, upload `GanNal-Setup.exe` to `downloads/` (or, for large files,
host it on GitHub Releases and change the button `href` in `index.html` to the
release asset URL).

## Wire to a real build
The download buttons point to `downloads/GanNal-Setup.exe`. Produce that file with
Phase 8 of `../PLAN.md`, then copy it into `downloads/`.
