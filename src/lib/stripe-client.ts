/**
 * The browser-side Stripe.js singleton, loaded once at module scope per
 * `@stripe/stripe-js`'s documented pattern — never inside a component
 * render, which would reload the script on every render.
 */

import { loadStripe } from "@stripe/stripe-js";

export const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "");
