import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * A native `<input type="checkbox">`, not a Radix primitive — no
 * client-side state or portal needed for a plain boolean toggle in a form.
 * Styled to read as a real checkbox rather than the browser default.
 */
export const Checkbox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        "h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-500",
        className,
      )}
      {...props}
    />
  ),
);
Checkbox.displayName = "Checkbox";
