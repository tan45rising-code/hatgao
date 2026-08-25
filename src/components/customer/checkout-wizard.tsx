"use client";

/**
 * Single route, two-step wizard, no page navigation between steps — that
 * matters because Step 2's Stripe `<Elements>` provider needs to survive
 * across the transition, which a route change would tear down.
 *
 * Step "details" narrows the display-only `CartLine[]` down to
 * `CartLineInput[]` (product id, quantity, modifier ids, notes — no
 * prices, ever) before it crosses to the server. That's the one and only
 * point where cart data leaves the browser.
 *
 * The cart is deliberately NOT cleared when Step 1 succeeds (it used to
 * be — see git history) — "Edit details" on Step 2 needs it intact to
 * resubmit, and there's no other reliable moment to clear it: Stripe's
 * post-payment redirect is a full page navigation (not a client-side
 * transition this component could hook), so this component is simply
 * gone by the time payment actually succeeds. The cart is cleared instead
 * from the confirmation page itself, exactly when it detects that
 * redirect having genuinely just happened — see order-status-live.tsx's
 * neighbor, `clear-cart-on-payment-success.tsx`.
 */

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Elements } from "@stripe/react-stripe-js";
import { useCart } from "@/lib/cart/cart-context";
import { formatCents } from "@/lib/money";
import { stripePromise } from "@/lib/stripe-client";
import { startCheckoutAction, previewCartPricingAction, abandonCheckoutAction } from "@/app/(customer)/checkout/actions";
import type { CartLineInput } from "@/server/pricing/order-total";
import { CheckoutPaymentForm } from "./checkout-payment-form";

const inputClass =
  "w-full rounded-lg border border-hg-brown/20 px-3 py-2 text-base text-hg-ink placeholder:text-hg-brown/40 focus:border-hg-red focus:outline-none";

function toCartLineInputs(lines: ReturnType<typeof useCart>["cart"]["lines"]): CartLineInput[] {
  return lines.map((line) => ({
    productId: line.productId,
    quantity: line.quantity,
    modifierIds: line.modifiers.map((m) => m.modifierId),
    notes: line.notes || undefined,
  }));
}

export function CheckoutWizard({ restaurantPhone }: { restaurantPhone: string }) {
  const router = useRouter();
  const { cart } = useCart();
  const cartLines = useMemo(() => toCartLineInputs(cart.lines), [cart.lines]);

  const [step, setStep] = useState<"details" | "payment">("details");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [goingBack, setGoingBack] = useState(false);

  const [preview, setPreview] = useState<{ totalCents: number } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [publicToken, setPublicToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (cartLines.length === 0) return;
    previewCartPricingAction(cartLines).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setPreview({ totalCents: result.totalCents });
        setPreviewError(null);
      } else {
        setPreview(null);
        setPreviewError(result.errors[0] ?? "There's a problem with your order.");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [cartLines]);

  async function handleSubmitDetails(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await startCheckoutAction({
      cartLines,
      customer: { customerName: name, customerPhone: phone, customerEmail: email || undefined, notes: notes || undefined },
    });

    if (!result.ok) {
      setError(result.reason);
      setSubmitting(false);
      return;
    }

    setClientSecret(result.clientSecret);
    setPublicToken(result.publicToken);
    setStep("payment");
    setSubmitting(false);
  }

  /** Step 2's "Edit details" — see the file-level doc comment on why an
   * Order + PaymentIntent already exist by this point and can't just be
   * silently left behind every time someone uses this. */
  async function handleEditDetails() {
    if (!publicToken) return;
    setGoingBack(true);

    const result = await abandonCheckoutAction(publicToken);
    if (result.alreadyPlaced) {
      // Rare race: the payment actually went through right as they
      // clicked back. Reopening an empty form would be confusing —
      // send them to the real status page instead.
      router.push(`/order/${publicToken}`);
      return;
    }

    setClientSecret(null);
    setPublicToken(null);
    setStep("details");
    setGoingBack(false);
  }

  if (cart.lines.length === 0 && step === "details") {
    return <p className="text-sm text-hg-brown/70">Your cart is empty. Add something from the menu first.</p>;
  }

  if (step === "payment" && clientSecret && publicToken) {
    return (
      <div>
        <button
          type="button"
          onClick={handleEditDetails}
          disabled={goingBack}
          className="mb-4 flex items-center gap-1 text-sm font-medium text-hg-brown hover:text-hg-ink disabled:opacity-50"
        >
          <ArrowLeft className="h-4 w-4" />
          {goingBack ? "Please wait…" : "Edit details"}
        </button>
        <Elements stripe={stripePromise} options={{ clientSecret }}>
          <CheckoutPaymentForm publicToken={publicToken} />
        </Elements>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmitDetails} className="space-y-4">
      <Link href="/" className="flex items-center gap-1 text-sm font-medium text-hg-brown hover:text-hg-ink">
        <ArrowLeft className="h-4 w-4" />
        Back to menu
      </Link>

      {previewError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{previewError}</p>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-hg-ink">Name</label>
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-hg-ink">Phone</label>
        <input
          className={inputClass}
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-hg-ink">Email (optional)</label>
        <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-hg-ink">Notes for the kitchen (optional)</label>
        <textarea
          className={inputClass}
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      <div className="flex items-center justify-between border-t border-hg-brown/10 pt-4">
        <span className="text-sm text-hg-brown/70">Total</span>
        <span className="text-lg font-semibold text-hg-ink">
          {preview ? formatCents(preview.totalCents) : "—"}
        </span>
      </div>

      <button
        type="submit"
        disabled={submitting || !!previewError || !preview}
        className="w-full rounded-full bg-hg-red px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-hg-red/90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting ? "Please wait…" : "Continue to payment"}
      </button>

      <p className="text-center text-xs text-hg-brown/50">Questions? Call us on {restaurantPhone}.</p>
    </form>
  );
}
