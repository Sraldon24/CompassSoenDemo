import { cn } from "@/lib/utils";
import type * as React from "react";

/**
 * Meridian's signature boxed mono course-code chip (e.g. `COMP 352`).
 * JetBrains Mono, bold, on a surface-2 tile with a strong ink border.
 * Pass `onClick` to make it an interactive (clickable) chip.
 */
function CourseCode({
  code,
  tone,
  className,
  onClick,
  ...props
}: React.ComponentProps<"span"> & { code: string; tone?: string }): React.ReactElement {
  return (
    <span
      data-slot="course-code"
      onClick={onClick}
      className={cn(
        "chip-code inline-flex items-center rounded-[6px] border-[1.2px] border-[var(--line-strong)] px-[7px] py-[2px] text-[var(--ink)]",
        onClick && "cursor-pointer transition-colors hover:border-[var(--ink)]",
        className,
      )}
      style={{ background: tone ?? "var(--surface-2)" }}
      {...props}
    >
      {code}
    </span>
  );
}

export { CourseCode };
