import { Be_Vietnam_Pro, Playfair_Display, Alex_Brush } from "next/font/google";
import { CartProvider } from "@/lib/cart/cart-context";
import { CartBar } from "@/components/customer/cart-bar";
import { CartToast } from "@/components/customer/cart-toast";
import { SiteHeader } from "@/components/customer/site-header";
import { SiteFooter } from "@/components/customer/site-footer";

// Scoped to this route group, not the root layout — the admin dashboard
// keeps its own plain system-font look (src/app/admin), so this shouldn't
// change anything there.
const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-be-vietnam",
});
const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-playfair",
});
// Stand-in for the real wordmark until the actual logo file is in
// public/ — see the note left for Tan. Approximates the brush-script
// "Hat Gao" lettering from the brand logo.
const alexBrush = Alex_Brush({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-alex-brush",
});

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${beVietnamPro.variable} ${playfairDisplay.variable} ${alexBrush.variable} min-h-screen bg-hg-bg font-body text-hg-ink`}
    >
      <CartProvider>
        <SiteHeader />
        {children}
        <SiteFooter />
        <CartBar />
        <CartToast />
        {/* CartDrawer now renders from MenuBrowser — it needs the full
            product catalog (for "Often bought with") which only the page
            has, not this route-group-wide layout. */}
      </CartProvider>
    </div>
  );
}
