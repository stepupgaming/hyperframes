import type { Hono } from "hono";

const SD_CPP_BASE = "http://localhost:8080";
const SD_CPP_ENDPOINT = `${SD_CPP_BASE}/txt2img`;

export function registerGenerateRoutes(api: Hono): void {
  // ── POST /generate/image ──
  // Proxies to a local stable-diffusion.cpp server.
  // Start SD.cpp with: ./sd --model <model.gguf> --port 8080
  api.post("/generate/image", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      prompt?: string;
      negative_prompt?: string;
      width?: number;
      height?: number;
      steps?: number;
      cfg_scale?: number;
      seed?: number;
    } | null;

    if (!body?.prompt) {
      return c.json({ error: "prompt is required" }, 400);
    }

    let sdRes: Response;
    try {
      sdRes = await fetch(SD_CPP_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: body.prompt,
          negative_prompt: body.negative_prompt ?? "",
          width: body.width ?? 512,
          height: body.height ?? 512,
          sample_steps: body.steps ?? 20,
          cfg_scale: body.cfg_scale ?? 7,
          seed: body.seed ?? -1,
          batch_count: 1,
        }),
        signal: AbortSignal.timeout(120_000),
      });
    } catch (err) {
      return c.json(
        {
          error: "stable-diffusion.cpp is not running",
          hint: "Start it with: ./sd --model <model.gguf> --listen --port 8080",
          detail: String(err),
        },
        503,
      );
    }

    if (!sdRes.ok) {
      const text = await sdRes.text().catch(() => String(sdRes.status));
      return c.json({ error: `SD.cpp error: ${text}` }, 502);
    }

    // SD.cpp returns { images: ["base64..."] }
    const data = (await sdRes.json()) as { images?: string[] };
    const b64 = data.images?.[0];
    if (!b64) {
      return c.json({ error: "SD.cpp returned no images" }, 502);
    }

    return c.json({
      image: `data:image/png;base64,${b64}`,
      prompt: body.prompt,
      width: body.width ?? 512,
      height: body.height ?? 512,
    });
  });

  // ── POST /generate/video ──
  // Stub — video generation backend not yet integrated.
  api.post("/generate/video", async (c) => {
    return c.json(
      {
        stub: true,
        message:
          "Video generation is not yet available in this version. A future update will add support for local video generation backends.",
      },
      501,
    );
  });

  // ── GET /generate/status ──
  // Quick health check for available backends.
  api.get("/generate/status", async (c) => {
    let sdAvailable = false;
    try {
      const probe = await fetch(`${SD_CPP_BASE}/health`, {
        signal: AbortSignal.timeout(1500),
      });
      sdAvailable = probe.ok;
    } catch {
      sdAvailable = false;
    }

    return c.json({
      sd_cpp: {
        available: sdAvailable,
        endpoint: SD_CPP_ENDPOINT,
        hint: sdAvailable
          ? "stable-diffusion.cpp is running"
          : "Start SD.cpp with: ./sd --model <model.gguf> --listen --port 8080",
      },
      video: { available: false, hint: "Not yet implemented" },
    });
  });
}
