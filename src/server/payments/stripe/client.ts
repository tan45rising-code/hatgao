/**
 * Stripe SDK singleton. Same shape as `src/server/db.ts`'s Prisma
 * singleton — one instance, imported everywhere as
 * `import { stripe } from "@/server/payments/stripe/client"`.
 *
 * Constructed LAZILY, on first actual use, not at module load. The
 * Stripe SDK's constructor throws immediately on a missing/empty API
 * key — and `next build`'s "Collecting page data" step imports every
 * route module (including the webhook route) to statically analyze it,
 * which would run this file's top level even though nothing is actually
 * handling a request. A `new Stripe(...)` at module scope crashed the
 * build outright with `STRIPE_SECRET_KEY` unset (true for any env that
 * hasn't configured Stripe yet, including this one before Tan adds test
 * keys). The `Proxy` below defers real construction to the first
 * property access, which only ever happens inside a request handler.
 *
 * `apiVersion` is pinned to whatever `stripe@17.7.0` (the installed
 * version — see package.json) declares as its `LatestApiVersion` type.
 * Pinning it explicitly means a future SDK upgrade can't silently change
 * which Stripe API version we're talking to; bumping it is a deliberate,
 * reviewed decision, not a side effect of `npm update`.
 */

import Stripe from "stripe";

let instance: Stripe | null = null;

function getInstance(): Stripe {
  if (!instance) {
    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (!apiKey) {
      throw new Error("STRIPE_SECRET_KEY is not set — add it to .env before taking a real payment.");
    }
    instance = new Stripe(apiKey, { apiVersion: "2025-02-24.acacia" });
  }
  return instance;
}

export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    const real = getInstance();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
