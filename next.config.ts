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
};

export default nextConfig;
