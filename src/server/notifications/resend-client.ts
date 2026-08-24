/**
 * Resend SDK singleton. Same lazy-construction pattern as
 * `src/server/payments/stripe/client.ts`, and for the identical reason:
 * `new Resend(key)` throws immediately if no key is available (checked
 * the installed SDK's source directly — it falls back to
 * `process.env.RESEND_API_KEY` and throws if that's empty too), and
 * `next build`'s "Collecting page data" step imports every route module
 * to statically analyze it. A module-scope `new Resend(...)` with
 * `RESEND_API_KEY` unset — true for any environment that hasn't
 * configured it yet — crashes the build outright. See CLAUDE.md gotcha
 * 10 for the original Stripe write-up of this exact trap.
 */

import { Resend } from "resend";

let instance: Resend | null = null;

function getInstance(): Resend {
  if (!instance) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY is not set — add it to .env before sending real email.");
    }
    instance = new Resend(apiKey);
  }
  return instance;
}

export const resend: Resend = new Proxy({} as Resend, {
  get(_target, prop) {
    const real = getInstance();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
