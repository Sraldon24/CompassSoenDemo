/**
 * Admin section layout — gates every /admin/* route on isAdmin().
 *
 * Reuses the dashboard chrome (sidebar + topbar) so the admin pages feel
 * like part of the same app, but enforces the admin role at the layout
 * level so we don't repeat the check in every page.
 */

import { Sidebar } from "@/components/nav/sidebar";
import { Topbar } from "@/components/nav/topbar";
import { getSession } from "@/lib/get-session";
import { isAdmin } from "@/lib/is-admin";
import { notFound, redirect } from "next/navigation";

export const metadata = {
  title: "Admin",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.ReactElement> {
  const session = await getSession();
  if (!session) redirect("/login");

  // 404 (not 403) so unauthorized users don't even learn the admin area exists.
  if (!isAdmin(session)) notFound();

  return (
    <div className="flex min-h-screen" style={{ background: "var(--color-bg)" }}>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar userName={session.user.name ?? null} userEmail={session.user.email} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
