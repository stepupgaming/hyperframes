import { useState, useCallback, useEffect, useMemo } from "react";

// Curated list of popular Google Fonts by category
const FONTS: { name: string; category: string }[] = [
  // Sans-serif
  { name: "Inter", category: "sans-serif" },
  { name: "Roboto", category: "sans-serif" },
  { name: "Open Sans", category: "sans-serif" },
  { name: "Lato", category: "sans-serif" },
  { name: "Montserrat", category: "sans-serif" },
  { name: "Poppins", category: "sans-serif" },
  { name: "Raleway", category: "sans-serif" },
  { name: "Nunito", category: "sans-serif" },
  { name: "Source Sans 3", category: "sans-serif" },
  { name: "Ubuntu", category: "sans-serif" },
  { name: "Noto Sans", category: "sans-serif" },
  { name: "PT Sans", category: "sans-serif" },
  { name: "DM Sans", category: "sans-serif" },
  { name: "Karla", category: "sans-serif" },
  { name: "Manrope", category: "sans-serif" },
  { name: "Figtree", category: "sans-serif" },
  { name: "Plus Jakarta Sans", category: "sans-serif" },
  { name: "Outfit", category: "sans-serif" },
  { name: "Work Sans", category: "sans-serif" },
  { name: "Hind", category: "sans-serif" },
  // Serif
  { name: "Playfair Display", category: "serif" },
  { name: "Merriweather", category: "serif" },
  { name: "Lora", category: "serif" },
  { name: "PT Serif", category: "serif" },
  { name: "EB Garamond", category: "serif" },
  { name: "Libre Baskerville", category: "serif" },
  { name: "Cormorant Garamond", category: "serif" },
  { name: "Vollkorn", category: "serif" },
  { name: "Noto Serif", category: "serif" },
  { name: "Source Serif 4", category: "serif" },
  // Display / Decorative
  { name: "Oswald", category: "display" },
  { name: "Bebas Neue", category: "display" },
  { name: "Anton", category: "display" },
  { name: "Righteous", category: "display" },
  { name: "Fredoka", category: "display" },
  { name: "Pacifico", category: "display" },
  { name: "Lobster", category: "display" },
  { name: "Abril Fatface", category: "display" },
  { name: "Alfa Slab One", category: "display" },
  { name: "Black Han Sans", category: "display" },
  { name: "Permanent Marker", category: "display" },
  { name: "Boogaloo", category: "display" },
  { name: "Titan One", category: "display" },
  { name: "Lilita One", category: "display" },
  { name: "Knewave", category: "display" },
  // Monospace
  { name: "Source Code Pro", category: "monospace" },
  { name: "Fira Code", category: "monospace" },
  { name: "JetBrains Mono", category: "monospace" },
  { name: "Space Mono", category: "monospace" },
  { name: "IBM Plex Mono", category: "monospace" },
  { name: "Roboto Mono", category: "monospace" },
  { name: "Inconsolata", category: "monospace" },
  { name: "Courier Prime", category: "monospace" },
];

const CATEGORIES = ["all", "sans-serif", "serif", "display", "monospace"] as const;
type Category = (typeof CATEGORIES)[number];

interface FontPickerPanelProps {
  projectId: string;
  currentFilePath: string | null;
  onClose: () => void;
  onFontInjected?: () => void;
}

