"use client";

import { Button } from "@/components/ui/button";
import { useTransition } from "react";
import { approveChange, rejectChange } from "./actions";

export function ApproveRejectButtons({ changeId }: { changeId: string }): React.ReactElement {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        className="pressable"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            const res = await rejectChange(changeId);
            if (!res.ok) {
              alert(`Reject failed: ${res.error}`);
            }
          });
        }}
      >
        Reject
      </Button>
      <Button
        size="sm"
        className="pressable"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            const res = await approveChange(changeId);
            if (!res.ok) {
              alert(`Approve failed: ${res.error}`);
            }
          });
        }}
      >
        Approve
      </Button>
    </div>
  );
}
