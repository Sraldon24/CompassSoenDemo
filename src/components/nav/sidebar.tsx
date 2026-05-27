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

export function Sidebar(): React.ReactElement {
  const pathname = usePathname();
  return (
    <aside
      className="hidden md:flex md:w-60 lg:w-64 shrink-0 flex-col border-r"
      style={{
        background: "var(--color-surface)",
        borderColor: "var(--color-border)",
      }}
    >
      <div
        className="flex h-16 items-center px-5 border-b"
        style={{ borderColor: "var(--color-border)" }}
      >
        <Link href="/dashboard" className="flex items-center gap-2.5">
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
          <span className="text-[15px] font-semibold tracking-tight">Compass</span>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary",
              )}
              style={isActive ? { background: "var(--color-accent-soft)" } : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t" style={{ borderColor: "var(--color-border)" }}>
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
            pathname.startsWith("/settings")
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary",
          )}
          style={
            pathname.startsWith("/settings")
              ? { background: "var(--color-accent-soft)" }
              : undefined
          }
        >
          <Settings className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Settings</span>
        </Link>
      </div>
    </aside>
  );
}
