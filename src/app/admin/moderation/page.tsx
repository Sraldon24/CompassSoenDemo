/**
 * /admin/moderation — review queue for flagged community content.
 *
 * Each pending flag shows the reason + the flagged review's content. Admin
 * chooses: Keep (restore), Remove (hide this review), or Ban (hide all the
 * author's reviews).
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPendingFlags } from "@/lib/community/moderation";
import { ModerationButtons } from "./buttons";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Moderation — Admin",
};

export default async function ModerationPage(): Promise<React.ReactElement> {
  const flags = await getPendingFlags();

  return (
    <div className="px-4 md:px-8 py-6 md:py-10 max-w-[1100px] mx-auto space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Moderation queue</h1>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Flagged community content. Flagged items are hidden from public view until you resolve
          them.
        </p>
      </header>

      <section className="space-y-3">
        <h2
          className="text-sm font-medium uppercase tracking-wide"
          style={{ color: "var(--color-text-muted)" }}
        >
          Pending ({flags.length})
        </h2>

        {flags.length === 0 ? (
          <Card>
            <CardContent
              className="py-8 text-center text-sm"
              style={{ color: "var(--color-text-muted)" }}
            >
              Nothing flagged. The queue is clear.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {flags.map((flag) => (
              <Card key={flag.flagId}>
                <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                  <div className="space-y-1">
                    <CardTitle className="text-base">Flagged {flag.entityType}</CardTitle>
                    <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                      {flag.createdAt.toISOString().slice(0, 10)}
                    </div>
                  </div>
                  <ModerationButtons flagId={flag.flagId} />
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div>
                    <div
                      className="text-xs uppercase tracking-wide mb-1"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      Reason
                    </div>
                    <p>{flag.reason}</p>
                  </div>
                  {flag.reviewComment && (
                    <div>
                      <div
                        className="text-xs uppercase tracking-wide mb-1"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        Flagged content
                      </div>
                      <p
                        className="rounded px-3 py-2"
                        style={{ background: "var(--color-surface-muted)" }}
                      >
                        {flag.reviewComment}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
