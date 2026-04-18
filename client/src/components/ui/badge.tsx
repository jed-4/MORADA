import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  // Whitespace-nowrap: Badges should never wrap.
  "whitespace-nowrap inline-flex items-center rounded-md border-2 px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2" +
  " hover-elevate " ,
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground shadow-xs",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow-xs",

        outline: " border [border-color:var(--badge-outline)] shadow-xs",

        // Compact "pill" status variants per BuildPro table-restyle spec:
        //   18px tall, 9px radius, 10px text, 7px horizontal padding,
        //   soft pastel tint backgrounds matching --status-* tokens.
        // Override the default rounded-md / border-2 / px / py from the base.
        "status-success":
          "border-0 bg-status-success-bg text-status-success rounded-[9px] h-[18px] px-[7px] py-0 text-[10px] font-medium",
        "status-warning":
          "border-0 bg-status-warning-bg text-status-warning rounded-[9px] h-[18px] px-[7px] py-0 text-[10px] font-medium",
        "status-info":
          "border-0 bg-status-info-bg text-status-info rounded-[9px] h-[18px] px-[7px] py-0 text-[10px] font-medium",
        "status-danger":
          "border-0 bg-status-danger-bg text-status-danger rounded-[9px] h-[18px] px-[7px] py-0 text-[10px] font-medium",
        "status-action":
          "border-0 bg-status-action-bg text-status-action rounded-[9px] h-[18px] px-[7px] py-0 text-[10px] font-medium",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants }
