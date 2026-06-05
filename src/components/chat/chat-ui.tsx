"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SUGGESTED_QUESTIONS } from "@/lib/ai/prompts";
import { ArrowRight, Sparkles, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Array<{ id: string; label: string; url?: string }>;
}

const RATE_LIMIT_DAILY = 50;

/** Meridian compass mark: accent disc, ink ring, paper needle. */
function CompassMark({ size = 32 }: { size?: number }): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="20" cy="20" r="18" fill="var(--accent)" />
      <circle cx="20" cy="20" r="18" stroke="var(--ink)" strokeWidth="1.6" opacity="0.9" />
      <path d="M20 8 L24 20 L20 32 L16 20 Z" fill="var(--on-accent)" opacity="0.95" />
      <path d="M20 8 L24 20 L20 20 Z" fill="var(--ink)" opacity="0.35" />
      <circle cx="20" cy="20" r="2.2" fill="var(--ink)" />
    </svg>
  );
}

/**
 * Render assistant text with Meridian flair: paragraph blocks, **bold** runs,
 * and numbered/lettered citation chips ([E1], [1]) that scroll to their source.
 */
function renderRich(text: string, onCite: (id: string) => void): React.ReactNode {
  const blocks = text.split("\n\n");
  return blocks.map((block, bi) => {
    const parts = block
      .split(/(\*\*[^*]+\*\*|\[E\d+\]|\[\d+\])/g)
      .filter((p): p is string => Boolean(p));
    return (
      <p
        // biome-ignore lint/suspicious/noArrayIndexKey: rich-text blocks are positional
        key={bi}
        className="text-[15.5px] leading-[1.62]"
        style={{ marginBottom: bi < blocks.length - 1 ? 12 : 0, color: "var(--ink)" }}
      >
        {parts.map((part, i) => {
          if (/^\*\*[^*]+\*\*$/.test(part)) {
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: positional text run
              <strong key={i} className="font-[750]">
                {part.slice(2, -2)}
              </strong>
            );
          }
          const m = part.match(/^\[(E?\d+)\]$/);
          const id = m?.[1];
          if (id) {
            return (
              <sup
                // biome-ignore lint/suspicious/noArrayIndexKey: positional text run
                key={i}
                className="mx-px"
              >
                <button
                  type="button"
                  onClick={() => onCite(id)}
                  className="mono cursor-pointer rounded-[5px] border px-[5px] py-px align-baseline text-[10.5px] font-bold"
                  style={{
                    background: "var(--accent-soft)",
                    color: "var(--accent-deep)",
                    borderColor: "color-mix(in oklch, var(--accent) 35%, transparent)",
                  }}
                >
                  {id}
                </button>
              </sup>
            );
          }
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: positional text run
            <Fragment key={i}>{part}</Fragment>
          );
        })}
      </p>
    );
  });
}

