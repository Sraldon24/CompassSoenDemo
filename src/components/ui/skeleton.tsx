import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "relative overflow-hidden rounded-md bg-muted",
        "before:absolute before:inset-0 before:-translate-x-full before:animate-[skeleton-sweep_1.8s_var(--ease-out-soft)_infinite] before:bg-gradient-to-r before:from-transparent before:via-foreground/[0.07] before:to-transparent",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
