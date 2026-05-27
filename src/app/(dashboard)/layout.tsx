import { Sidebar } from "@/components/nav/sidebar";
import { Topbar } from "@/components/nav/topbar";
import { getSession } from "@/lib/get-session";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: { children: React.ReactNode }): Promise<React.ReactElement> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

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
