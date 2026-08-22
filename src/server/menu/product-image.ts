/**
 * Product photo upload: validate, re-encode, store, and clean up after
 * itself. Matches H.5 in the architecture doc ("validate MIME type and
 * magic bytes, re-encode server-side, cap dimensions and size, serve from
 * a separate domain/CDN") — Vercel Blob's own domain covers the last part
 * for free.
 *
 * The re-encode step (`sharp`) is the real validation, not `file.type` —
 * a browser-reported MIME type is just a label the client chose; feeding
 * the actual bytes through `sharp` and asking it to decode + re-encode is
 * what confirms it's a genuine image. Anything else throws here rather
 * than getting silently accepted and stored.
 *
 * The file itself never passes through a Server Action. Vercel's
 * Serverless Functions (what a Server Action compiles to) have a hard
 * platform-level request body cap of 4.5MB that Next.js's own
 * `serverActions.bodySizeLimit` config cannot raise — it's enforced by
 * Vercel's routing layer before the function (and therefore Next's own
 * config) ever runs. A real phone photo routinely exceeds that, which is
 * exactly what broke here: small test files "worked", anything a few MB
 * didn't, and the raw platform rejection isn't a normal Next.js response,
 * so the client-side React runtime can't parse it and surfaces a generic
 * "Application error" instead of a form error.
 *
 * The fix is to keep the multi-MB payload out of the Serverless Function
 * entirely: the browser uploads the raw file directly to Vercel Blob (see
 * product-photo-field.tsx + the photo-upload route handler), and this
 * module re-fetches those bytes server-side — an outbound fetch, which
 * has no such cap — to run the actual `sharp` validation before the photo
 * is treated as real. Only the resulting URL (a short string) ever goes
 * through the Server Action.
 */

import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { put, del } from "@vercel/blob";
import { MAX_PRODUCT_IMAGE_UPLOAD_BYTES } from "@/lib/product-image";

/** Reject anything larger than this before even attempting to decode it. */
const MAX_UPLOAD_BYTES = MAX_PRODUCT_IMAGE_UPLOAD_BYTES;

/** Menu photos never need to be bigger than this on screen. */
const MAX_DIMENSION = 1600;

/** Vercel Blob's public URLs always live on this host. Refusing to fetch
 * anything else keeps `reencodeStagedImage` from being usable as a
 * general-purpose server-side fetch proxy, even from an authenticated
 * admin session. */
const BLOB_PUBLIC_HOST_SUFFIX = ".public.blob.vercel-storage.com";

export class InvalidImageError extends Error {}

/**
 * Re-fetches a browser-uploaded, not-yet-trusted photo from its staging
 * location in Vercel Blob, validates and re-encodes it (to JPEG, capped
 * dimensions, EXIF orientation applied then stripped), stores the result
 * under `products/`, and deletes the staging blob. Returns the public URL
 * to store as `Product.imageUrl`.
 */
export async function reencodeStagedImage(stagedUrl: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(stagedUrl);
  } catch {
    throw new InvalidImageError("That doesn't look like an uploaded photo.");
  }
  if (!parsed.hostname.endsWith(BLOB_PUBLIC_HOST_SUFFIX)) {
    throw new InvalidImageError("That doesn't look like an uploaded photo.");
  }

  try {
    const response = await fetch(stagedUrl);
    if (!response.ok) {
      throw new InvalidImageError("The uploaded photo could not be read back — please try again.");
    }

    const inputBuffer = Buffer.from(await response.arrayBuffer());
    if (inputBuffer.byteLength === 0) {
      throw new InvalidImageError("The selected file is empty.");
    }
    if (inputBuffer.byteLength > MAX_UPLOAD_BYTES) {
      throw new InvalidImageError("Image is too large — please use a photo under 8MB.");
    }

    let outputBuffer: Buffer;
    try {
      outputBuffer = await sharp(inputBuffer)
        .rotate() // apply EXIF orientation before it gets stripped below
        .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toBuffer();
    } catch {
      // sharp throws for anything it can't decode as a real image — this is
      // the magic-byte check, not `file.type`, which a client can set to
      // whatever it wants.
      throw new InvalidImageError("That file doesn't look like a valid image.");
    }

    const blob = await put(`products/${randomUUID()}.jpg`, outputBuffer, {
      access: "public",
      contentType: "image/jpeg",
    });

    return blob.url;
  } finally {
    // Best-effort either way — the staging copy is never linked from a
    // product record, so a failed delete just leaves an orphaned blob
    // rather than a broken product.
    await deleteProductImage(stagedUrl);
  }
}

/**
 * Deletes a previously-uploaded product photo. Best-effort — a failure
 * here (photo already gone, transient network issue) shouldn't block the
 * product update that's replacing it, so callers should not let this
 * throw stop the rest of the action.
 */
export async function deleteProductImage(url: string): Promise<void> {
  try {
    await del(url);
  } catch {
    // Non-fatal — see doc comment above.
  }
}
