"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SUGGESTED_QUESTIONS } from "@/lib/ai/prompts";
import { Send, Sparkles, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Array<{ id: string; label: string; url?: string }>;
}

const RATE_LIMIT_DAILY = 50;

export function ChatUI(): React.ReactElement {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Scroll to bottom as messages stream in.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on every messages change is intentional
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || pending) return;

      const userMsg: Message = {
        id: `u-${Date.now()}`,
        role: "user",
        content: trimmed,
      };
      const assistantId = `a-${Date.now()}`;
      const assistantMsg: Message = { id: assistantId, role: "assistant", content: "" };

      setMessages((m) => [...m, userMsg, assistantMsg]);
      setInput("");
      setPending(true);

      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Omit conversationId entirely until the server hands us one — sending
          // an explicit null tripped the request validator.
          body: JSON.stringify(
            conversationId ? { message: trimmed, conversationId } : { message: trimmed },
          ),
        });

        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `Chat failed (${res.status})`);
        }

        const newConvId = res.headers.get("X-Conversation-Id");
        if (newConvId) setConversationId(newConvId);

        const remainingHeader = res.headers.get("X-Rate-Limit-Remaining");
        if (remainingHeader) setRemaining(Number(remainingHeader));

        const sourcesHeader = res.headers.get("X-Sources");
        let sources: Message["sources"];
        if (sourcesHeader) {
          try {
            sources = JSON.parse(atob(sourcesHeader));
          } catch {
            // ignore
          }
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response stream");
        const decoder = new TextDecoder();
        let accumulated = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accumulated += decoder.decode(value, { stream: true });
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: accumulated } : m)),
          );
        }

        if (sources) {
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, sources } : m)));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Chat failed";
        toast.error(msg);
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      } finally {
        setPending(false);
      }
    },
    [conversationId, pending],
  );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    send(input);
  };

  const clearChat = () => {
    setMessages([]);
    setConversationId(null);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div
        className="flex items-center justify-between px-6 py-4 ring-hairline shadow-[var(--shadow-sm)] backdrop-blur-md"
        style={{
          background: "color-mix(in oklch, var(--color-bg) 80%, transparent)",
        }}
      >
        <div>
          <h1 className="flex items-center gap-2.5 text-lg font-semibold tracking-[-0.01em]">
            <span
              className="inline-flex h-7 w-7 items-center justify-center rounded-xl text-white shadow-[0_0_14px_var(--color-accent-ring)]"
              style={{ backgroundImage: "var(--gradient-accent)" }}
            >
              <Sparkles className="h-4 w-4" />
            </span>
            Ask Compass
          </h1>
          <p className="mt-0.5 text-xs" style={{ color: "var(--color-text-muted)" }}>
            AI assistant trained on your plan + Concordia course catalog
          </p>
        </div>
        <div className="flex items-center gap-2">
          {remaining !== null && (
            <span className="text-xs mono tnum" style={{ color: "var(--color-text-muted)" }}>
              {remaining} / {RATE_LIMIT_DAILY} messages today
            </span>
          )}
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearChat}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {messages.length === 0 ? (
          <div className="max-w-2xl mx-auto space-y-4 animate-rise">
            <p className="eyebrow">ASK COMPASS</p>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-[-0.02em]">
              Hi — what would you like to <span className="text-gradient">plan?</span>
            </h2>
            <p style={{ color: "var(--color-text-muted)" }}>
              Try asking about prereqs, electives, or your current plan. I'll cite where each answer
              comes from.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-4 stagger">
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => send(q)}
                  style={{ ["--i" as string]: i, background: "var(--gradient-surface)" }}
                  className="lift group flex items-center justify-between gap-2 text-left rounded-xl ring-hairline shadow-[var(--shadow-sm)] px-4 py-3.5 text-sm transition-shadow hover:shadow-[var(--shadow-glow)] focus-visible:outline-none"
                >
                  <span style={{ color: "var(--color-text)" }}>{q}</span>
                  <Send
                    className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                    style={{ color: "var(--color-accent)" }}
                  />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.map((m) => (
              <article key={m.id} className="flex gap-3 animate-rise" data-role={m.role}>
                {/* Avatar */}
                <div
                  className={
                    m.role === "assistant"
                      ? "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold shadow-[0_0_14px_var(--color-accent-ring)]"
                      : "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ring-hairline"
                  }
                  style={
                    m.role === "assistant"
                      ? { backgroundImage: "var(--gradient-accent)", color: "white" }
                      : { background: "var(--color-surface-2)", color: "var(--color-text-muted)" }
                  }
                  aria-hidden
                >
                  {m.role === "assistant" ? <Sparkles className="h-4 w-4" /> : "You"}
                </div>

                <div className="flex-1 min-w-0 space-y-2">
                  <div
                    className="text-[11px] uppercase tracking-wide font-medium"
                    style={{
                      color: m.role === "user" ? "var(--color-text-subtle)" : "var(--color-accent)",
                    }}
                  >
                    {m.role === "user" ? "You" : "Compass"}
                  </div>
                  {m.content === "" && m.role === "assistant" ? (
                    <div
                      className="space-y-2 rounded-xl rounded-tl-sm ring-hairline shadow-[var(--shadow-sm)] p-3.5"
                      style={{
                        background: "var(--color-surface)",
                      }}
                    >
                      <div
                        className="flex items-center gap-2 text-sm"
                        style={{ color: "var(--color-text-muted)" }}
                        aria-live="polite"
                      >
                        <span className="flex gap-1" aria-hidden>
                          <span
                            className="h-1.5 w-1.5 rounded-full animate-bounce [animation-delay:-0.3s]"
                            style={{ background: "var(--color-accent)" }}
                          />
                          <span
                            className="h-1.5 w-1.5 rounded-full animate-bounce [animation-delay:-0.15s]"
                            style={{ background: "var(--color-accent)" }}
                          />
                          <span
                            className="h-1.5 w-1.5 rounded-full animate-bounce"
                            style={{ background: "var(--color-accent)" }}
                          />
                        </span>
                        Compass is thinking… this can take a few seconds.
                      </div>
                      <Skeleton className="h-3 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  ) : (
                    <div
                      className={
                        m.role === "user"
                          ? "prose-sm whitespace-pre-wrap rounded-xl rounded-tr-sm shadow-[var(--shadow-sm)] p-3.5 text-[15px] leading-relaxed ring-1 ring-[color-mix(in_oklch,var(--color-accent)_22%,transparent)]"
                          : "prose-sm whitespace-pre-wrap rounded-xl rounded-tl-sm ring-hairline shadow-[var(--shadow-sm)] p-3.5 text-[15px] leading-relaxed"
                      }
                      style={
                        m.role === "user"
                          ? {
                              background: "var(--gradient-accent-soft)",
                              color: "var(--color-text)",
                            }
                          : {
                              background: "var(--color-surface)",
                              color: "var(--color-text)",
                            }
                      }
                    >
                      {m.content}
                    </div>
                  )}
                  {m.sources && m.sources.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {m.sources.map((s) => (
                        <a
                          key={s.id}
                          href={s.url ?? "#"}
                          target={s.url ? "_blank" : undefined}
                          rel="noopener noreferrer"
                          className="inline-flex items-center text-[11px] px-2.5 py-0.5 rounded-full ring-hairline transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-accent)]"
                          style={{
                            background: "var(--color-surface)",
                            color: "var(--color-text-muted)",
                          }}
                        >
                          {s.label}
                        </a>
                      ))}
                    </div>
                  )}
                  {m.role === "assistant" && m.content !== "" && (
                    <div className="flex items-center gap-1 pt-1">
                      <button
                        type="button"
                        aria-label="Helpful"
                        className="pressable p-1.5 rounded-lg transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-accent)]"
                        style={{ color: "var(--color-text-subtle)" }}
                      >
                        <ThumbsUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Not helpful"
                        className="pressable p-1.5 rounded-lg transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-accent)]"
                        style={{ color: "var(--color-text-subtle)" }}
                      >
                        <ThumbsDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </article>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Composer */}
      <form
        onSubmit={onSubmit}
        className="px-6 py-4 ring-hairline"
        style={{
          background: "color-mix(in oklch, var(--color-bg) 80%, transparent)",
        }}
      >
        <div className="max-w-3xl mx-auto glass flex gap-2 rounded-xl ring-hairline shadow-[var(--shadow-md)] p-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="Ask anything about your degree plan…"
            rows={2}
            className="flex-1 resize-none rounded-lg border-0 bg-transparent px-2.5 py-1.5 text-sm focus-visible:outline-none"
            style={{
              color: "var(--color-text)",
            }}
            disabled={pending}
          />
          <Button
            type="submit"
            variant="accent"
            disabled={pending || !input.trim()}
            className="pressable shrink-0 self-end shadow-[0_0_14px_var(--color-accent-ring)]"
          >
            <Send className="h-4 w-4 mr-1.5" />
            Send
          </Button>
        </div>
        <p
          className="max-w-3xl mx-auto mt-2 text-[10px]"
          style={{ color: "var(--color-text-muted)" }}
        >
          ⌘+Enter to send. Compass cites sources but can still be wrong — verify with your advisor.
        </p>
      </form>
    </div>
  );
}
