import { type VariantProps, cva } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  "group/alert relative grid w-full gap-0.5 overflow-hidden rounded-lg border px-3.5 py-3 pl-4 text-left text-sm shadow-[var(--shadow-xs)] before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-current before:opacity-70 has-data-[slot=alert-action]:relative has-data-[slot=alert-action]:pr-18 has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2.5 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg]:text-current *:[svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "border-border bg-card text-foreground before:opacity-0",
        destructive:
          "border-[color-mix(in_oklch,var(--color-danger)_25%,var(--color-border))] bg-[var(--color-danger-soft)] text-[var(--color-danger)] *:data-[slot=alert-description]:text-[var(--color-danger)]/90",
        success:
          "border-[color-mix(in_oklch,var(--color-success)_25%,var(--color-border))] bg-[var(--color-success-soft)] text-[var(--color-success)] *:data-[slot=alert-description]:text-[var(--color-success)]/90",
        warning:
          "border-[color-mix(in_oklch,var(--color-warning)_25%,var(--color-border))] bg-[var(--color-warning-soft)] text-[var(--color-warning)] *:data-[slot=alert-description]:text-[var(--color-warning)]/90",
        info: "border-[color-mix(in_oklch,var(--color-info)_25%,var(--color-border))] bg-[var(--color-info-soft)] text-[var(--color-info)] *:data-[slot=alert-description]:text-[var(--color-info)]/90",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "font-medium group-has-[>svg]/alert:col-start-2 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "text-sm text-balance text-muted-foreground md:text-pretty [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4",
        className,
      )}
      {...props}
    />
  );
}

function AlertAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="alert-action" className={cn("absolute top-2 right-2", className)} {...props} />
  );
}

export { Alert, AlertTitle, AlertDescription, AlertAction };
