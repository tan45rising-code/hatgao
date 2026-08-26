import Link from "next/link";
import type { Metadata } from "next";
import { getSettings } from "@/server/settings/get-settings";

export const metadata: Metadata = { title: "Privacy Policy — Hat Gao" };

// Business address/phone/email come from Settings (the same source
// checkout and the confirmation emails use) rather than being hardcoded
// here a second time — if Tan updates them in the admin, this page stays
// correct without a redeploy. It&apos;s rendered fresh per request for the
// same reason the checkout page is (see its `force-dynamic` comment).
export const dynamic = "force-dynamic";

function Placeholder({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-amber-100 px-1 py-0.5 font-mono text-[13px] text-amber-900">{children}</span>;
}

export default async function PrivacyPolicyPage() {
  const settings = await getSettings();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 text-hg-ink">
      <h1 className="mb-1 font-display text-2xl font-semibold">Privacy Policy</h1>
      <p className="mb-8 text-sm text-hg-brown/70">Last updated: 26 August 2026</p>

      <div className="mb-8 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <strong>Draft pending review.</strong> The boxed placeholders below need real details filled in — see
        `docs/ARCHITECTURE.md` and CLAUDE.md&apos;s open questions. This page is a strong starting draft, not something
        that&apos;s had a lawyer look at it — get one to check it (and the Terms &amp; Conditions) before relying on it
        for real customers.
      </div>

      <section className="mb-6 space-y-3 text-sm leading-relaxed">
        <h2 className="font-display text-lg font-semibold">Who we are</h2>
        <p>
          This policy covers {settings.restaurantName} ({settings.addressLine}, {settings.city} {settings.postcode},
          Cyprus), trading as <Placeholder>[registered business/legal entity name]</Placeholder> (
          <Placeholder>[company registration number, if applicable]</Placeholder>) — the &quot;data controller&quot;
          responsible for the personal data described below.
        </p>
        <p>
          Contact us about privacy at{" "}
          <a className="text-hg-red underline" href={`mailto:${settings.email}`}>
            {settings.email}
          </a>{" "}
          or {settings.phone}.
        </p>
      </section>

      <section className="mb-6 space-y-3 text-sm leading-relaxed">
        <h2 className="font-display text-lg font-semibold">What we collect</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Your name and phone number (required to take an order).</li>
          <li>Your email address (optional — only if you want an order confirmation emailed to you).</li>
          <li>What you ordered, any notes you add, and your order history with us.</li>
          <li>
            If you order delivery once that&apos;s available: your delivery address, used to arrange collection by our
            courier partner Wolt.
          </li>
        </ul>
        <p>
          <strong>We never see or store your full card number.</strong> Card payment is handled entirely by Stripe,
          our payment processor — we only receive confirmation that a payment succeeded or failed.
        </p>
      </section>

      <section className="mb-6 space-y-3 text-sm leading-relaxed">
        <h2 className="font-display text-lg font-semibold">Why we use it, and on what basis</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>To fulfil your order</strong> (necessary to perform our contract with you) — preparing your food,
            contacting you about it, and arranging collection or delivery.
          </li>
          <li>
            <strong>To keep financial and tax records</strong> (a legal obligation under Cyprus tax law).
          </li>
          <li>
            <strong>To prevent fraud and keep the ordering system secure</strong> (our legitimate interest, balanced
            against your rights).
          </li>
        </ul>
        <p>We don&apos;t use your data for advertising, and we don&apos;t sell it to anyone.</p>
      </section>

      <section className="mb-6 space-y-3 text-sm leading-relaxed">
        <h2 className="font-display text-lg font-semibold">Who we share it with</h2>
        <p>Each of these only receives what it needs to do its specific job, under its own contract with us:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Stripe</strong> — payment processing.
          </li>
          <li>
            <strong>Resend</strong> — sending your order confirmation email, if you gave us one.
          </li>
          <li>
            <strong>Vercel and Neon</strong> — hosting the website and database that store your order.
          </li>
          <li>
            <strong>Wolt</strong> — once delivery is available, your name, phone number, and delivery address, so a
            courier can bring you your order.
          </li>
        </ul>
      </section>

      <section className="mb-6 space-y-3 text-sm leading-relaxed">
        <h2 className="font-display text-lg font-semibold">How long we keep it</h2>
        <p>
          Order and payment records: at least <Placeholder>[retention period — accountant to confirm]</Placeholder>{" "}
          from the order date, to meet Cyprus tax record-keeping requirements. We keep it only as long as we&apos;re
          required or need to for the reasons above, then delete it.
        </p>
      </section>

      <section className="mb-6 space-y-3 text-sm leading-relaxed">
        <h2 className="font-display text-lg font-semibold">Cookies and local storage</h2>
        <p>
          Our customer site doesn&apos;t use advertising or analytics cookies today. It uses:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            A login session cookie, but only for our own staff signing in to manage the kitchen and menu — not set
            for customers browsing or ordering.
          </li>
          <li>
            Your shopping cart, saved in your own browser (not sent to us until you check out) so it&apos;s still there
            if you refresh the page or come back later.
          </li>
        </ul>
        <p>
          Because none of this is used for tracking or advertising, no cookie consent banner is required. If that
          changes — for example, if we ever add analytics — we&apos;ll add one and update this section.
        </p>
      </section>

      <section className="mb-6 space-y-3 text-sm leading-relaxed">
        <h2 className="font-display text-lg font-semibold">Your rights</h2>
        <p>
          Under the GDPR, you can ask us to access, correct, delete, or export your personal data, or object to how
          we use it. Contact us using the details above. If you&apos;re not satisfied with our response, you can complain
          to Cyprus&apos;s data protection authority, the{" "}
          <a
            className="text-hg-red underline"
            href="https://www.dataprotection.gov.cy"
            target="_blank"
            rel="noreferrer"
          >
            Office of the Commissioner for Personal Data Protection
          </a>
          .
        </p>
      </section>

      <section className="mb-6 space-y-3 text-sm leading-relaxed">
        <h2 className="font-display text-lg font-semibold">Changes to this policy</h2>
        <p>
          If we make a material change, we&apos;ll update the date at the top of this page. Continuing to order from us
          after a change means you accept the update.
        </p>
      </section>

      <p className="mt-10 text-sm">
        See also our{" "}
        <Link className="text-hg-red underline" href="/terms">
          Terms &amp; Conditions
        </Link>
        .
      </p>
    </div>
  );
}
