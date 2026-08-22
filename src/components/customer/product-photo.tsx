import { UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A lot of the seeded menu (prisma/verify/002_seed_menu.sql) has no
 * `imageUrl` yet — real photos come in gradually through the admin
 * upload (src/server/menu/product-image.ts). This fallback needs to look
 * intentional, not broken, until then.
 */
export function ProductPhoto({
  src,
  alt,
  className,
}: {
  src: string | null;
  alt: string;
  className?: string;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote Vercel Blob URL, not a local optimizable asset
      <img
        src={src}
        alt={alt}
        draggable={false}
        // Mobile Safari's long-press-to-save-image menu can eat the start
        // of a tap on a product photo, making it feel like tapping the
        // photo just does less than tapping the card's text next to it.
        style={{ WebkitTouchCallout: "none" }}
        className={cn("object-cover select-none", className)}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center bg-gradient-to-br from-hg-cream to-hg-gold/40",
        className,
      )}
      role="img"
      aria-label={alt}
    >
      <UtensilsCrossed className="h-1/3 w-1/3 text-hg-brown/50" strokeWidth={1.5} />
    </div>
  );
}
