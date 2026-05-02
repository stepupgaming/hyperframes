import { useState, useEffect, useRef } from "react";

interface TemplateInfo {
  id: string;
  title: string;
  description: string;
  dimensions: { width: number; height: number };
  duration: number;
}

interface NewProjectModalProps {
  onClose: () => void;
  onCreate: (name: string, templateId: string, format: string) => Promise<void>;
}

const TEMPLATE_COLORS: Record<string, { bg: string; accent: string; label: string }> = {
  blank:            { bg: "#1a1a1a", accent: "#555", label: "#888" },
  "warm-grain":     { bg: "#f5f0e0", accent: "#c8a96e", label: "#7a5c2e" },
  "swiss-grid":     { bg: "#ffffff", accent: "#e63312", label: "#111" },
  "kinetic-type":   { bg: "#0d0014", accent: "#9b5cf6", label: "#c084fc" },
  "play-mode":      { bg: "#0a1a0a", accent: "#22c55e", label: "#86efac" },
  "product-promo":  { bg: "#0a0f1e", accent: "#3b82f6", label: "#93c5fd" },
  vignelli:         { bg: "#0a0a0a", accent: "#e63312", label: "#f87171" },
  "nyt-graph":      { bg: "#f9f6f0", accent: "#222", label: "#555" },
  "decision-tree":  { bg: "#0a1a1a", accent: "#14b8a6", label: "#5eead4" },
};

const FORMATS = [
  { id: "16:9",  w: 1920, h: 1080, label: "16:9",  hint: "YouTube · TV · Desktop" },
  { id: "9:16",  w: 1080, h: 1920, label: "9:16",  hint: "TikTok · Reels · Shorts" },
  { id: "1:1",   w: 1080, h: 1080, label: "1:1",   hint: "Instagram · Square" },
  { id: "4:5",   w: 1080, h: 1350, label: "4:5",   hint: "Instagram Feed" },
] as const;

type FormatId = (typeof FORMATS)[number]["id"];

function FormatPicker({
  value,
  onChange,
}: {
  value: FormatId;
  onChange: (f: FormatId) => void;
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-neutral-400 mb-2">
        Aspect ratio
      </label>
      <div className="flex gap-2">
        {FORMATS.map((f) => {
          const isPortrait = f.h > f.w;
          const isSquare = f.w === f.h;
          const selected = value === f.id;
          // Visual proportions: constrain to a 48px tall box
          const boxH = 40;
          const boxW = isSquare ? 40 : isPortrait ? Math.round((boxH * f.w) / f.h) : Math.round((boxH * f.w) / f.h);
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => onChange(f.id)}
              className={`flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-lg border transition-all ${
                selected
                  ? "border-studio-accent bg-studio-accent/10 ring-1 ring-studio-accent/30"
                  : "border-neutral-700 hover:border-neutral-500 bg-neutral-800/40"
              }`}
            >
              {/* Mini rectangle */}
              <div className="flex items-center justify-center" style={{ width: 48, height: 40 }}>
                <div
                  className={`rounded-sm border ${selected ? "border-studio-accent" : "border-neutral-500"}`}
                  style={{ width: boxW, height: boxH }}
                />
              </div>
              <span className={`text-[11px] font-semibold ${selected ? "text-studio-accent" : "text-neutral-300"}`}>
                {f.label}
              </span>
              <span className="text-[9px] text-neutral-600 text-center leading-tight max-w-[72px]">
                {f.hint}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TemplateCard({
  template,
  selected,
  onSelect,
}: {
  template: TemplateInfo;
  selected: boolean;
  onSelect: () => void;
}) {
  const colors = TEMPLATE_COLORS[template.id] ?? { bg: "#111", accent: "#555", label: "#888" };
  const isPortrait = template.dimensions.height > template.dimensions.width;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex flex-col gap-2 text-left rounded-lg border transition-all ${
        selected
          ? "border-studio-accent ring-1 ring-studio-accent/40"
          : "border-neutral-700/60 hover:border-neutral-500"
      }`}
    >
      <div
        className="w-full rounded-t-lg flex items-center justify-center overflow-hidden"
        style={{ backgroundColor: colors.bg, aspectRatio: isPortrait ? "9/16" : "16/9", maxHeight: 80 }}
      >
        <div className="flex flex-col items-center gap-1 opacity-80">
          <div
            className="rounded-sm"
            style={{ width: isPortrait ? 12 : 24, height: isPortrait ? 24 : 12, backgroundColor: colors.accent }}
          />
          <div className="flex gap-1">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-sm"
                style={{ width: 6, height: 3, backgroundColor: colors.label, opacity: 0.6 }}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="px-2.5 pb-2.5">
        <div className="text-[11px] font-semibold text-neutral-200 leading-tight">{template.title}</div>
        <div className="text-[10px] text-neutral-500 mt-0.5 leading-tight">{template.description}</div>
        <div className="text-[9px] text-neutral-600 mt-1">
          {template.dimensions.width}×{template.dimensions.height} · {template.duration}s
        </div>
      </div>
    </button>
  );
}

export function NewProjectModal({ onClose, onCreate }: NewProjectModalProps) {
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState("blank");
  const [format, setFormat] = useState<FormatId>("16:9");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/templates")
      .then((r) => r.json())
      .then((data: { templates?: TemplateInfo[] }) => {
        if (data.templates?.length) setTemplates(data.templates);
      })
      .catch(() => {});
    setTimeout(() => nameRef.current?.focus(), 50);
  }, []);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Please enter a project name.");
      nameRef.current?.focus();
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await onCreate(trimmed, selectedTemplate, format);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project.");
      setCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    if (e.key === "Enter" && !creating) void handleCreate();
  };

  // Only show format picker for "blank" template — registry templates have fixed dimensions
  const showFormatPicker = selectedTemplate === "blank";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onKeyDown={handleKeyDown}
    >
      <div className="w-[640px] max-h-[90vh] flex flex-col rounded-xl border border-neutral-700/60 bg-neutral-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
          <h2 className="text-sm font-semibold text-neutral-100">New Project</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-[11px] font-medium text-neutral-400 mb-1.5">Project name</label>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(null); }}
              placeholder="my-video"
              className="w-full h-8 px-3 rounded-md bg-neutral-800 border border-neutral-700 text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-studio-accent/60 focus:ring-1 focus:ring-studio-accent/20 transition-colors"
            />
            {error && <p className="mt-1.5 text-[11px] text-red-400">{error}</p>}
          </div>

          {/* Template picker */}
          <div>
            <label className="block text-[11px] font-medium text-neutral-400 mb-2">Template</label>
            {templates.length === 0 ? (
              <div className="text-[11px] text-neutral-600">Loading templates…</div>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {templates.map((t) => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    selected={selectedTemplate === t.id}
                    onSelect={() => setSelectedTemplate(t.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Format picker — only for blank */}
          {showFormatPicker && (
            <FormatPicker value={format} onChange={setFormat} />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-neutral-800">
          <button
            type="button"
            onClick={onClose}
            className="h-7 px-3 rounded-md text-[11px] font-medium text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={creating}
            className="h-7 px-3.5 rounded-md text-[11px] font-semibold bg-studio-accent text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {creating ? "Creating…" : "Create project"}
          </button>
        </div>
      </div>
    </div>
  );
}
