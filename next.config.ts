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
  experimental: {
    serverActions: {
      // Next's own default is 1MB — well under the 8MB the product form
      // (src/app/admin/(protected)/menu/products/product-form.tsx) tells
      // staff a photo can be. Below 1MB uploads "worked"; anything past
      // it was silently rejected by this limit before
      // processAndUploadProductImage's own 8MB check ever ran, and the
      // broken response is what crashed the client. Set comfortably
      // above 8MB to leave room for multipart overhead + the rest of the
      // form fields.
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
