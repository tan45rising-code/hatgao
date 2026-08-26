import Link from "next/link";
import type { Metadata } from "next";
import { getSettings } from "@/server/settings/get-settings";

export const metadata: Metadata = { title: "Terms & Conditions — Hat Gao" };

export const dynamic = "force-dynamic";

function Placeholder({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-amber-100 px-1 py-0.5 font-mono text-[13px] text-amber-900">{children}</span>;
}

export default async function TermsPage() {
  const settings = await getSettings();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 text-hg-ink">
      <h1 className="mb-1 font-display text-2xl font-semibold">Terms &amp; Conditions</h1>
      <p className="mb-8 text-sm text-hg-brown/70">Last updated: 26 August 2026</p>

      <div className="mb-8 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <strong>Draft pending review.</strong> Get a lawyer to check this (and the Privacy Policy) before relying on
        it for real customers — see the placeholders below for what&apos;s still missing.
      </div>

      <section className="mb-6 space-y-3 text-sm leading-relaxed">
        <h2 className="font-display text-lg font-semibold">These terms</h2>
        <p>
          These terms apply whenever you order food from {settings.restaurantName}{" "}
          (<Placeholder>[registered business/legal entity name]</Placeholder>), {settings.addressLine},{" "}
          {settings.city} {settings.postcode}, Cyprus, directly through this website — not through a marketplace
          app. By placing an order, you agree to them.
        </p>
      </section>

      <section className="mb-6 space-y-3 text-sm leading-relaxed">
        <h2 className="font-display text-lg font-semibold">Placing an order</h2>
        <p>
          All prices are in euros and include VAT. Please give us accurate contact details — we use them only to
          fulfil and, if needed, follow up about your order.
        </p>
      </section>

      <section className="mb-6 space-y-3 text-sm leading-relaxed">
        <h2 className="font-display text-lg font-semibold">Payment</h2>
        <p>
          We place an authorization hold on your card when you check out — this reserves the funds but doesn&apos;t take
          them. We only actually charge your card once we&apos;ve accepted your order. If we&apos;re unable to accept it, the
          hold is released and you are not charged (this can take a few days to disappear from your statement,
          depending on your bank).
        </p>
      </section>

      <section className="mb-6 space-y-3 text-sm leading-relaxed">
        <h2 className="font-display text-lg font-semibold">Order acceptance</h2>
        <p>
          No contract exists between us until we accept your order — for example, we may be unable to accept it if
          we&apos;re closed, unusually busy, or an item became unavailable after you ordered. You&apos;ll be notified either
          way.
        </p>
      </section>

      <section className="mb-6 space-y-3 text-sm leading-relaxed">
        <h2 className="font-display text-lg font-semibold">Collection and delivery</h2>
        <p>
          Orders are currently collection-only from {settings.addressLine}, {settings.city}, at the time we confirm
          when you check out. Once delivery is available, it will be carried out by our courier partner, Wolt — by
          law, we cannot offer delivery for alcoholic drinks, which remain collection-only.
        </p>
      </section>

      <section className="mb-6 space-y-3 text-sm leading-relaxed">
        <h2 className="font-display text-lg font-semibold">Cancellations and refunds</h2>
        <p>
          You can cancel before we accept your order at no charge. Once we&apos;ve accepted it, we start preparing your
          food right away, so we may not be able to cancel or refund it — contact us as soon as possible if there&apos;s
          a problem and we&apos;ll do what we reasonably can.
        </p>
        <p>
          <strong>The standard 14-day right to change your mind on online orders does not apply here.</strong> EU
          consumer law exempts food and other goods that are prepared to order or deteriorate quickly (Directive
          2011/83/EU, Article 16) — this is normal for restaurant ordering, not something specific to us.
        </p>
      </section>

      <section className="mb-6 space-y-3 text-sm leading-relaxed">
        <h2 className="font-display text-lg font-semibold">Allergens</h2>
        <p>
          We provide allergen information where we&apos;ve verified it, but our kitchen handles a wide range of
          ingredients and we can&apos;t guarantee any dish is completely free of a given allergen. If you have a food
          allergy, please call us on {settings.phone} before ordering.
        </p>
      </section>

      <section className="mb-6 space-y-3 text-sm leading-relaxed">
        <h2 className="font-display text-lg font-semibold">Our liability</h2>
        <p>
          Nothing in these terms limits our liability where the law doesn&apos;t allow it — for example, for death or
          personal injury caused by our negligence, or for fraud. Otherwise, our liability to you is limited to the
          price you paid for the order in question.
        </p>
      </section>

      <section className="mb-6 space-y-3 text-sm leading-relaxed">
        <h2 className="font-display text-lg font-semibold">Complaints and disputes</h2>
        <p>
          If something&apos;s gone wrong, contact us first at{" "}
          <a className="text-hg-red underline" href={`mailto:${settings.email}`}>
            {settings.email}
          </a>{" "}
          or {settings.phone} — we&apos;d rather sort it out directly. If we can&apos;t resolve it, EU residents can also use
          the{" "}
          <a
            className="text-hg-red underline"
            href="https://ec.europa.eu/consumers/odr"
            target="_blank"
            rel="noreferrer"
          >
            EU Online Dispute Resolution platform
          </a>
          . These terms are governed by the laws of Cyprus.
        </p>
      </section>

      <section className="mb-6 space-y-3 text-sm leading-relaxed">
        <h2 className="font-display text-lg font-semibold">Changes to these terms</h2>
        <p>
          We may update these terms from time to time; the date at the top shows when they last changed. The terms
          in force when you place an order are the ones that apply to it.
        </p>
      </section>

      <p className="mt-10 text-sm">
        See also our{" "}
        <Link className="text-hg-red underline" href="/privacy">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
