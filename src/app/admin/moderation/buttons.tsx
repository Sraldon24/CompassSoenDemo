"use client";

import { Button } from "@/components/ui/button";
import { useTransition } from "react";
import { resolveFlagAction } from "./actions";

export function ModerationButtons({ flagId }: { flagId: string }): React.ReactElement {
  const [pending, startTransition] = useTransition();

  const act = (action: "keep" | "remove" | "ban") => {
    startTransition(async () => {
      const res = await resolveFlagAction(flagId, action);
      if (!res.ok) alert(`Action failed: ${res.error}`);
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        className="pressable"
        disabled={pending}
        onClick={() => act("keep")}
      >
        Keep
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="pressable"
        disabled={pending}
        onClick={() => act("remove")}
      >
        Remove
      </Button>
      <Button size="sm" className="pressable" disabled={pending} onClick={() => act("ban")}>
        Ban author
      </Button>
    </div>
  );
}
