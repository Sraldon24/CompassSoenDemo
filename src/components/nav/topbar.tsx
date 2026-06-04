"use client";

import { ThemeToggle } from "@/components/providers/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth/auth-client";
import { LogOut, Settings as SettingsIcon, User as UserIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface TopbarProps {
  userName: string | null;
  userEmail: string;
}

function initials(name: string | null, email: string): string {
  const source = name?.trim() || email;
  const parts = source.split(/\s+|@/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  const first = parts[0] ?? "";
  if (parts.length === 1) {
    return first.slice(0, 2).toUpperCase();
  }
  const last = parts[parts.length - 1] ?? "";
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase().slice(0, 2);
}

export function Topbar({ userName, userEmail }: TopbarProps): React.ReactElement {
  const router = useRouter();

  const handleSignOut = async () => {
    await authClient.signOut();
    toast.success("Signed out");
    router.push("/login");
    router.refresh();
  };

  return (
    <header
      className="glass sticky top-0 z-30 h-16 flex items-center justify-between px-4 md:px-6 border-b"
      style={{ borderColor: "var(--color-border)" }}
    >
      <div className="flex-1 flex items-center gap-2 text-sm text-muted-foreground md:hidden">
        <span className="font-semibold text-foreground">Compass</span>
      </div>
      <div className="hidden md:block flex-1" />
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Open user menu"
            className="pressable inline-flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold text-white shadow-[var(--shadow-sm)] ring-2 ring-[var(--color-accent)]/25 transition-all hover:ring-[var(--color-accent)]/50 hover:brightness-105 focus-visible:outline-none"
            style={{ backgroundImage: "var(--gradient-accent)" }}
          >
            {initials(userName, userEmail)}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                <div className="font-medium truncate">{userName ?? "Account"}</div>
                <div
                  className="text-xs font-normal truncate"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {userEmail}
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/settings")}>
              <UserIcon className="mr-2 h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/settings")}>
              <SettingsIcon className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} variant="destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
