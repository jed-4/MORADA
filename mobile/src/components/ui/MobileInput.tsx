import { forwardRef } from "react";
import { cn } from "@lib/utils";

export interface MobileInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

const MobileInput = forwardRef<HTMLInputElement, MobileInputProps>(
  ({ className, type, label, ...props }, ref) => {
    const input = (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-lg border border-input bg-background px-4 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
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
          {input}
        </div>
      );
    }

    return input;
  }
);
MobileInput.displayName = "MobileInput";

export { MobileInput };
