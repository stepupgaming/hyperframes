# Hyperframes Studio

Open-source video rendering framework: write HTML, render video. This is a Bun monorepo.

## Project Structure

```
packages/
  cli/       → hyperframes CLI (create, preview, lint, render)
  core/      → Types, parsers, generators, linter, runtime, frame adapters
  engine/    → Seekable page-to-video capture engine (Puppeteer + FFmpeg)
  player/    → Embeddable <hyperframes-player> web component
  producer/  → Full rendering pipeline (capture + encode + audio mix)
  studio/    → Browser-based composition editor UI (main frontend)
  shader-transitions/ → GPU shader-based transitions
```

## Running the App

The main workflow runs `bun run studio` which starts `@hyperframes/studio` via Vite on port 5000.

```bash
bun install --ignore-scripts   # Install dependencies (ignore lefthook git hooks)
bun run studio                 # Start the studio dev server on port 5000
bun run build                  # Build all packages
bun run test                   # Run all tests
```

**Important:** This repo uses **bun**, not npm or pnpm. Do NOT run `pnpm install`.

## Key Configuration

- **Vite config:** `packages/studio/vite.config.ts` — configured for port 5000, host 0.0.0.0, allowedHosts: true
- **Workspace:** Root `package.json` defines bun workspaces across `packages/*`
- **Linting:** oxlint + oxfmt (not eslint/prettier/biome)
- **Git hooks:** lefthook — disabled during install via `--ignore-scripts`

## Studio — Self-Contained Project Management

The studio is fully self-contained: no CLI is needed for any user action. Everything happens in the browser.

### Home Screen (`packages/studio/src/components/home/`)
- **HomeScreen.tsx** — Project grid with empty state, inline rename (double-click title or pencil icon), delete confirmation
- **NewProjectModal.tsx** — Template gallery (color swatches per template) + project name input

### Project API (`packages/core/src/studio-api/`)
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/projects` | List all projects (reads titles from `meta.json`) |
| POST | `/api/projects` | Create project from template; writes `meta.json` with `title` + `createdAt` |
| PATCH | `/api/projects/:id` | Rename project (updates `meta.json`) |
| DELETE | `/api/projects/:id` | Delete project directory |
| GET | `/api/projects/:id` | File tree for project (excludes `meta.json`) |
| GET | `/api/templates` | List available templates from `registry/examples/` |

### Project Storage
- Projects live in `packages/studio/data/projects/<id>/`
- Project ID format: `<slug>-<4-char-random>` (e.g. `my-first-video-eqtm`)
- `meta.json` stores `{ title, createdAt }` — hidden from editor file tree
- Sessions live in `packages/studio/data/sessions/`
- Renders output to `packages/studio/data/renders/`

### Templates
- 7 templates from `registry/examples/` + "blank" fallback
- Blank template copied from `packages/cli/src/templates/blank/index.html`
- `registry-item.json` is stripped from template copies

### Navigation
- App opens on Home screen when no project hash is in the URL
- Clicking a project card opens the editor and sets `#project-<id>` in the URL
- "← Projects" back button in editor header returns to Home
- `App.tsx` key state: `showHome` + `openProject(id)` callback

## Optional Environment Variables

- `GEMINI_API_KEY` — AI image captioning during website capture (~$0.001/image)
- `PRODUCER_HEADLESS_SHELL_PATH` — Path to Chrome/Chromium for rendering

## Deployment

Configured as a static site deployment:
- Build command: `bun run build`
- Public directory: `packages/studio/dist`
