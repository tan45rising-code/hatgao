"use client";

import { useState } from "react";
import { PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

export function CheckoutPaymentForm({ publicToken }: { publicToken: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      <PaymentElement />
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <button
        type="submit"
        disabled={!stripe || submitting}
        className="w-full rounded-full bg-hg-red px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-hg-red/90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting ? "Processing…" : "Pay now"}
      </button>
    </form>
  );
}
