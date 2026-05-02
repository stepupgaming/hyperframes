import {
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { AISettings, loadAIConfig, type AIConfig } from "./AISettings";

// ── Types ─────────────────────────────────────────────────────────────────────

interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCallSpec[];
  tool_call_id?: string;
  name?: string;
}

interface ToolCallSpec {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface ToolCallDisplay {
  id: string;
  name: string;
  args: string;
  result?: string;
  status: "running" | "done" | "error";
}

interface DisplayMessage {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallDisplay[];
}

// ── SSE stream parser ─────────────────────────────────────────────────────────

interface ParsedChunk {
  delta?: {
    content?: string;
    tool_calls?: Array<{
      index: number;
      id?: string;
      function?: { name?: string; arguments?: string };
    }>;
  };
  finish_reason: string | null;
}

function parseSSELine(line: string): ParsedChunk | null {
  if (!line.startsWith("data: ")) return null;
  const data = line.slice(6).trim();
  if (data === "[DONE]") return null;
  try {
    const parsed = JSON.parse(data) as { choices?: ParsedChunk[] };
    return parsed.choices?.[0] ?? null;
  } catch {
    return null;
  }
}

// ── Main component ────────────────────────────────────────────────────────────

interface AIPanelProps {
  projectId: string;
  onFileWritten?: () => void;
  initialMessage?: string;
}

const TOOL_LABELS: Record<string, string> = {
  list_files: "Listing project files",
  read_file: "Reading",
  write_file: "Writing",
  delete_file: "Deleting",
  screenshot_preview: "Screenshot",
};

function toolLabel(name: string, args: string): string {
  const base = TOOL_LABELS[name] ?? name;
  try {
    const parsed = JSON.parse(args) as Record<string, string>;
    if (parsed.path) return `${base} ${parsed.path}`;
  } catch {
    /* ignore */
  }
  return base;
}

export function AIPanel({ projectId, onFileWritten, initialMessage }: AIPanelProps) {
  const [config, setConfig] = useState<AIConfig>(loadAIConfig);
  const [showSettings, setShowSettings] = useState(false);
  const [messages, setMessages] = useState<OpenAIMessage[]>([]);
  const [display, setDisplay] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const autoSentRef = useRef(false);

  // ── Scroll to bottom on new messages ──────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [display]);

  // ── Chat history — load from localStorage on mount ─────────────────────────
  const historyKey = `hf-ai-history-${projectId}`;
  useEffect(() => {
    try {
      const saved = localStorage.getItem(historyKey);
      if (saved) {
        const parsed = JSON.parse(saved) as {
          messages?: OpenAIMessage[];
          display?: DisplayMessage[];
        };
        if (parsed.messages?.length) setMessages(parsed.messages);
        if (parsed.display?.length) setDisplay(parsed.display);
      }
    } catch {
      /* ignore corrupt */
    } finally {
      setHistoryLoaded(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Chat history — save on change ──────────────────────────────────────────
  useEffect(() => {
    if (!historyLoaded) return;
    try {
      if (messages.length > 0 || display.length > 0) {
        localStorage.setItem(historyKey, JSON.stringify({ messages, display }));
      }
    } catch {
      /* ignore quota */
    }
  }, [messages, display, historyKey, historyLoaded]);

  const reloadConfig = () => setConfig(loadAIConfig());

  // ── Execute a single tool call ─────────────────────────────────────────────

  const executeTool = useCallback(
    async (tc: ToolCallSpec): Promise<string> => {
      let args: Record<string, string> = {};
      try {
        args = JSON.parse(tc.function.arguments) as Record<string, string>;
      } catch {
        /* ignore bad JSON */
      }

      const res = await fetch("/api/ai/tool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          name: tc.function.name,
          args,
        }),
      });
      const data = (await res.json()) as { result?: string; error?: string };
      if (data.error) return `Error: ${data.error}`;
      return data.result ?? "";
    },
    [projectId],
  );

  // ── Agentic streaming loop ─────────────────────────────────────────────────

  const runLoop = useCallback(
    async (
      msgs: OpenAIMessage[],
      cfg: AIConfig,
      setStreamingDisplay: (
        fn: (prev: DisplayMessage[]) => DisplayMessage[],
      ) => void,
    ): Promise<OpenAIMessage[]> => {
      const abort = new AbortController();
      abortRef.current = abort;

      const res = await fetch("/api/ai/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abort.signal,
        body: JSON.stringify({ projectId, messages: msgs, settings: cfg }),
      });

      if (!res.ok) {
        const err = await res.text().catch(() => String(res.status));
        throw new Error(err);
      }

      // Accumulate streaming state
      let textAccum = "";
      const toolAccum: Map<
        number,
        { id: string; name: string; argsBuf: string }
      > = new Map();

      // Add a pending assistant message to display
      setStreamingDisplay((prev) => [
        ...prev,
        { role: "assistant", content: "", toolCalls: [] },
      ]);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let lineBuffer = "";
      let finishReason: string | null = null;

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        lineBuffer += decoder.decode(value, { stream: true });

        const lines = lineBuffer.split("\n");
        lineBuffer = lines.pop() ?? "";

        for (const line of lines) {
          const chunk = parseSSELine(line);
          if (!chunk) continue;

          finishReason = chunk.finish_reason;

          if (chunk.delta?.content) {
            textAccum += chunk.delta.content;
            setStreamingDisplay((prev) => {
              const updated = [...prev];
              const last = { ...updated[updated.length - 1] };
              last.content = textAccum;
              updated[updated.length - 1] = last;
              return updated;
            });
          }

          if (chunk.delta?.tool_calls) {
            for (const tc of chunk.delta.tool_calls) {
              let entry = toolAccum.get(tc.index);
              if (!entry) {
                entry = { id: tc.id ?? "", name: "", argsBuf: "" };
                toolAccum.set(tc.index, entry);
              }
              if (tc.id) entry.id = tc.id;
              if (tc.function?.name) entry.name += tc.function.name;
              if (tc.function?.arguments) entry.argsBuf += tc.function.arguments;
            }

            // Update display with running tool call stubs
            setStreamingDisplay((prev) => {
              const updated = [...prev];
              const last = { ...updated[updated.length - 1] };
              last.toolCalls = Array.from(toolAccum.values()).map((t) => ({
                id: t.id,
                name: t.name,
                args: t.argsBuf,
                status: "running" as const,
              }));
              updated[updated.length - 1] = last;
              return updated;
            });
          }

          if (finishReason) break outer;
        }
      }

      // Build the assistant message for the API messages array
      const toolCallSpecs: ToolCallSpec[] = Array.from(toolAccum.values()).map(
        (t) => ({
          id: t.id,
          type: "function" as const,
          function: { name: t.name, arguments: t.argsBuf },
        }),
      );

      const assistantMsg: OpenAIMessage = {
        role: "assistant",
        content: textAccum || null,
        ...(toolCallSpecs.length > 0 ? { tool_calls: toolCallSpecs } : {}),
      };

      let updatedMsgs = [...msgs, assistantMsg];

      // If there are tool calls, execute them and recurse
      if (toolCallSpecs.length > 0 && finishReason === "tool_calls") {
        let wroteFiles = false;

        // Collect all results first so vision messages can be injected after
        // all tool messages (required by the OpenAI message ordering rules).
        const toolResults: Array<{ tc: ToolCallSpec; result: string }> = [];

        for (const tc of toolCallSpecs) {
          // Mark as running in display
          setStreamingDisplay((prev) => {
            const updated = [...prev];
            const last = { ...updated[updated.length - 1] };
            last.toolCalls = last.toolCalls?.map((d) =>
              d.id === tc.id ? { ...d, status: "running" as const } : d,
            );
            updated[updated.length - 1] = last;
            return updated;
          });

          const result = await executeTool(tc);
          if (tc.function.name === "write_file") wroteFiles = true;
          toolResults.push({ tc, result });

          // Mark as done in display
          setStreamingDisplay((prev) => {
            const updated = [...prev];
            const last = { ...updated[updated.length - 1] };
            last.toolCalls = last.toolCalls?.map((d) =>
              d.id === tc.id
                ? { ...d, result, status: "done" as const }
                : d,
            );
            updated[updated.length - 1] = last;
            return updated;
          });
        }

        if (wroteFiles) onFileWritten?.();

        // Add tool result messages (screenshots use a text placeholder)
        for (const { tc, result } of toolResults) {
          const isScreenshot =
            tc.function.name === "screenshot_preview" && result.startsWith("data:image/");
          updatedMsgs = [
            ...updatedMsgs,
            {
              role: "tool" as const,
              tool_call_id: tc.id,
              name: tc.function.name,
              content: isScreenshot ? "Screenshot captured." : result,
            },
          ];
        }

        // Inject vision user messages for screenshots (AFTER all tool results)
        const screenshots = toolResults.filter(
          ({ tc, result }) =>
            tc.function.name === "screenshot_preview" && result.startsWith("data:image/"),
        );
        if (screenshots.length > 0) {
          updatedMsgs = [
            ...updatedMsgs,
            {
              role: "user" as const,
              content: [
                { type: "text", text: "Here is the current composition preview:" },
                ...screenshots.map(({ result }) => ({
                  type: "image_url" as const,
                  image_url: { url: result },
                })),
              ] as unknown as string,
            },
          ];
        }

        // Continue the loop (agent may call more tools or produce final answer)
        updatedMsgs = await runLoop(updatedMsgs, cfg, setStreamingDisplay);
      }

      return updatedMsgs;
    },
    [projectId, executeTool, onFileWritten],
  );

