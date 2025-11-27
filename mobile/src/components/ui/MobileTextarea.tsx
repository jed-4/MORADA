import { forwardRef } from "react";
import { cn } from "@lib/utils";

export interface MobileTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

const MobileTextarea = forwardRef<HTMLTextAreaElement, MobileTextareaProps>(
  ({ className, label, ...props }, ref) => {
    const textarea = (
      <textarea
        className={cn(
          "flex min-h-[100px] w-full rounded-lg border border-input bg-background px-4 py-3 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );

    if (label) {
      return (
        <div>
          <label className="block text-sm font-medium mb-2">{label}</label>
          {textarea}
        </div>
      );
    }

    return textarea;
  }
);
MobileTextarea.displayName = "MobileTextarea";

export { MobileTextarea };
