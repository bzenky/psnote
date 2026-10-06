# Repository Guidelines

## Project structure & module organization

psnote is a planned browser-only screenshot annotation tool. Currently,
`PLAN.md` is the only project document; source code, tests, assets, and package
configuration have not been added. Read its MVP scope before implementing work.

Follow its proposed organization when scaffolding: `src/app/` for application
composition, `src/editor/` for editor UI, `src/tools/` for annotation tools,
`src/image/` for loading and export, and `src/history/`, `src/shortcuts/`,
`src/state/`, and `src/types/` for supporting logic. Keep annotations editable
as data and flatten them only for copy/export.

## Build, test, and development commands

No build, development, lint, or test commands are configured yet. The suggested
stack is React, TypeScript, and Vite; canvas-library selection remains open.

When adding package configuration, document the actual scripts here. Recommended
script names are `npm run dev` for local development, `npm run build` for a
production build, and `npm test` for automated tests. These are proposed
conventions, not commands that work in the current checkout.

## Coding style & naming conventions

For new TypeScript code, use two-space indentation, explicit domain types, and
small modules with focused responsibilities. Follow the plan's naming examples:
PascalCase component files such as `Toolbar.tsx`, lowercase utility files such
as `clipboard.ts`, and hyphenated store files such as `history-store.ts`.

No formatter or linter is installed. Configure shared tooling during scaffolding
and document its commands rather than relying on individual editor settings.

## Testing guidelines

No testing framework or coverage threshold is established. Add tests for
annotation state, marker numbering, undo/redo, crop geometry, coordinate
transforms, and export dimensions. Use descriptive names such as
`crop.test.ts`. Cover UI state transitions and the load–annotate–undo–redo–export
flow; document browser-specific clipboard limitations and manual checks.

## Commit & pull request guidelines

Git history is unavailable in this checkout, so existing commit conventions
cannot be verified. Use concise, imperative subjects such as
`Add rectangle annotation tool`. Keep changes focused.

PR descriptions must explain behavior, reference relevant `PLAN.md` sections or
issues, and report validation performed. Include screenshots for UI changes.

## Privacy & scope

Process screenshots locally. Never upload, log, or embed image data in URLs.
Flatten redaction into exported pixels. Keep accounts, backends, cloud storage,
and persistence outside the MVP; consult `PLAN.md` before expanding scope.