/** A single citation source: numbered accent chip + label, on a surface tile. */
function SourceRow({
  source,
}: {
  source: { id: string; label: string; url?: string };
}): React.ReactElement {
  const base =
    "flex items-start gap-2.5 rounded-[var(--r-sm)] border-[1.5px] border-[var(--line)] px-2.5 py-2";
  const chip = (
    <span
      className="mono mt-px shrink-0 rounded-[5px] px-1.5 py-0.5 text-[10.5px] font-bold"
      style={{ background: "var(--accent)", color: "var(--on-accent)" }}
    >
      {source.id}
    </span>
  );
  const label = (
    <span className="text-[12.5px] leading-[1.4]" style={{ color: "var(--ink-2)" }}>
      {source.label}
    </span>
  );
  if (source.url) {
    return (
      <a
        id={`cite-${source.id}`}
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`${base} transition-colors hover:border-[var(--line-strong)]`}
        style={{ background: "var(--surface-2)" }}
      >
        {chip}
        {label}
      </a>
    );
  }
  return (
    <div id={`cite-${source.id}`} className={base} style={{ background: "var(--surface-2)" }}>
      {chip}
      {label}
    </div>
  );
}

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

  // Briefly flash a source row when its inline citation chip is clicked.
  const onCite = (id: string) => {
    const el = document.getElementById(`cite-${id}`);
    if (el) {
      el.style.transition = "background .3s";
      const o = el.style.background;
      el.style.background = "var(--accent-soft)";
      setTimeout(() => {
        el.style.background = o;
      }, 900);
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col" style={{ background: "var(--paper)" }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-7 py-4"
        style={{ borderBottom: "1.5px solid var(--line)", background: "var(--paper)" }}
      >
        <div className="flex items-center gap-3">
          <CompassMark size={30} />
          <div>
            <h1 className="font-[var(--font-display)] text-lg tracking-[-0.02em]">Ask Compass</h1>
            <p className="mt-0.5 text-xs" style={{ color: "var(--ink-3)" }}>
              AI assistant trained on your plan + Concordia course catalog
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {remaining !== null && (
            <span className="mono tnum text-xs" style={{ color: "var(--ink-3)" }}>
              {remaining} / {RATE_LIMIT_DAILY} today
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
      <div className="scroll flex-1 overflow-y-auto px-7 pt-7 pb-2">
        {messages.length === 0 ? (
          <div className="mx-auto max-w-[760px]">
            <div className="rise pt-[6vh] text-center">
              <div className="mb-[18px] inline-flex">
                <CompassMark size={56} />
              </div>
              <h2 className="mb-2.5 font-[var(--font-display)] text-[30px] tracking-[-0.03em]">
                Ask Compass anything
              </h2>
              <p
                className="mx-auto mb-7 max-w-[480px] text-[16px] leading-[1.55]"
                style={{ color: "var(--ink-2)" }}
              >
                Grounded in the Concordia catalog and <em>your</em> plan. Every answer cites its
                sources.
              </p>
              <div className="stagger mx-auto grid max-w-[560px] grid-cols-1 gap-[11px] sm:grid-cols-2">
                {SUGGESTED_QUESTIONS.map((q, i) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => send(q)}
                    style={{ ["--i" as string]: i }}
                    className="card lift group flex items-center gap-[11px] px-4 py-[14px] text-left text-sm font-[550] transition-all hover:-translate-y-0.5 hover:border-[var(--line-strong)] hover:shadow-[var(--hard-shadow)] focus-visible:outline-none"
                  >
                    <span className="flex" style={{ color: "var(--accent-deep)" }}>
                      <Sparkles className="h-[17px] w-[17px]" />
                    </span>
                    <span className="flex-1" style={{ color: "var(--ink)" }}>
                      {q}
                    </span>
                    <ArrowRight className="h-[15px] w-[15px]" style={{ color: "var(--ink-3)" }} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-[760px] flex-col gap-[18px]">
            {messages.map((m) => (
              <article key={m.id} className="fade" data-role={m.role}>
                {m.role === "user" ? (
                  <div className="flex justify-end">
                    <div
                      className="max-w-[82%] px-4 py-[11px] text-[15px] font-medium"
                      style={{
                        borderRadius: "var(--r-lg) var(--r-lg) 4px var(--r-lg)",
                        background: "var(--ink)",
                        color: "var(--paper)",
                        boxShadow: "var(--hard-shadow)",
                      }}
                    >
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-[13px]">
                    <div className="mt-0.5 shrink-0" aria-hidden>
                      <CompassMark size={32} />
                    </div>
                    <div
                      className="card card-hard min-w-0 flex-1 px-[18px] py-4"
                      style={{ borderRadius: "4px var(--r-lg) var(--r-lg) var(--r-lg)" }}
                    >
                      {m.content === "" ? (
                        <div className="space-y-2">
                          <div
                            className="flex items-center gap-2.5 text-sm"
                            style={{ color: "var(--ink-3)" }}
                            aria-live="polite"
                          >
                            <span className="flex gap-1" aria-hidden>
                              <span
                                className="h-[7px] w-[7px] rounded-full animate-bounce [animation-delay:-0.3s]"
                                style={{ background: "var(--accent)" }}
                              />
                              <span
                                className="h-[7px] w-[7px] rounded-full animate-bounce [animation-delay:-0.15s]"
                                style={{ background: "var(--accent)" }}
                              />
                              <span
                                className="h-[7px] w-[7px] rounded-full animate-bounce"
                                style={{ background: "var(--accent)" }}
                              />
                            </span>
                            Compass is thinking… this can take a few seconds.
                          </div>
                          <Skeleton className="h-3 w-3/4" />
                          <Skeleton className="h-3 w-1/2" />
                        </div>
                      ) : (
                        <>
                          {renderRich(m.content, onCite)}
                          {m.sources && m.sources.length > 0 && (
                            <div
                              className="mt-4 pt-3.5"
                              style={{ borderTop: "1.5px dashed var(--line-strong)" }}
                            >
                              <div className="eyebrow mb-[9px]">Sources</div>
                              <div className="flex flex-col gap-[7px]">
                                {m.sources.map((s) => (
                                  <SourceRow key={s.id} source={s} />
                                ))}
                              </div>
                            </div>
                          )}
                          <div
                            className="mt-3 flex items-center gap-1 pt-2.5"
                            style={{ borderTop: "1.5px solid var(--line)" }}
                          >
                            <button
                              type="button"
                              aria-label="Helpful"
                              className="pressable rounded-[var(--r-sm)] p-1.5 transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--accent-deep)]"
                              style={{ color: "var(--ink-3)" }}
                            >
                              <ThumbsUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label="Not helpful"
                              className="pressable rounded-[var(--r-sm)] p-1.5 transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--accent-deep)]"
                              style={{ color: "var(--ink-3)" }}
                            >
                              <ThumbsDown className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </article>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Composer */}
      <form
        onSubmit={onSubmit}
        className="px-7 pt-3 pb-[22px]"
        style={{ borderTop: "1.5px solid var(--line)", background: "var(--paper)" }}
      >
        <div className="mx-auto max-w-[760px]">
          <div
            className="card flex items-end gap-2.5 py-2 pr-2 pl-4"
            style={{ borderColor: "var(--line-strong)" }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Ask about prerequisites, workload, electives…"
              rows={2}
              className="flex-1 resize-none border-0 bg-transparent py-2 text-[15.5px] focus-visible:outline-none"
              style={{ color: "var(--ink)", fontFamily: "var(--font-ui)" }}
              disabled={pending}
            />
            <Button
              type="submit"
              variant="accent"
              disabled={pending || !input.trim()}
              className="pressable shrink-0 self-end"
            >
              <ArrowRight className="mr-1.5 h-4 w-4" />
              Send
            </Button>
          </div>
          <p
            className="mx-auto mt-[9px] text-center text-[11.5px]"
            style={{ color: "var(--ink-3)" }}
          >
            Compass routes simple lookups to a fast model and strategy questions to a smarter one ·
            ⌘+Enter to send · answers can be wrong even when cited
          </p>
        </div>
      </form>
    </div>
  );
}
