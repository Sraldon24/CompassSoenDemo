"use client";

import { cn } from "@/lib/utils";
import {
  Calendar,
  CheckSquare,
  Clock,
  LayoutDashboard,
  Mail,
  MessageSquare,
  Network,
  Settings,
  Shield,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/plan", label: "My Plan", icon: Calendar },
  { href: "/map", label: "Prereq Map", icon: Network },
  { href: "/requirements", label: "Requirements", icon: CheckSquare },
  { href: "/chat", label: "Ask Compass", icon: MessageSquare },
  { href: "/deadlines", label: "Deadlines", icon: Clock },
  { href: "/emails", label: "Emails", icon: Mail },
] as const;

type NavLinkProps = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  active: boolean;
};

/** A single nav row: emerald accent rail + soft-gradient pill when active. */
function NavLink({ href, label, icon: Icon, active }: NavLinkProps): React.ReactElement {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
        active
          ? "text-foreground"
          : "text-muted-foreground hover:translate-x-0.5 hover:text-foreground hover:bg-secondary/70",
      )}
      style={active ? { background: "var(--gradient-accent-soft)" } : undefined}
    >
      {/* Accent rail */}
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full transition-all duration-200",
          active ? "opacity-100" : "opacity-0 group-hover:opacity-40",
        )}
        style={{ background: "var(--color-accent)" }}
      />
      <Icon
        className={cn("h-4 w-4 shrink-0 transition-colors", active && "text-[var(--color-accent)]")}
        aria-hidden="true"
      />
      <span>{label}</span>
    </Link>
  );
}

export function Sidebar({ isAdmin = false }: { isAdmin?: boolean }): React.ReactElement {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href));

  return (
    <aside
      className="hidden md:flex md:w-60 lg:w-64 shrink-0 flex-col border-r"
      style={{
        background: "var(--gradient-surface)",
        borderColor: "var(--color-border)",
      }}
    >
      <div
        className="flex h-16 items-center px-5 border-b"
        style={{ borderColor: "var(--color-border)" }}
      >
        <Link href="/dashboard" className="group flex items-center gap-2.5">
          <span className="relative inline-flex">
            <span
              aria-hidden
              className="absolute inset-0 -z-10 rounded-full opacity-0 blur-md transition-opacity duration-300 group-hover:opacity-70"
              style={{ background: "var(--color-accent)" }}
            />
            <Image
              src="/brand/mark.svg"
              alt="SOEN Compass"
              width={28}
              height={28}
              className="dark:hidden"
            />
            <Image
              src="/brand/mark-reverse.svg"
              alt="SOEN Compass"
              width={28}
              height={28}
              className="hidden dark:block"
            />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">Compass</span>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            active={isActive(item.href)}
          />
        ))}
      </nav>

      <div className="px-3 py-4 border-t space-y-1" style={{ borderColor: "var(--color-border)" }}>
        {isAdmin && (
          <NavLink
            href="/admin/users"
            label="Admin"
            icon={Shield}
            active={pathname.startsWith("/admin")}
          />
        )}
        <NavLink
          href="/settings"
          label="Settings"
          icon={Settings}
          active={pathname.startsWith("/settings")}
        />
      </div>
    </aside>
  );
}
