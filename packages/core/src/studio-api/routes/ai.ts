import type { Hono } from "hono";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { join, dirname, resolve } from "node:path";
import type { StudioApiAdapter } from "../types.js";
import { isSafePath, walkDir } from "../helpers/safePath.js";

// ── System Prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(files: string[], meta?: { format?: string }): string {
  const format = meta?.format ?? "16:9";
  const dims: Record<string, { w: number; h: number }> = {
    "16:9": { w: 1920, h: 1080 },
    "9:16": { w: 1080, h: 1920 },
    "1:1":  { w: 1080, h: 1080 },
    "4:5":  { w: 1080, h: 1350 },
  };
  const { w, h } = dims[format] ?? dims["16:9"];
  const isPortrait = h > w;

  return `You are an AI coding assistant embedded in HyperFrames Studio. Your job is to BUILD complete, polished video compositions from scratch — not just make small edits. When a user asks you to create something, you should write ALL the necessary files to make it work beautifully, even if that means creating the project from scratch.

## Current project
Files: ${files.length > 0 ? files.map((f) => `\`${f}\``).join(", ") : "(empty — build it from scratch!)"}
Format: ${format} (${w}×${h}px${isPortrait ? " — portrait/vertical video" : ""})

## What you CAN do
- Create or overwrite ANY file in the project (use write_file)
- Delete files you no longer need (use delete_file)
- Create sub-compositions in a \`compositions/\` subfolder
- Create CSS files, JS modules, JSON data files — anything
- Start completely from scratch even if files already exist
- Build the ENTIRE project, not just one file

## HyperFrames Composition Model

Every composition is a standalone HTML file. The master is always \`index.html\`.

### Minimal single-composition example (${w}×${h}):
\`\`\`html
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=${w}, height=${h}" />
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: ${w}px; height: ${h}px; overflow: hidden; background: #000; }
    .title { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); color: #fff; font: 700 80px/1 system-ui; }
  </style>
</head>
<body data-composition-id="main" data-duration="10" data-fps="30" data-width="${w}" data-height="${h}">
  <div class="title">Hello World</div>
  <script>
    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });
    tl.from('.title', { opacity: 0, y: 60, duration: 1, ease: 'power3.out' });
    window.__timelines['main'] = tl;
  </script>
</body>
</html>
\`\`\`

### Multi-composition project (index.html as master):
\`\`\`html
<body data-composition-id="master" data-duration="30" data-fps="30" data-width="${w}" data-height="${h}">
  <!-- Each iframe is a timed sub-composition -->
  <iframe src="compositions/intro.html"
    data-composition-id="intro"
    data-start="0" data-duration="8" data-track-index="0">
  </iframe>
  <iframe src="compositions/hook.html"
    data-composition-id="hook"
    data-start="8" data-duration="12" data-track-index="0">
  </iframe>
  <iframe src="compositions/outro.html"
    data-composition-id="outro"
    data-start="20" data-duration="10" data-track-index="0">
  </iframe>
  <script>
    window.__timelines = window.__timelines || {};
    window.__timelines['master'] = gsap.timeline({ paused: true });
  </script>
</body>
\`\`\`

## Key data attributes
| Attribute | Description |
|-----------|-------------|
| \`data-composition-id\` | Unique ID string (no spaces). Must match \`window.__timelines\` key |
| \`data-duration\` | Length in seconds |
| \`data-fps\` | Frames per second (use 30) |
| \`data-start\` | Start offset within master (seconds) |
| \`data-track-index\` | Z-layer (0 = bottom, higher = on top) |
| \`data-width\` / \`data-height\` | Pixel dimensions |

## Animation rules
- Use \`gsap.timeline({ paused: true })\` — the runtime controls playback and seeking
- ALWAYS register timelines: \`window.__timelines['<composition-id>'] = tl\`
- Never use \`setTimeout\`, \`setInterval\`, or \`requestAnimationFrame\` for animations
- CSS animations/transitions also work; they are made seekable automatically
- CDN libraries available at build time:
  - GSAP 3.14: \`https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js\`
  - GSAP ScrollTrigger, Flip, etc.: \`https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/...\`
  - anime.js 3.2: \`https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.2/anime.min.js\`
  - Three.js r134: \`https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js\`

## CSS variables (auto-injected at runtime)
- \`--comp-width\`, \`--comp-height\` — composition pixel dimensions

## Portrait / TikTok guidance${isPortrait ? `
This project is PORTRAIT (${w}×${h}) — optimized for TikTok, Reels, and Shorts.
- Design for vertical scrolling content: bold headlines at top/bottom, action in center
- Use large typography (100px+ for hero text) for mobile readability
- Keep important content in the safe zone: 200px from top/bottom edges
- Trending TikTok hooks: first 3 seconds must grab attention immediately
- Suggested structure: Hook (0-3s) → Content (3-25s) → CTA (25-30s)
` : `
This project is LANDSCAPE (${w}×${h}).
`}
## Your workflow
1. Start with \`list_files\` to see what exists
2. Read any existing files you'll modify (\`read_file\`)
3. Write complete files — never partial diffs (\`write_file\`)
4. Clean up old files if restructuring (\`delete_file\`)
5. When done, briefly describe what was built

## Quality bar
- Produce visually striking results: use bold typography, color contrast, smooth easing
- All animations should feel intentional (not random)
- Code should be self-contained — no external dependencies beyond the listed CDNs
- Always write complete, valid HTML with correct doctype, head, and body`;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "list_files",
      description: "List all files in the current HyperFrames project. Call this first to understand the project structure.",
      parameters: { type: "object", properties: {}, required: [] as string[] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "read_file",
      description: "Read the full contents of a file. Always read a file before editing it.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: 'Relative path within the project (e.g. "index.html", "compositions/intro.html")',
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "write_file",
      description:
        "Write a complete file to the project. Creates parent directories automatically. Always provide the full file content — never a partial diff or fragment.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: 'Relative path within the project (e.g. "index.html", "compositions/hook.html", "style.css")',
          },
          content: {
            type: "string",
            description: "Complete file content",
          },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "delete_file",
      description: "Delete a file from the project. Use when restructuring or cleaning up unused files.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relative path of the file to delete",
          },
        },
        required: ["path"],
      },
    },
  },
];

