import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { EmailDraftAssistant } from "@/components/emails/email-draft-assistant";
import { EmailTemplateList } from "@/components/emails/email-template-list";
import { getSession } from "@/lib/auth/get-session";
import { Mail } from "lucide-react";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Emails",
};

interface EmailTemplate {
  id: string;
  category: string;
  title: string;
  to: string;
  subject: string;
  body: string;
}

function loadTemplates(): EmailTemplate[] {
  const path = resolve(process.cwd(), "data/seed/email-templates.json");
  return JSON.parse(readFileSync(path, "utf8"));
}

export default async function EmailsPage(): Promise<React.ReactElement> {
  const session = await getSession();
  if (!session) redirect("/login");

  const templates = loadTemplates();
  // Pre-fill the user's name and student-id-style placeholder for convenience.
  const userName = session.user.name ?? "[Your name]";

  return (
    <div className="px-4 md:px-8 py-6 md:py-10 max-w-[1280px] mx-auto space-y-8">
      <header
        className="relative overflow-hidden rounded-2xl ring-hairline shadow-[var(--shadow-md)] p-6 sm:p-8 animate-rise"
        style={{ background: "var(--gradient-surface)" }}
      >
        <div className="absolute inset-0 bg-gradient-hero" aria-hidden />
        <div className="relative space-y-3">
          <p className="eyebrow">Outreach</p>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-[-0.02em] flex items-center gap-3">
            <span
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl ring-hairline text-white shadow-[var(--shadow-sm)]"
              style={{ backgroundImage: "var(--gradient-accent)" }}
            >
              <Mail className="h-5 w-5" />
            </span>
            Email Templates
          </h1>
          <p className="text-sm max-w-2xl" style={{ color: "var(--color-text-muted)" }}>
            Pre-drafted emails for advisors, professors, and the co-op office. Click to copy or open
            in your mail app — edit the bracketed parts before sending.
          </p>
        </div>
      </header>

      <EmailDraftAssistant />

      <EmailTemplateList templates={templates} userName={userName} />
    </div>
  );
}
