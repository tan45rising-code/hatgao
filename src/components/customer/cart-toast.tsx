"use client";

import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCart } from "@/lib/cart/cart-context";

/**
 * The quiet confirmation that replaced auto-opening the cart drawer on
 * every add — see the commit that removed that. Non-blocking
 * (pointer-events-none), auto-dismisses on its own (the timing lives in
 * cart-context.tsx, this just reflects it), never something the user has
 * to act on or close.
 */
export function CartToast() {
  const { toast } = useCart();
  // Keeps the last message rendered through the fade-out, instead of the
  // text disappearing the instant the context clears `toast` to null.
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (toast) setMessage(toast.message);
  }, [toast]);

  return (
    <div
      aria-live="polite"
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-3 transition-all duration-300 sm:bottom-28",
        toast ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
      )}
    >
      <div className="flex items-center gap-2 rounded-full bg-hg-ink px-4 py-2.5 text-sm font-medium text-white shadow-lg">
        <CheckCircle2 className="h-4 w-4 text-hg-gold" />
        {message}
      </div>
    </div>
  );
}
