import { useState, useCallback } from "react";

interface GenerateAssetPanelProps {
  projectId: string;
  onClose: () => void;
  onAssetGenerated?: () => void;
}

const SIZE_OPTIONS = [
  { label: "512×512", w: 512, h: 512 },
  { label: "768×512", w: 768, h: 512 },
  { label: "512×768", w: 512, h: 768 },
  { label: "1024×576", w: 1024, h: 576 },
  { label: "576×1024", w: 576, h: 1024 },
];

export function GenerateAssetPanel({ projectId, onClose, onAssetGenerated }: GenerateAssetPanelProps) {
  const [tab, setTab] = useState<"image" | "video">("image");

  // Image generation state
  const [prompt, setPrompt] = useState("");
  const [negPrompt, setNegPrompt] = useState("");
  const [sizeIdx, setSizeIdx] = useState(0);
  const [steps, setSteps] = useState(20);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sdStatus, setSdStatus] = useState<"unknown" | "available" | "unavailable">("unknown");

  const size = SIZE_OPTIONS[sizeIdx] ?? SIZE_OPTIONS[0];

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/generate/status");
      const data = (await res.json()) as { sd_cpp?: { available: boolean } };
      setSdStatus(data.sd_cpp?.available ? "available" : "unavailable");
    } catch {
      setSdStatus("unavailable");
    }
  }, []);

  const generate = useCallback(async () => {
    if (!prompt.trim()) return;
    setGenerating(true);
    setError(null);
    setResult(null);
    if (sdStatus === "unknown") await checkStatus();

    try {
      const res = await fetch("/api/generate/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          negative_prompt: negPrompt.trim(),
          width: size.w,
          height: size.h,
          steps,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string; hint?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { image?: string };
      if (!data.image) throw new Error("No image in response");
      setResult(data.image);
      setSdStatus("available");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      if (msg.toLowerCase().includes("not running")) setSdStatus("unavailable");
    } finally {
      setGenerating(false);
    }
  }, [prompt, negPrompt, size, steps, sdStatus, checkStatus]);

  const saveToProject = useCallback(async () => {
    if (!result || !projectId) return;
    setSaving(true);
    try {
      // Convert base64 data URI to blob
      const [header, b64] = result.split(",");
      const mime = header?.match(/:(.*?);/)?.[1] ?? "image/png";
      const bytes = atob(b64 ?? "");
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      const blob = new Blob([arr], { type: mime });

      const safePrompt = prompt.trim().slice(0, 40).replace(/[^a-z0-9]/gi, "_").toLowerCase();
      const filename = `generated_${safePrompt || "image"}_${Date.now()}.png`;

      const formData = new FormData();
      formData.append("file", blob, filename);

      const res = await fetch(`/api/projects/${projectId}/upload?dir=assets`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      onAssetGenerated?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [result, projectId, prompt, onAssetGenerated, onClose]);

  return (
    <div className="absolute right-0 top-10 bottom-0 w-80 z-30 flex flex-col border-l border-neutral-800 bg-neutral-950 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between h-9 px-3 border-b border-neutral-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-studio-accent">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <span className="text-[11px] font-semibold text-neutral-300">Generate Assets</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded text-neutral-600 hover:text-neutral-300 hover:bg-neutral-800 transition-colors"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-neutral-800 flex-shrink-0">
        {(["image", "video"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 h-8 text-[11px] font-medium capitalize transition-colors ${
              tab === t
                ? "text-studio-accent border-b-2 border-studio-accent"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "image" ? (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* SD.cpp status badge */}
          {sdStatus === "unavailable" && (
            <div className="bg-amber-900/30 border border-amber-800/50 rounded-lg p-3 text-[11px] space-y-1">
              <p className="text-amber-300 font-medium">SD.cpp not running</p>
              <p className="text-amber-500 font-mono text-[10px] leading-relaxed">
                ./sd --model model.gguf --listen --port 8080
              </p>
              <a
                href="https://github.com/leejet/stable-diffusion.cpp"
                target="_blank"
                rel="noreferrer"
                className="text-studio-accent hover:underline text-[10px]"
              >
                stable-diffusion.cpp →
              </a>
            </div>
          )}

          {/* Prompt */}
          <div>
            <label className="block text-[10px] font-medium text-neutral-500 mb-1">Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="a cinematic landscape, golden hour, 4k…"
              rows={3}
              className="w-full px-2.5 py-2 rounded-md bg-neutral-800 border border-neutral-700 text-[11px] text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-studio-accent/50 resize-none transition-colors"
            />
          </div>

          {/* Negative prompt */}
          <div>
            <label className="block text-[10px] font-medium text-neutral-500 mb-1">
              Negative prompt
            </label>
            <input
              type="text"
              value={negPrompt}
              onChange={(e) => setNegPrompt(e.target.value)}
              placeholder="blurry, low quality…"
              className="w-full h-7 px-2.5 rounded-md bg-neutral-800 border border-neutral-700 text-[11px] text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-studio-accent/50 transition-colors"
            />
          </div>

          {/* Size */}
          <div>
            <label className="block text-[10px] font-medium text-neutral-500 mb-1">Size</label>
            <div className="flex flex-wrap gap-1">
              {SIZE_OPTIONS.map((s, i) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => setSizeIdx(i)}
                  className={`h-6 px-2 rounded text-[10px] font-mono transition-colors ${
                    sizeIdx === i
                      ? "bg-studio-accent/20 text-studio-accent border border-studio-accent/30"
                      : "bg-neutral-800 text-neutral-500 hover:text-neutral-300 border border-neutral-700"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Steps */}
          <div>
            <label className="block text-[10px] font-medium text-neutral-500 mb-1">
              Steps: {steps}
            </label>
            <input
              type="range"
              min={10}
              max={50}
              step={5}
              value={steps}
              onChange={(e) => setSteps(parseInt(e.target.value))}
              className="w-full accent-studio-accent"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-900/30 border border-red-800/50 rounded-lg px-3 py-2 text-[11px] text-red-300">
              {error}
            </div>
          )}

          {/* Generate button */}
          <button
            type="button"
            onClick={() => void generate()}
            disabled={generating || !prompt.trim()}
            className="w-full h-8 rounded-md text-[11px] font-semibold bg-studio-accent text-white hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center justify-center gap-2"
          >
            {generating ? (
              <>
                <div className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                Generate Image
              </>
            )}
          </button>

          {/* Result */}
          {result && (
            <div className="space-y-2">
              <img
                src={result}
                alt="Generated"
                className="w-full rounded-lg border border-neutral-700"
              />
              <button
                type="button"
                onClick={() => void saveToProject()}
                disabled={saving}
                className="w-full h-7 rounded-md text-[11px] font-semibold bg-neutral-800 text-neutral-200 hover:bg-neutral-700 disabled:opacity-50 transition-colors"
              >
                {saving ? "Saving…" : "Save to project assets"}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-neutral-800/60 flex items-center justify-center">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-neutral-600">
              <polygon points="23 7 16 12 23 17 23 7" />
              <rect x="1" y="5" width="15" height="14" rx="2" />
            </svg>
          </div>
          <div>
            <p className="text-[12px] font-medium text-neutral-400">Video generation</p>
            <p className="text-[11px] text-neutral-600 mt-1 leading-relaxed max-w-[200px]">
              Video generation backend is not yet integrated. Coming in a future update.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
