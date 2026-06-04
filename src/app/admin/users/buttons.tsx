"use client";

import { Button } from "@/components/ui/button";
import { useTransition } from "react";
import { setUserStatus } from "./actions";

export function UserStatusButtons({
  userId,
  status,
}: {
  userId: string;
  status: string;
}): React.ReactElement {
  const [pending, startTransition] = useTransition();

  const act = (next: "approved" | "rejected") => {
    startTransition(async () => {
      const res = await setUserStatus({ userId, status: next });
      if (!res.success) alert(`Action failed: ${res.error}`);
    });
  };

  return (
    <div className="flex items-center gap-2">
      {status !== "approved" && (
        <Button size="sm" className="pressable" disabled={pending} onClick={() => act("approved")}>
          Approve
        </Button>
      )}
      {status !== "rejected" && (
        <Button
          size="sm"
          variant="outline"
          className="pressable"
          disabled={pending}
          onClick={() => act("rejected")}
        >
          Reject
        </Button>
      )}
    </div>
  );
}
