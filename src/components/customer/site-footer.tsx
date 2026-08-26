import Link from "next/link";

/**
 * Plain text-link footer, shared across every customer-facing page via
 * `(customer)/layout.tsx`. `pb-24` isn't decorative — it's clearance so
 * the fixed-position `CartBar` (bottom-0, z-30) doesn't sit on top of
 * these links when it's showing; see `menu-browser.tsx`'s `pb-28` on its
 * `<main>` for the same reasoning.
 */
export function SiteFooter() {
  return (
    <footer className="mx-auto max-w-3xl px-4 pb-24 pt-10 text-center text-xs text-hg-brown/60">
      <Link className="underline" href="/terms">
        Terms &amp; Conditions
      </Link>
      <span className="mx-2">·</span>
      <Link className="underline" href="/privacy">
        Privacy Policy
      </Link>
    </footer>
  );
}