// ── Route registration ────────────────────────────────────────────────────────

export function registerAiRoutes(api: Hono, adapter: StudioApiAdapter): void {
  // ── POST /ai/stream ──
  api.post("/ai/stream", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      projectId: string;
      messages: unknown[];
      settings: { baseUrl: string; apiKey: string; model: string };
    } | null;

    if (!body) return c.json({ error: "invalid body" }, 400);

    const { projectId, messages, settings } = body;
    if (!settings?.baseUrl || !settings?.apiKey || !settings?.model) {
      return c.json({ error: "AI settings incomplete" }, 400);
    }

    const project = await adapter.resolveProject(projectId);
    if (!project) return c.json({ error: "project not found" }, 404);

    const files = walkDir(project.dir).filter((f) => f !== "meta.json");

    // Read meta.json to get format info
    let meta: { format?: string } = {};
    const metaPath = join(project.dir, "meta.json");
    if (existsSync(metaPath)) {
      try { meta = JSON.parse(readFileSync(metaPath, "utf-8")); } catch { /* ignore */ }
    }

    const systemPrompt = buildSystemPrompt(files, meta);

    const url = settings.baseUrl.replace(/\/$/, "") + "/chat/completions";

    let upstream: Response;
    try {
      upstream = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify({
          model: settings.model,
          messages: [{ role: "system", content: systemPrompt }, ...messages],
          tools: TOOLS,
          tool_choice: "auto",
          stream: true,
        }),
      });
    } catch (err) {
      return c.json({ error: `Failed to reach AI provider: ${String(err)}` }, 502);
    }

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => String(upstream.status));
      return c.json({ error: errText }, upstream.status as number);
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    });
  });

  // ── POST /ai/tool ──
  api.post("/ai/tool", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      projectId: string;
      name: string;
      args: Record<string, string>;
    } | null;

    if (!body) return c.json({ error: "invalid body" }, 400);

    const project = await adapter.resolveProject(body.projectId);
    if (!project) return c.json({ error: "project not found" }, 404);

    const projectDir = resolve(project.dir);

    switch (body.name) {
      case "list_files": {
        const files = walkDir(projectDir).filter((f) => f !== "meta.json");
        return c.json({ result: files.length > 0 ? JSON.stringify(files) : "[]  (project is empty)" });
      }

      case "read_file": {
        const rel = body.args.path;
        if (!rel) return c.json({ error: "path required" }, 400);

        const abs = resolve(join(projectDir, rel));
        if (!isSafePath(projectDir, abs)) {
          return c.json({ error: "path outside project" }, 403);
        }
        if (!existsSync(abs)) {
          return c.json({ result: `File not found: ${rel}` });
        }

        try {
          const content = readFileSync(abs, "utf-8");
          return c.json({ result: content });
        } catch (err) {
          return c.json({ result: `Error reading file: ${String(err)}` });
        }
      }

      case "write_file": {
        const rel = body.args.path;
        const content = body.args.content;
        if (!rel || content === undefined) {
          return c.json({ error: "path and content required" }, 400);
        }

        const abs = resolve(join(projectDir, rel));
        if (!isSafePath(projectDir, abs)) {
          return c.json({ error: "path outside project" }, 403);
        }

        try {
          mkdirSync(dirname(abs), { recursive: true });
          writeFileSync(abs, content, "utf-8");
          return c.json({ result: `Written: ${rel}` });
        } catch (err) {
          return c.json({ result: `Error writing file: ${String(err)}` });
        }
      }

      case "delete_file": {
        const rel = body.args.path;
        if (!rel) return c.json({ error: "path required" }, 400);

        // Never allow deleting meta.json
        if (rel === "meta.json") {
          return c.json({ error: "cannot delete meta.json" }, 403);
        }

        const abs = resolve(join(projectDir, rel));
        if (!isSafePath(projectDir, abs)) {
          return c.json({ error: "path outside project" }, 403);
        }

        if (!existsSync(abs)) {
          return c.json({ result: `File not found (already gone): ${rel}` });
        }

        try {
          rmSync(abs, { recursive: false, force: true });
          return c.json({ result: `Deleted: ${rel}` });
        } catch (err) {
          return c.json({ result: `Error deleting file: ${String(err)}` });
        }
      }

      default:
        return c.json({ error: `Unknown tool: ${body.name}` }, 400);
    }
  });
}
