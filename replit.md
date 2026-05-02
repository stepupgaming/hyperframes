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
- **HomeScreen.tsx** — Project grid with 16:9 thumbnail previews (`/api/projects/:id/thumbnail/index.html`), inline rename (double-click or pencil icon), delete confirmation, duplicate button, export-as-ZIP download link
- **NewProjectModal.tsx** — Template gallery + project name input + collapsible "Describe your video" textarea (passes description to AI on first open)

### Project API (`packages/core/src/studio-api/routes/projects.ts`)
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/projects` | List all projects (reads titles from `meta.json`) |
| POST | `/api/projects` | Create project from template; writes `meta.json` with `title`, `createdAt`, and optional `description` |
| PATCH | `/api/projects/:id` | Rename project (updates `meta.json`) |
| DELETE | `/api/projects/:id` | Delete project directory |
| GET | `/api/projects/:id` | File tree for project (excludes `meta.json`) |
| GET | `/api/projects/:id/meta` | Read `meta.json` (returns `{ title, createdAt, description }`) |
| POST | `/api/projects/:id/duplicate` | Copy project directory with a new random ID |
| GET | `/api/projects/:id/export.zip` | Stream project as a ZIP archive (via `zip` CLI) |
| GET | `/api/templates` | List available templates from `registry/examples/` |

### Project Storage
- Projects live in `packages/studio/data/projects/<id>/`
- Project ID format: `<slug>-<4-char-random>` (e.g. `my-first-video-eqtm`)
- `meta.json` stores `{ title, createdAt, description? }` — hidden from editor file tree
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
- On project open, App fetches `/api/projects/:id/meta`; if `description` is set and no AI history exists, AI panel auto-opens and auto-sends the description as the first message

## AI Agent (`packages/studio/src/components/ai/`)

An embedded AI coding assistant that can read and write project files directly.

### Components
- **AIPanel.tsx** — Chat UI with streaming token display, inline tool-call visualization, agentic loop, **localStorage history persistence** per project, **vision support** (screenshot_preview tool injects base64 images as user messages), auto-send `initialMessage` on first open
- **AISettings.tsx** — Settings modal (base URL, API key, model); persisted in `localStorage` as `hf-ai-config`

### How it works
1. User clicks **AI** button in the editor toolbar (or presses **⌘/**) → `AIPanel` slides in as a right-side overlay (360px wide, z-index 30)
2. User types a message → Panel calls `POST /api/ai/stream` which proxies the request to the configured OpenAI-compatible provider, injecting the HyperFrames system prompt + current project file list
3. Client reads the raw OpenAI SSE stream, accumulates text and tool-call deltas
4. When `finish_reason == "tool_calls"`, client calls `POST /api/ai/tool` for each tool, then loops back
5. When a `write_file` tool completes, `onFileWritten()` fires → `setRefreshKey` reloads the preview
6. When a `screenshot_preview` tool returns a base64 image, it is injected as a vision `user` message after all tool results (OpenAI vision format)
7. Conversation history is persisted in `localStorage` as `hf-ai-history-{projectId}` and restored on next open; "Clear" removes it

### API routes (`packages/core/src/studio-api/routes/ai.ts`)
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/ai/stream` | Proxy streaming ChatCompletion to any OpenAI-compatible endpoint |
| POST | `/api/ai/tool` | Execute a file tool with path-safety checks |

### Agent tools
- `list_files` — returns the project's file list as JSON
- `read_file(path)` — reads a project file; path must stay within project dir (`isSafePath`)
- `write_file(path, content)` — writes a complete file; creates parent dirs automatically
- `delete_file(path)` — deletes a project file
- `screenshot_preview(time?)` — fetches the thumbnail API and returns a base64 image for vision feedback

### Supported providers (any OpenAI-compatible)
- OpenAI (`https://api.openai.com/v1`)
- Groq (`https://api.groq.com/openai/v1`)
- OpenRouter (`https://openrouter.ai/api/v1`)
- Ollama (`http://localhost:11434/v1`)
- LM Studio, Together AI, Fireworks, etc.

### System prompt
Injected server-side into every request. Covers: composition HTML structure, data attributes, GSAP `window.__timelines` pattern, CSS variables, available CDN libraries, coding rules, and screenshot verification workflow.

## Editor Toolbar Panels

### Google Fonts Picker (`packages/studio/src/components/editor/FontPickerPanel.tsx`)
- Activated by the **Tt Fonts** button in the editor toolbar
- Curated list of 50+ Google Fonts organized by category (sans-serif, serif, display, monospace)
- Search and category filter; live preview using Google Fonts stylesheet injected in browser `<head>`
- "Add to file" button reads the current open file, injects a `<link>` Google Fonts tag before `</head>`, and writes the file back

### Generate Assets (`packages/studio/src/components/ai/GenerateAssetPanel.tsx`)
- Activated by the **⚡ Generate** button in the editor toolbar
- **Image tab**: Sends prompt to `POST /api/generate/image` which proxies to a local SD.cpp instance at `localhost:8080`. Shows helpful setup instructions when SD.cpp is not running. Generated images can be saved to `assets/` in the current project.
- **Video tab**: Stub with "coming soon" message

### Generate API (`packages/core/src/studio-api/routes/generate.ts`)
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/generate/status` | Check availability of SD.cpp and video backends |
| POST | `/api/generate/image` | Proxy to SD.cpp at localhost:8080 |
| POST | `/api/generate/video` | Stub (returns 501) |

## Global Keyboard Shortcuts (editor view)

| Key | Action |
|-----|--------|
| **Space** | Toggle play/pause |
| **K** | Pause |
| **L** | Play |
| **J** | Stop |
| **⌘S / Ctrl+S** | Show "Auto-saved" toast |
| **⌘/ / Ctrl+/** | Toggle AI panel |

Shortcuts are suppressed when focus is on an `<input>`, `<textarea>`, or contenteditable element.

## Timeline

- **Ruler** (`packages/studio/src/player/components/Timeline.tsx`): Click or drag the ruler to seek. Uses pointer capture for smooth scrubbing across the full drag.

## Optional Environment Variables

- `GEMINI_API_KEY` — AI image captioning during website capture (~$0.001/image)
- `PRODUCER_HEADLESS_SHELL_PATH` — Path to Chrome/Chromium for rendering

## Deployment

Configured as a static site deployment:
- Build command: `bun run build`
- Public directory: `packages/studio/dist`
