"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Copy, Sparkles, Wand2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Recipient = "advisor" | "professor" | "coop-office" | "department" | "other";

export function EmailDraftAssistant(): React.ReactElement {
  const [situation, setSituation] = useState("");
  const [recipient, setRecipient] = useState<Recipient>("advisor");
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);

  const generate = async () => {
    if (situation.trim().length < 10) {
      toast.error("Describe the situation in at least 10 characters.");
      return;
    }
    setPending(true);
    setDraft("");
    try {
      const res = await fetch("/api/ai/draft-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ situation, recipientRole: recipient }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Failed to draft email");
      }
      const data = (await res.json()) as { draft: string };
      setDraft(data.draft);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to draft email");
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4" style={{ color: "var(--color-accent)" }} />
          AI Email Draft
        </CardTitle>
        <CardDescription>
          Describe what you need to write — Compass drafts a professional version. Edit the
          bracketed placeholders before sending.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="situation">Your situation</Label>
            <textarea
              id="situation"
              value={situation}
              onChange={(e) => setSituation(e.target.value)}
              placeholder="I need to ask my COMP 352 professor for an extension on the midterm because…"
              rows={4}
              className="w-full resize-none rounded-md border px-3 py-2 text-sm focus-visible:outline-none"
              style={{
                background: "var(--color-surface)",
                borderColor: "var(--color-border)",
                color: "var(--color-text)",
              }}
              disabled={pending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="recipient">Recipient</Label>
            <select
              id="recipient"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value as Recipient)}
              className="w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none"
              style={{
                background: "var(--color-surface)",
                borderColor: "var(--color-border)",
                color: "var(--color-text)",
              }}
              disabled={pending}
            >
              <option value="advisor">Advisor</option>
              <option value="professor">Professor</option>
              <option value="coop-office">Co-op office</option>
              <option value="department">Department</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        <Button onClick={generate} disabled={pending} className="w-full sm:w-auto">
          <Wand2 className="mr-2 h-4 w-4" />
          {pending ? "Drafting…" : "Draft email"}
        </Button>

        {draft && (
          <div className="space-y-2">
            <Label>Draft (edit before sending)</Label>
            <pre
              className="text-xs whitespace-pre-wrap rounded-md border p-3 max-h-96 overflow-y-auto"
              style={{
                background: "var(--color-surface-2)",
                borderColor: "var(--color-border)",
              }}
            >
              {draft}
            </pre>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                await navigator.clipboard.writeText(draft);
                toast.success("Draft copied");
              }}
            >
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Copy draft
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
