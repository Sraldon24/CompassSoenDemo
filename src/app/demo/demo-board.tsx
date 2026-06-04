"use client";

import { Button } from "@/components/ui/button";
import {
  DEMO_AI_COUNTER_KEY,
  DEMO_AI_MESSAGE_CAP,
  DEMO_CATALOG,
  DEMO_PLAN,
  DEMO_TERMS,
} from "@/lib/demo/sample-plan";
import { buildPlan, groupByTerm, validatePlan } from "@/lib/validation/plan";
import { useMemo, useState } from "react";

export function DemoBoard(): React.ReactElement {
  // Validation runs on the pure engine — same code the real planner uses.
  const { issuesByTerm, issuesByCourse } = useMemo(() => {
    const plan = buildPlan(DEMO_PLAN, DEMO_CATALOG);
    const issues = validatePlan(plan);
    const byCourse = new Map<string, number>();
    const byTerm = new Map<string, number>();
    for (const issue of issues) {
      if (issue.courseCode)
        byCourse.set(issue.courseCode, (byCourse.get(issue.courseCode) ?? 0) + 1);
      byTerm.set(issue.term, (byTerm.get(issue.term) ?? 0) + 1);
    }
    return { issuesByTerm: byTerm, issuesByCourse: byCourse, allIssues: issues };
  }, []);

  const grouped = useMemo(() => groupByTerm(DEMO_PLAN), []);
  const catalogMap = useMemo(() => new Map(DEMO_CATALOG.map((c) => [c.code, c])), []);

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 stagger">
        {DEMO_TERMS.map((term, ti) => {
          const courses = grouped.get(term) ?? [];
          const credits = courses.reduce(
            (sum, c) => sum + (catalogMap.get(c.courseCode)?.credits ?? 0),
            0,
          );
          return (
            <div
              key={term}
              style={{ ["--i" as string]: ti, background: "var(--gradient-surface)" }}
              className="rounded-xl ring-hairline shadow-[var(--shadow-sm)] p-3 space-y-2"
            >
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-semibold">{term}</h3>
                <span className="text-xs mono tnum" style={{ color: "var(--color-text-muted)" }}>
                  {credits} cr
                </span>
              </div>
              {courses.map((c) => {
                const entry = catalogMap.get(c.courseCode);
                const hasIssue = (issuesByCourse.get(c.courseCode) ?? 0) > 0;
                return (
                  <div
                    key={c.courseCode}
                    className="rounded-lg px-2 py-1.5 text-sm ring-hairline"
                    style={{
                      background: "var(--color-surface-2)",
                      borderLeft: hasIssue
                        ? "3px solid var(--color-warning)"
                        : "3px solid transparent",
                    }}
                  >
                    <div className="mono tnum text-xs">{c.courseCode}</div>
                    <div className="text-xs truncate" style={{ color: "var(--color-text-muted)" }}>
                      {entry?.title}
                    </div>
                  </div>
                );
              })}
              {(issuesByTerm.get(term) ?? 0) > 0 && (
                <div className="text-xs" style={{ color: "var(--color-warning)" }}>
                  {issuesByTerm.get(term)} planning note{issuesByTerm.get(term) === 1 ? "" : "s"}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <DemoChat />
    </div>
  );
}

function DemoChat(): React.ReactElement {
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; text: string }>>([
    {
      role: "assistant",
      text: 'Hi! I\'m Compass. Ask me anything about this sample SOEN plan — like "when can I take COMP 472?" (demo gives you a few questions; sign up for unlimited).',
    },
  ]);
  const [input, setInput] = useState("");
  const [used, setUsed] = useState(0);
  const [pending, setPending] = useState(false);

  const remaining = DEMO_AI_MESSAGE_CAP - used;

  const send = async () => {
    const q = input.trim();
    if (!q || remaining <= 0 || pending) return;

    // Persist a per-session counter so a refresh doesn't reset the cap.
    const prior = Number.parseInt(sessionStorage.getItem(DEMO_AI_COUNTER_KEY) ?? "0", 10) || 0;
    if (prior >= DEMO_AI_MESSAGE_CAP) {
      setUsed(DEMO_AI_MESSAGE_CAP);
      return;
    }

    setMessages((m) => [...m, { role: "user", text: q }]);
    setInput("");
    setPending(true);

    try {
      const res = await fetch("/api/demo/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q }),
      });
      const data: { payload?: { reply?: string } | null; error?: string | null } = await res
        .json()
        .catch(() => ({}));
      const reply = res.ok
        ? (data.payload?.reply ?? "Sorry, I couldn't answer that.")
        : data.error === "demo_limit"
          ? "You've used all your demo questions. Sign up free for unlimited chat!"
          : "Something went wrong. Try signing up for the full experience.";
      setMessages((m) => [...m, { role: "assistant", text: reply }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "Network error — please try again." }]);
    } finally {
      const next = prior + 1;
      sessionStorage.setItem(DEMO_AI_COUNTER_KEY, String(next));
      setUsed(next);
      setPending(false);
    }
  };

  return (
    <div
      className="rounded-xl ring-hairline shadow-[var(--shadow-sm)] overflow-hidden"
      style={{ background: "var(--color-surface)" }}
    >
      <div
        className="px-4 py-2 border-b text-sm font-medium"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface-2)" }}
      >
        Ask Compass {remaining > 0 ? `(${remaining} left)` : "(limit reached)"}
      </div>
      <div className="scroll-slim max-h-72 overflow-y-auto p-4 space-y-3">
        {messages.map((m, i) => (
          <div
            key={`${m.role}-${i}`}
            className="text-sm"
            style={{ color: m.role === "user" ? "var(--color-text)" : "var(--color-text-muted)" }}
          >
            <span className="font-medium">{m.role === "user" ? "You" : "Compass"}:</span> {m.text}
          </div>
        ))}
      </div>
      <div className="flex gap-2 p-3 border-t" style={{ borderColor: "var(--color-border)" }}>
        <input
          className="flex-1 rounded-lg ring-hairline px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--color-accent-ring)]"
          style={{ background: "var(--color-surface-2)" }}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={remaining > 0 ? "Ask about this plan…" : "Sign up for unlimited questions"}
          disabled={remaining <= 0 || pending}
        />
        <Button
          size="sm"
          className="pressable"
          onClick={send}
          disabled={remaining <= 0 || pending || !input.trim()}
        >
          {pending ? "…" : "Send"}
        </Button>
      </div>
    </div>
  );
}
