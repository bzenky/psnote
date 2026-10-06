# psnote

Paste a screenshot, mark what matters, and copy it back. psnote is a screenshot
annotation editor that processes images entirely in your browser.

## Run locally

Use Node.js 22.22.2 or later (or a compatible newer LTS) and npm:

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite. Clipboard image writing needs a secure context:
use localhost during development and HTTPS when hosting. Browsers may ask for
permission; **Export PNG** remains available if copying is unavailable.

## Annotate

Paste an image, drag and drop it, or choose **Open image**. Supported inputs are
PNG, JPEG, and WebP, up to 20 MiB and 20 million decoded pixels.

| Key                | Tool/action                                 |
| ------------------ | ------------------------------------------- |
| V                  | Select; drag to move, use handles to resize |
| A / R / T          | Arrow / Rectangle / Text                    |
| B / N / C          | Solid redaction / Number marker / Crop      |
| Delete             | Delete selected annotation                  |
| Ctrl/⌘ + Z         | Undo                                        |
| Ctrl/⌘ + Shift + Z | Redo                                        |
| + / − / 0          | Zoom in / Zoom out / Fit to screen          |

Edit selected annotations with the contextual properties. Text changes commit
when the field loses focus. Use **Apply crop** or **Cancel crop** after selecting
a crop region. PNG export and image copy retain document resolution, independent
of zoom, and exclude editor controls. Redaction permanently replaces covered
source pixels in the flattened output; annotations remain editable in the session.

Sessions exist only in memory. Reloading discards them. Replacing an annotated
image asks for confirmation. Copy or export anything you want to keep first.
There are no accounts, uploads, persistence, third-party image processing, or
analytics. Dependencies are bundled; fonts and icons use local assets.

## Develop and verify

```bash
npm run verify                   # Types, lint, unit/component tests, static build
npx playwright install           # Install Chromium, Firefox, and WebKit
npm run test:e2e                 # Browser tests in all three engines
npm run format                  # Format source, tests, and project configuration
npm run build                   # Production files in dist/
npm run preview                 # Preview the production build locally
```

Vitest covers document geometry, history, validation, shortcuts, and session
boundaries. Playwright covers the editor and PNG pixel output across three engines.
Clipboard API tests use browser doubles; manually smoke-test native paste/copy
with an image and another application before a release. Automated tests do not
establish operating-system clipboard interoperability.

## Repository notes

Root `PLAN.md` and `.specs/` are local planning artifacts excluded from commits.
Repository initialization uses standard Git and GitHub CLI commands.
No license is selected yet.