export function FontPickerPanel({
  projectId,
  currentFilePath,
  onClose,
  onFontInjected,
}: FontPickerPanelProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [injecting, setInjecting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Load font preview in the page head (just for the preview rendering)
  useEffect(() => {
    if (!selected) return;
    const id = `hf-font-preview-${selected.replace(/\s+/g, "-")}`;
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    const family = encodeURIComponent(selected);
    link.href = `https://fonts.googleapis.com/css2?family=${family}:wght@400;700&display=swap`;
    document.head.appendChild(link);
  }, [selected]);

  const filtered = useMemo(() => {
    return FONTS.filter((f) => {
      const matchCat = category === "all" || f.category === category;
      const matchQ = !query || f.name.toLowerCase().includes(query.toLowerCase());
      return matchCat && matchQ;
    });
  }, [query, category]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const injectFont = useCallback(async () => {
    if (!selected || !projectId || !currentFilePath) return;
    setInjecting(true);
    try {
      // Read current file
      const res = await fetch(`/api/projects/${projectId}/files/${currentFilePath}`);
      if (!res.ok) throw new Error(`Could not read ${currentFilePath}`);
      const data = (await res.json()) as { content?: string };
      const src = data.content ?? "";

      const family = selected;
      const urlFamily = family.replace(/\s+/g, "+");
      const linkTag = `<link href="https://fonts.googleapis.com/css2?family=${urlFamily}:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">`;

      // Don't add if already present
      if (src.includes(`family=${urlFamily}`)) {
        showToast(`${family} is already in this file`);
        setInjecting(false);
        return;
      }

      // Inject after <head> or before first style tag, or at top
      let newSrc: string;
      if (src.includes("</head>")) {
        newSrc = src.replace("</head>", `  ${linkTag}\n</head>`);
      } else if (src.includes("<head>")) {
        newSrc = src.replace("<head>", `<head>\n  ${linkTag}`);
      } else {
        newSrc = `${linkTag}\n${src}`;
      }

      // Write file
      const writeRes = await fetch(`/api/projects/${projectId}/files/${currentFilePath}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newSrc }),
      });
      if (!writeRes.ok) throw new Error("Write failed");

      showToast(`Added ${family} to ${currentFilePath}`);
      onFontInjected?.();
    } catch (err) {
      showToast(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setInjecting(false);
    }
  }, [selected, projectId, currentFilePath, onFontInjected]);

  const cssUsage = selected
    ? `font-family: '${selected}', ${FONTS.find((f) => f.name === selected)?.category ?? "sans-serif"};`
    : null;

  return (
    <div className="absolute right-0 top-10 bottom-0 w-80 z-30 flex flex-col border-l border-neutral-800 bg-neutral-950 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between h-9 px-3 border-b border-neutral-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-neutral-300">Tt</span>
          <span className="text-[11px] font-semibold text-neutral-300">Google Fonts</span>
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

      {/* Search + category filter */}
      <div className="px-3 py-2.5 border-b border-neutral-800/60 space-y-2 flex-shrink-0">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search fonts…"
          className="w-full h-7 px-2.5 rounded-md bg-neutral-800 border border-neutral-700 text-[11px] text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-studio-accent/50 transition-colors"
        />
        <div className="flex gap-1 flex-wrap">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`h-5 px-2 rounded text-[9px] font-medium capitalize transition-colors ${
                category === c
                  ? "bg-studio-accent/20 text-studio-accent border border-studio-accent/30"
                  : "bg-neutral-800 text-neutral-500 hover:text-neutral-300 border border-transparent"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Font list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-[11px] text-neutral-600">
            No fonts match
          </div>
        ) : (
          filtered.map((f) => (
            <button
              key={f.name}
              type="button"
              onClick={() => setSelected(f.name)}
              className={`w-full flex items-center justify-between px-3 py-2.5 text-left border-b border-neutral-800/40 transition-colors ${
                selected === f.name
                  ? "bg-studio-accent/10 border-l-2 border-l-studio-accent"
                  : "hover:bg-neutral-900"
              }`}
            >
              <div>
                <div
                  className="text-[13px] text-neutral-200"
                  style={{ fontFamily: `'${f.name}', ${f.category}` }}
                >
                  {f.name}
                </div>
                <div className="text-[9px] text-neutral-600 capitalize mt-0.5">{f.category}</div>
              </div>
              {selected === f.name && (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-studio-accent flex-shrink-0">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))
        )}
      </div>

      {/* Selected font preview + inject */}
      {selected && (
        <div className="flex-shrink-0 border-t border-neutral-800 p-3 space-y-2.5 bg-neutral-900/50">
          <div
            className="text-[22px] text-neutral-100 leading-tight"
            style={{ fontFamily: `'${selected}', sans-serif` }}
          >
            The quick brown fox
          </div>
          {cssUsage && (
            <div className="font-mono text-[9px] text-neutral-600 bg-neutral-800/60 rounded px-2 py-1 truncate">
              {cssUsage}
            </div>
          )}
          <button
            type="button"
            onClick={() => void injectFont()}
            disabled={injecting || !currentFilePath}
            className="w-full h-7 rounded-md text-[11px] font-semibold bg-studio-accent text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
            title={currentFilePath ? `Add to ${currentFilePath}` : "Open a file first"}
          >
            {injecting ? "Adding…" : currentFilePath ? `Add to ${currentFilePath}` : "Open a file first"}
          </button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="absolute bottom-4 left-3 right-3 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-[11px] text-neutral-200 text-center shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
