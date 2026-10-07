# psnote

Paste a screenshot, mark what matters, and copy it back. psnote is a screenshot
annotation editor that processes images entirely in your browser.

## Run locally

Use Node.js 22.22.2 or later (or a compatible newer LTS) and npm:

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite, or use its Network URL on a phone connected
to the same network. The development server listens on all network interfaces;
your firewall must allow its port for other devices to connect.

Clipboard image writing needs a secure context: use localhost during development
and HTTPS when hosting. Plain HTTP Network URLs may not support image copying.
Browsers may ask for permission; **Export PNG** remains available if copying is
unavailable.

## Annotate

Paste an image, drag and drop it, or choose **Open image**. Supported inputs are
PNG, JPEG, and WebP, up to 20 MiB and 20 million decoded pixels.

| Key                | Tool/action                                 |
| ------------------ | ------------------------------------------- |
| V                  | Select; drag to move, use handles to resize |
| H                  | Toggle Pan to reposition the image view     |
| Space + drag       | Temporarily pan without switching tools     |
| A / R / T          | Arrow / Rectangle / Text                    |
| E / P / S          | Ellipse / Free draw / Spotlight             |
| B / N / C          | Solid redaction / Number marker / Crop      |
| Delete             | Delete selected annotation                  |
| Ctrl/⌘ + Z         | Undo                                        |
| Ctrl/⌘ + Shift + Z | Redo                                        |
| + / − / 0          | Zoom in / Zoom out / Fit to screen          |

Drag with **Pan**, hold **Space**, or use the middle mouse button to reposition
the image view. **Fit to screen** resets the position. Panning does not change
annotations, undo history, or the copied/exported image.

On phones and tablets, choose **Open image**, then tap a tool and drag with one
finger to draw, redact, or crop. Tap to place text or number markers; use
**Select** to move annotations and **Pan** to reposition the image. Canvas
gestures are reserved for editing rather than page scrolling or pinch-to-zoom;
use the zoom controls instead. Mobile clipboard support varies by browser, so
use **Export PNG** if copying is unavailable.

A loading overlay appears while the browser opens and decodes an image locally.
On screens up to 600px wide, new arrows, rectangles, ellipses, and freehand strokes
default to a 6px stroke instead of the desktop 4px default. These widths are in
image pixels; changing the screen size does not restyle existing annotations.
You can still adjust stroke width in the selected annotation's properties.

Ellipse highlights a region with an outline; use equal width and height for a
circle. Free draw creates editable strokes with adjustable color, width, and
bounds. Spotlight dims the background outside one or more selected regions;
it is visual emphasis, **not redaction**. Use solid redaction for sensitive data.

Edit selected annotations with the contextual properties. Text changes commit
when the field loses focus. Use **Apply crop** or **Cancel crop** after selecting
a crop region. PNG export and image copy retain document resolution, independent
of zoom, and exclude editor controls. Redaction permanently replaces covered
source pixels in the flattened output; annotations remain editable in the session.

Sessions exist only in memory. Reloading discards them. Replacing an annotated
image asks for confirmation. Copy or export anything you want to keep first.
There are no accounts, image uploads, saved editing sessions, or third-party image
processing. Google Analytics collects site usage data only in production builds
on `www.psnote.bzenky.dev`; no custom events send image data, filenames, or
annotation content. Editor dependencies are bundled; fonts and icons use local
assets.

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
