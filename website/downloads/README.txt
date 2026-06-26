Place the built installers here as:

    GenNal-Setup-<version>.exe
    GenNal-<version>-arm64.dmg
    GenNal-<version>-x64.dmg

They are produced from the repo root:

    npm run dist:win
    npm run dist:mac

Copy the current release files from dist/ to this folder and update the
website links plus the root .gitignore allowlist for that version.
