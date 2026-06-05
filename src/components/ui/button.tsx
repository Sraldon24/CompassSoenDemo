import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { type VariantProps, cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 items-center justify-center rounded-[var(--r-md)] border-[1.5px] border-transparent bg-clip-padding text-sm font-[650] tracking-[-0.01em] whitespace-nowrap transition-all duration-200 outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/40 active:not-aria-[haspopup]:translate-x-px active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Meridian: ink fill, ink border, offset hard-shadow; hover lifts up-left.
        default:
          "bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)] shadow-[var(--hard-shadow)] hover:-translate-x-px hover:-translate-y-px hover:shadow-[var(--hard-shadow-strong)]",
        // Primary accent: Clementine fill + deep-accent border + hard-shadow.
        accent:
          "bg-[var(--accent)] text-[var(--on-accent)] border-[var(--accent-deep)] shadow-[var(--hard-shadow)] hover:bg-[var(--accent-deep)] hover:-translate-x-px hover:-translate-y-px hover:shadow-[4px_4px_0_var(--accent-glow)]",
        outline:
          "border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-2)] hover:border-[var(--ink)]",
        secondary:
          "bg-[var(--surface-2)] text-[var(--ink)] border-[var(--line-strong)] hover:bg-[var(--surface)]",
        ghost:
          "text-[var(--ink-2)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)] aria-expanded:bg-[var(--surface-2)]",
        destructive:
          "bg-[var(--bad-soft)] text-[var(--bad)] hover:brightness-95 focus-visible:ring-destructive/20",
        link: "text-[var(--accent-deep)] underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-9 gap-1.5 px-3.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-7 gap-1 rounded-md px-2.5 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-8 gap-1.5 rounded-md px-3 text-[0.8125rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 [&_svg:not([class*='size-'])]:size-4",
        lg: "h-11 gap-2 rounded-xl px-5 text-[0.9375rem] has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        icon: "size-9",
        "icon-xs":
          "size-7 rounded-md in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-8 rounded-md in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-11 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
