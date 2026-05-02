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

## Studio Data

- Projects live in `packages/studio/data/projects/`
- Sessions live in `packages/studio/data/sessions/`
- Renders output to `packages/studio/data/renders/`
- The studio shows a loading spinner until at least one project is available

## Optional Environment Variables

- `GEMINI_API_KEY` — AI image captioning during website capture (~$0.001/image)
- `PRODUCER_HEADLESS_SHELL_PATH` — Path to Chrome/Chromium for rendering

## Deployment

Configured as a static site deployment:
- Build command: `bun run build`
- Public directory: `packages/studio/dist`
