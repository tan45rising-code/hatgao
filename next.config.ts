import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep this file boring on purpose. Add config only when a real
  // requirement forces it (image domains, redirects, etc.) — see
  // docs/ARCHITECTURE.md for the reasoning behind minimal config.
  images: {
    remotePatterns: [
      // Populated once we choose the image/CDN host in Phase 1
      // (Cloudflare R2 or Vercel Blob).
    ],
  },
  // A `serverActions.bodySizeLimit` override briefly lived here to work
  // around product-photo uploads failing over ~1MB. It didn't actually
  // fix the problem — Vercel's Serverless Functions have their own
  // platform-level ~4.5MB request body cap that this setting cannot
  // raise, so real (multi-MB) phone photos still failed in production
  // even with a 10mb config value. The real fix moved the upload path
  // itself: the browser now uploads photos directly to Vercel Blob,
  // bypassing the Server Action's body limit entirely. See
  // src/server/menu/product-image.ts for the full explanation.
};

export default nextConfig;
