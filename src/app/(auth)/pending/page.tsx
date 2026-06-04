import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSession } from "@/lib/auth/get-session";
import { db } from "@/lib/data/db";
import { users } from "@/lib/data/schema";
import { eq } from "drizzle-orm";
import { Clock } from "lucide-react";
import { redirect } from "next/navigation";

export const metadata = { title: "Awaiting approval — Compass" };
export const dynamic = "force-dynamic";

/**
 * Holding screen for invite-only signups that haven't been approved yet.
 * Approved users are bounced into the app; anonymous users to /login.
 */
export default async function PendingPage(): Promise<React.ReactElement> {
  const session = await getSession();
  if (!session) redirect("/login");

  const [account] = await db
    .select({ status: users.status })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (account?.status === "approved") redirect("/dashboard");

  const rejected = account?.status === "rejected";

  return (
    <Card featured className="w-full">
      <CardHeader className="space-y-2.5">
        <div
          className="inline-flex h-12 w-12 items-center justify-center rounded-xl ring-hairline shadow-[var(--shadow-sm)]"
          style={{ background: "var(--gradient-accent-soft)", color: "var(--color-accent)" }}
        >
          <Clock className="h-6 w-6" aria-hidden />
        </div>
        <p className="eyebrow">{rejected ? "Access" : "Invite-only"}</p>
        <CardTitle className="text-2xl font-semibold tracking-[-0.02em]">
          {rejected ? "Access not granted" : "Awaiting approval"}
        </CardTitle>
        <CardDescription style={{ color: "var(--color-text-muted)" }}>
          {rejected
            ? "Your request to join Compass wasn't approved. If you think that's a mistake, reach out to the owner."
            : "Compass is invite-only right now. Your account was created and is waiting for the owner to approve it — you'll get in as soon as they do."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p
          className="rounded-lg px-3.5 py-2.5 text-sm ring-hairline"
          style={{ background: "var(--color-surface-2)", color: "var(--color-text-muted)" }}
        >
          Signed in as{" "}
          <span className="font-medium" style={{ color: "var(--color-text)" }}>
            {session.user.email}
          </span>
          . You can close this tab and come back later.
        </p>
      </CardContent>
    </Card>
  );
}
