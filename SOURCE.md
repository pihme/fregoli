# gh-pages source

This branch holds the static GitHub Pages site for `pihme/fregoli`.

Generated on 2026-09-26 from `main` at commit `95f9711d81a56e78bd94c3a4e7a3318b271e92a0`.
Self-contained `index.html`, `chronik/index.html` (Chronicles) and `jigsaw/index.html` (family page, from `family.json`), all with inline CSS, no build step, no trackers; plus favicons (`favicon.svg`, `favicon.png`, `apple-touch-icon.png`) and `.nojekyll`.
Generator: `gen.py` (layout B, sidebar handbook) + per-site content script + `chronik-<repo>.json` chronicle data + `family.json` project-family registry + `status-<repo>.json` (Current status; open issues and releases pulled live via `gh` at build time).
Regenerate when `main` changes; do not merge this branch into `main`.
