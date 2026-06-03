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
      <CardHeader className="space-y-2">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-full"
          style={{ background: "var(--gradient-accent-soft)", color: "var(--color-accent)" }}
        >
          <Clock className="h-6 w-6" aria-hidden />
        </div>
        <CardTitle className="text-2xl">
          {rejected ? "Access not granted" : "Awaiting approval"}
        </CardTitle>
        <CardDescription>
          {rejected
            ? "Your request to join Compass wasn't approved. If you think that's a mistake, reach out to the owner."
            : "Compass is invite-only right now. Your account was created and is waiting for the owner to approve it — you'll get in as soon as they do."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Signed in as <span className="font-medium">{session.user.email}</span>. You can close this
          tab and come back later.
        </p>
      </CardContent>
    </Card>
  );
}
