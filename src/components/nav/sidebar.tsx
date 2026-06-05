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

/** A single nav row: active = surface fill + ink border + offset hard-shadow + accent icon. */
function NavLink({ href, label, icon: Icon, active }: NavLinkProps): React.ReactElement {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-[11px] rounded-[var(--r-md)] px-3 py-2.5 text-[0.9rem] transition-all duration-150",
        active
          ? "font-bold text-[var(--ink)] shadow-[var(--hard-shadow)]"
          : "font-medium text-[var(--ink-2)] hover:translate-x-0.5 hover:text-[var(--ink)] hover:bg-[var(--surface-2)]",
      )}
      style={{
        border: `1.5px solid ${active ? "var(--line-strong)" : "transparent"}`,
        background: active ? "var(--surface)" : "transparent",
      }}
    >
      <span
        aria-hidden
        className="flex shrink-0 transition-colors"
        style={{ color: active ? "var(--accent-deep)" : "var(--ink-3)" }}
      >
        <Icon className="h-[1.2rem] w-[1.2rem]" aria-hidden="true" />
      </span>
      <span className="truncate">{label}</span>
    </Link>
  );
}

export function Sidebar({ isAdmin = false }: { isAdmin?: boolean }): React.ReactElement {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href));

  return (
    <aside
      className="hidden md:flex md:w-60 lg:w-64 shrink-0 flex-col"
      style={{
        background: "var(--paper-2)",
        borderRight: "1.5px solid var(--line)",
      }}
    >
      <div
        className="flex h-16 items-center px-5"
        style={{ borderBottom: "1.5px solid var(--line)" }}
      >
        <Link href="/dashboard" className="group flex items-center gap-[11px]">
          <span className="relative inline-flex">
            <span
              aria-hidden
              className="absolute inset-0 -z-10 rounded-full opacity-0 blur-md transition-opacity duration-300 group-hover:opacity-70"
              style={{ background: "var(--color-accent)" }}
            />
            <Image
              src="/brand/mark.svg"
              alt="SOEN Compass"
              width={32}
              height={32}
              className="dark:hidden"
            />
            <Image
              src="/brand/mark-reverse.svg"
              alt="SOEN Compass"
              width={32}
              height={32}
              className="hidden dark:block"
            />
          </span>
          <span className="flex flex-col">
            <span
              className="text-[18px] font-extrabold leading-none tracking-[-0.02em]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Compass
            </span>
            <span
              className="mono mt-[3px] text-[10.5px] tracking-[0.06em]"
              style={{ color: "var(--ink-3)" }}
            >
              SOEN · CONCORDIA
            </span>
          </span>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-[14px] space-y-[3px] scroll-slim overflow-y-auto">
        <p className="eyebrow px-2.5 pb-2 pt-1">Navigate</p>
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

      <div
        className="px-3 py-[14px] space-y-[3px]"
        style={{ borderTop: "1.5px solid var(--line)" }}
      >
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
        <p className="px-3 pt-3 text-[0.625rem] mono tnum" style={{ color: "var(--ink-3)" }}>
          SOEN Compass · v0.1.0
        </p>
      </div>
    </aside>
  );
}
