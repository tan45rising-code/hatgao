/**
 * The standard shadcn `cn()` helper: merges Tailwind classes, letting a
 * later class win over an earlier conflicting one (e.g. a caller-supplied
 * `className` overriding a component's default). `clsx` handles
 * conditional/falsy class arguments; `tailwind-merge` resolves the
 * conflicts `clsx` alone can't (it doesn't know `px-2` beats `px-4`).
 */

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
