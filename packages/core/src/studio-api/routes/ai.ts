import type { Hono } from "hono";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { join, dirname, resolve } from "node:path";
import type { StudioApiAdapter } from "../types.js";
import { isSafePath, walkDir } from "../helpers/safePath.js";

// ── System Prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(files: string[]): string {
  return `You are an AI coding assistant embedded in HyperFrames Studio — a browser-based video composition editor where every composition is a plain HTML file animated with JavaScript and CSS.

## Project files
${files.map((f) => `- ${f}`).join("\n")}

## HyperFrames Composition Model
Compositions are self-contained HTML files. Timing and structure are declared via data attributes:

\`\`\`html
<!doctype html>
<html>
<head>
  <style>
    body { margin: 0; overflow: hidden; background: transparent; }
    .title { position: absolute; ... }
  </style>
</head>
<body data-composition-id="my-comp" data-duration="10" data-fps="30">
  <div class="title">Hello World</div>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
  <script>
    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });
    tl.from('.title', { opacity: 0, y: 20, duration: 0.6 });
    window.__timelines['my-comp'] = tl; // key must match data-composition-id
  </script>
</body>
</html>
\`\`\`

## Key data attributes
- \`data-composition-id\` — unique identifier (string, no spaces)
- \`data-duration\` — length in seconds (e.g. "10" or "2.5")
- \`data-fps\` — frames per second (typically 30)
- \`data-start\` — start offset within master (seconds)
- \`data-track-index\` — timeline layer (0 = bottom)
- \`data-width\` / \`data-height\` — override viewport size

## Animation: GSAP (recommended)
Register timelines in \`window.__timelines\` so the runtime can seek them:
- Use \`gsap.timeline({ paused: true })\`
- Assign to \`window.__timelines['<composition-id>']\`

## Animation: CSS
Standard CSS transitions and animations work. The runtime makes them seekable.

## CSS variables (auto-injected into root)
- \`--comp-width\`, \`--comp-height\` — composition dimensions in px

## Master composition (index.html)
References sub-compositions as iframes:
\`\`\`html
<iframe src="compositions/captions.html"
  data-composition-id="captions"
  data-start="0" data-duration="30" data-track-index="1">
</iframe>
\`\`\`

## Available CDN libraries
- GSAP 3.12: \`https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js\`
- anime.js: \`https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.2/anime.min.js\`
- Three.js r134: \`https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js\`

## Rules
1. Always produce complete, valid HTML files (never partial fragments)
2. Register GSAP timelines in \`window.__timelines\` with the \`data-composition-id\` as the key
3. Use \`paused: true\` — the runtime controls playback for seeking
4. Durations in data attributes are always in seconds
5. Avoid \`setTimeout\`/\`setInterval\` for animations (breaks seeking)
6. Read a file before editing it; write the complete new content`;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "list_files",
      description: "List all files in the current HyperFrames project",
      parameters: { type: "object", properties: {}, required: [] as string[] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "read_file",
      description: "Read a file from the project. Always read before editing.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              'Relative path within the project (e.g. "index.html", "compositions/captions.html")',
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
        "Write a file to the project. Provide the complete file content (never a diff).",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relative path within the project",
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
];

// ── Route registration ────────────────────────────────────────────────────────

export function registerAiRoutes(api: Hono, adapter: StudioApiAdapter): void {
  // ── POST /ai/stream ──
  // Proxies a single ChatCompletion (streaming) to the configured provider,
  // injecting the HyperFrames system prompt and project file list.
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
    const systemPrompt = buildSystemPrompt(files);

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
  // Execute a single tool call server-side with path-safety checks.
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
        return c.json({ result: JSON.stringify(files) });
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
          return c.json({ result: "OK" });
        } catch (err) {
          return c.json({ result: `Error writing file: ${String(err)}` });
        }
      }

      default:
        return c.json({ error: `Unknown tool: ${body.name}` }, 400);
    }
  });
}