  // ── Send a message ─────────────────────────────────────────────────────────

  const send = useCallback(async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || streaming) return;
    if (!config.apiKey) {
      setShowSettings(true);
      return;
    }

    if (!override) setInput("");
    setError(null);
    setStreaming(true);

    const userMsg: OpenAIMessage = { role: "user", content: text };
    const userDisplay: DisplayMessage = { role: "user", content: text };

    setDisplay((prev) => [...prev, userDisplay]);
    const msgsForApi = [...messages, userMsg];

    try {
      const finalMsgs = await runLoop(msgsForApi, config, setDisplay);
      setMessages(finalMsgs);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, streaming, config, messages, runLoop]);

  // ── Auto-send initialMessage once if no existing history ──────────────────
  useEffect(() => {
    if (!initialMessage || autoSentRef.current || !historyLoaded) return;
    if (messages.length > 0) { autoSentRef.current = true; return; }
    if (!config.apiKey) return;
    autoSentRef.current = true;
    const timer = setTimeout(() => void send(initialMessage), 600);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessage, historyLoaded, config.apiKey]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    setStreaming(false);
  };

  const clear = () => {
    abortRef.current?.abort();
    setStreaming(false);
    setMessages([]);
    setDisplay([]);
    setError(null);
    autoSentRef.current = false;
    try { localStorage.removeItem(historyKey); } catch { /* ignore */ }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="flex items-center justify-between h-9 px-3 border-b border-neutral-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-studio-accent"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span className="text-[11px] font-semibold text-neutral-300">AI Agent</span>
          {streaming && (
            <span className="text-[10px] text-studio-accent animate-pulse">thinking…</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {display.length > 0 && (
            <button
              type="button"
              onClick={clear}
              className="h-6 px-2 text-[10px] text-neutral-600 hover:text-neutral-400 hover:bg-neutral-800 rounded transition-colors"
              title="Clear conversation"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="h-6 w-6 flex items-center justify-center text-neutral-600 hover:text-neutral-400 hover:bg-neutral-800 rounded transition-colors"
            aria-label="AI settings"
            title="AI settings"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4 text-[12px]">
        {display.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-8">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              className="text-neutral-700"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <div>
              <p className="text-neutral-500 font-medium">AI Agent</p>
              <p className="text-neutral-700 text-[11px] mt-0.5 max-w-[220px]">
                Ask me to create or edit compositions, add animations, fix timing…
              </p>
            </div>
            {!config.apiKey && (
              <button
                type="button"
                onClick={() => setShowSettings(true)}
                className="text-[11px] text-studio-accent hover:opacity-80 transition-opacity underline underline-offset-2"
              >
                Configure AI provider →
              </button>
            )}
          </div>
        )}

        {display.map((msg, i) => (
          <div key={i} className={msg.role === "user" ? "flex justify-end" : "space-y-2"}>
            {msg.role === "user" ? (
              <div className="max-w-[85%] bg-neutral-800 rounded-xl rounded-tr-sm px-3 py-2 text-neutral-200 leading-relaxed whitespace-pre-wrap">
                {msg.content}
              </div>
            ) : (
              <div className="space-y-2">
                {/* Tool calls */}
                {msg.toolCalls?.map((tc) => (
                  <div
                    key={tc.id}
                    className="flex items-start gap-2 bg-neutral-900/60 border border-neutral-800 rounded-lg px-3 py-2"
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      {tc.status === "running" ? (
                        <div className="w-3 h-3 rounded-full border-2 border-studio-accent border-t-transparent animate-spin" />
                      ) : tc.status === "error" ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-400">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="8" x2="12" y2="12" />
                          <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-studio-accent">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-[11px] text-neutral-400 font-mono">
                        {toolLabel(tc.name, tc.args)}
                      </span>
                      {/* Show screenshot inline */}
                      {tc.name === "screenshot_preview" &&
                        tc.result?.startsWith("data:image/") && (
                          <img
                            src={tc.result}
                            alt="Preview screenshot"
                            className="mt-1.5 w-full rounded border border-neutral-700"
                          />
                        )}
                    </div>
                  </div>
                ))}

                {/* Text response */}
                {msg.content && (
                  <div className="text-neutral-300 leading-relaxed whitespace-pre-wrap">
                    {msg.content}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {error && (
          <div className="bg-red-900/30 border border-red-800/50 rounded-lg px-3 py-2 text-red-300 text-[11px]">
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 border-t border-neutral-800 p-2">
        <div className="flex items-end gap-2 bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 focus-within:border-neutral-600 transition-colors">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask me to edit a composition…"
            disabled={streaming}
            rows={1}
            className="flex-1 resize-none bg-transparent text-[12px] text-neutral-200 placeholder-neutral-600 focus:outline-none leading-relaxed min-h-[20px] max-h-[120px] overflow-y-auto disabled:opacity-50"
            style={{
              height: "auto",
              minHeight: 20,
            }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
            }}
          />
          {streaming ? (
            <button
              type="button"
              onClick={stop}
              className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors"
              title="Stop"
            >
              <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
                <rect x="3" y="3" width="18" height="18" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void send()}
              disabled={!input.trim()}
              className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-lg bg-studio-accent/20 text-studio-accent hover:bg-studio-accent/30 disabled:opacity-30 transition-colors"
              title="Send (Enter · ⌘Enter for new line)"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          )}
        </div>
        <p className="text-[10px] text-neutral-700 mt-1 text-center">
          Enter to send · Shift+Enter for newline
        </p>
      </div>

      {/* Settings modal */}
      {showSettings && (
        <AISettings
          onClose={() => {
            setShowSettings(false);
            reloadConfig();
          }}
        />
      )}
    </div>
  );
}
