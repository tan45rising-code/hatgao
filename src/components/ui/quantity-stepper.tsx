import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type QuantityStepperProps = {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  className?: string;
};

export function QuantityStepper({ value, onChange, min = 1, max = 50, className }: QuantityStepperProps) {
  return (
    <div className={cn("inline-flex items-center gap-1 rounded-full border border-hg-brown/20 bg-white", className)}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label="Decrease quantity"
        className="flex h-9 w-9 items-center justify-center rounded-full text-hg-ink transition-colors hover:bg-hg-bg disabled:opacity-30"
      >
        <Minus className="h-4 w-4" />
      </button>
      <span className="w-6 text-center text-sm font-semibold text-hg-ink tabular-nums">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label="Increase quantity"
        className="flex h-9 w-9 items-center justify-center rounded-full text-hg-ink transition-colors hover:bg-hg-bg disabled:opacity-30"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
