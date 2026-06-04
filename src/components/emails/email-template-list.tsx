"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy, ExternalLink } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface EmailTemplate {
  id: string;
  category: string;
  title: string;
  to: string;
  subject: string;
  body: string;
}

interface Props {
  templates: EmailTemplate[];
  userName: string;
}

function applyVariables(body: string, userName: string): string {
  return body.replaceAll("[Your name]", userName);
}

export function EmailTemplateList({ templates, userName }: Props): React.ReactElement {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const groups = templates.reduce<Map<string, EmailTemplate[]>>((acc, t) => {
    if (!acc.has(t.category)) acc.set(t.category, []);
    acc.get(t.category)?.push(t);
    return acc;
  }, new Map());

  const copy = async (template: EmailTemplate) => {
    const body = applyVariables(template.body, userName);
    const full = `Subject: ${template.subject}\n\n${body}`;
    await navigator.clipboard.writeText(full);
    toast.success(`Copied "${template.title}"`);
  };

  const openMail = (template: EmailTemplate) => {
    const body = encodeURIComponent(applyVariables(template.body, userName));
    const subject = encodeURIComponent(template.subject);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  return (
    <div className="space-y-8">
      {[...groups.entries()].map(([category, items]) => (
        <section key={category} className="space-y-3 animate-rise">
          <h2 className="eyebrow">{category}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 stagger">
            {items.map((t, index) => {
              const isExpanded = expandedId === t.id;
              const body = applyVariables(t.body, userName);
              return (
                <Card
                  key={t.id}
                  className="lift ring-hairline shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-glow)]"
                  style={{ ["--i" as string]: index }}
                >
                  <CardHeader>
                    <CardTitle className="text-base flex items-baseline gap-2">
                      <span>{t.title}</span>
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-md ring-hairline uppercase tracking-wide"
                        style={{
                          background: "var(--color-accent-soft)",
                          color: "var(--color-accent)",
                        }}
                      >
                        to: {t.to}
                      </span>
                    </CardTitle>
                    <CardDescription className="mono tnum text-xs">
                      Subject: {t.subject}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {isExpanded && (
                      <pre
                        className="text-xs whitespace-pre-wrap rounded-xl ring-hairline shadow-[var(--shadow-sm)] p-3.5 max-h-72 overflow-y-auto scroll-slim"
                        style={{
                          background: "var(--color-surface-2)",
                        }}
                      >
                        {body}
                      </pre>
                    )}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setExpandedId(isExpanded ? null : t.id)}
                      >
                        {isExpanded ? "Hide" : "Preview"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => copy(t)}>
                        <Copy className="h-3.5 w-3.5 mr-1.5" />
                        Copy
                      </Button>
                      <Button size="sm" onClick={() => openMail(t)}>
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                        Open in mail
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
