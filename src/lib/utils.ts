/**
 * The standard shadcn `cn()` helper: merges Tailwind classes, letting a
 * later class win over an earlier conflicting one (e.g. a caller-supplied
 * `className` overriding a component's default). `clsx` handles
 * conditional/falsy class arguments; `tailwind-merge` resolves the
 * conflicts `clsx` alone can't (it doesn't know `px-2` beats `px-4`).
 */

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Ref, RefCallback } from "react";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Combines multiple refs onto one element — JSX only allows a single
 * `ref` prop, but e.g. a scrollable div sometimes needs both its own
 * plain ref (ProductDetailSheet reads scrollTop off it directly) AND a
 * callback ref from a hook (use-drag-to-close.ts's contentRef, which
 * needs the raw node to attach native touch listeners). */
export function mergeRefs<T>(...refs: Array<Ref<T> | undefined>): RefCallback<T> {
  return (node: T) => {
    for (const ref of refs) {
      if (!ref) continue;
      if (typeof ref === "function") ref(node);
      else (ref as { current: T | null }).current = node;
    }
  };
}
