"use client";

import Link from "next/link";
import { useState } from "react";
import { PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

export function CheckoutPaymentForm({ publicToken }: { publicToken: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Without this, a PaymentElement that fails to mount (wrong Stripe
  // account, network block, etc.) fails SILENTLY — Stripe.js only logs an
  // unhelpful "Unhandled payment Element loaderror {error: Object}" to the
  // console and otherwise just renders nothing, leaving a customer staring
  // at a bare "Pay now" button with no card fields and no explanation.
  const [loadError, setLoadError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    setError(null);

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/order/${publicToken}`,
      },
    });

    // Only reached on immediate failure (e.g. a declined card) — success
    // navigates away via return_url before this line runs.
    if (confirmError) {
      setError(confirmError.message ?? "Payment failed. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement
        onLoadError={(e) => setLoadError(e.error.message ?? "Payment form failed to load.")}
      />
      {loadError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          We couldn&apos;t load the payment form: {loadError}
        </p>
      )}
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <p className="text-center text-xs text-hg-brown/60">
        {/* target="_blank": this sits inside the payment step, and Stripe
            Elements loses its mounted state if the customer navigates away
            and back — opening in a new tab keeps their card details typed. */}
        By paying, you agree to our{" "}
        <Link className="underline" href="/terms" target="_blank">
          Terms
        </Link>{" "}
        and{" "}
        <Link className="underline" href="/privacy" target="_blank">
          Privacy Policy
        </Link>
        .
      </p>
      <button
        type="submit"
        disabled={!stripe || submitting || !!loadError}
        className="w-full rounded-full bg-hg-red px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-hg-red/90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting ? "Processing…" : "Pay now"}
      </button>
    </form>
  );
}
