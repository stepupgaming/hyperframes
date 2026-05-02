import { useState } from "react";

export interface AIConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export const DEFAULT_AI_CONFIG: AIConfig = {
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
};

export const AI_CONFIG_KEY = "hf-ai-config";

export function loadAIConfig(): AIConfig {
  try {
    const stored = localStorage.getItem(AI_CONFIG_KEY);
    if (stored) return { ...DEFAULT_AI_CONFIG, ...(JSON.parse(stored) as Partial<AIConfig>) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_AI_CONFIG };
}

export function saveAIConfig(config: AIConfig): void {
  localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(config));
}

interface AISettingsProps {
  onClose: () => void;
}

export function AISettings({ onClose }: AISettingsProps) {
  const [config, setConfig] = useState<AIConfig>(loadAIConfig);
  const [showKey, setShowKey] = useState(false);

  const save = () => {
    saveAIConfig(config);
    onClose();
  };

  const set = (k: keyof AIConfig, v: string) => setConfig((prev) => ({ ...prev, [k]: v }));

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[440px] rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
          <h2 className="text-sm font-semibold text-neutral-100">AI Provider Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-300 transition-colors"
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Base URL */}
          <div>
            <label className="block text-[11px] font-medium text-neutral-400 mb-1.5">
              Base URL
              <span className="ml-2 text-neutral-600 font-normal">
                OpenAI-compatible endpoint
              </span>
            </label>
            <input
              type="url"
              value={config.baseUrl}
              onChange={(e) => set("baseUrl", e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="w-full h-8 px-3 rounded-md bg-neutral-800 border border-neutral-700 text-[12px] text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-studio-accent/60 transition-colors"
            />
            <p className="mt-1 text-[10px] text-neutral-600">
              Works with OpenAI, Groq, OpenRouter, Ollama, LM Studio, etc.
            </p>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-[11px] font-medium text-neutral-400 mb-1.5">
              API Key
            </label>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={config.apiKey}
                onChange={(e) => set("apiKey", e.target.value)}
                placeholder="sk-..."
                className="w-full h-8 px-3 pr-9 rounded-md bg-neutral-800 border border-neutral-700 text-[12px] text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-studio-accent/60 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-600 hover:text-neutral-400 transition-colors"
                aria-label={showKey ? "Hide key" : "Show key"}
              >
                {showKey ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Model */}
          <div>
            <label className="block text-[11px] font-medium text-neutral-400 mb-1.5">
              Model
            </label>
            <input
              type="text"
              value={config.model}
              onChange={(e) => set("model", e.target.value)}
              placeholder="gpt-4o-mini"
              className="w-full h-8 px-3 rounded-md bg-neutral-800 border border-neutral-700 text-[12px] text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-studio-accent/60 transition-colors"
            />
            <p className="mt-1 text-[10px] text-neutral-600">
              Suggested: gpt-4o, gpt-4o-mini, claude-3-5-sonnet (via OpenRouter), gemini-2.0-flash
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-neutral-800">
          <button
            type="button"
            onClick={onClose}
            className="h-7 px-3 rounded-md text-[11px] font-medium text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            className="h-7 px-4 rounded-md text-[11px] font-semibold bg-studio-accent text-white hover:opacity-90 transition-opacity"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
