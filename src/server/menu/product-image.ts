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
 */

import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { put, del } from "@vercel/blob";

/** Reject anything larger than this before even attempting to decode it. */
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8MB

/** Menu photos never need to be bigger than this on screen. */
const MAX_DIMENSION = 1600;

export class InvalidImageError extends Error {}

/**
 * Validates, re-encodes (to JPEG, capped dimensions, EXIF orientation
 * applied then stripped) and uploads a product photo. Returns the public
 * URL to store as `Product.imageUrl`.
 */
export async function processAndUploadProductImage(file: File): Promise<string> {
  if (file.size === 0) {
    throw new InvalidImageError("The selected file is empty.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new InvalidImageError("Image is too large — please use a photo under 8MB.");
  }

  const inputBuffer = Buffer.from(await file.arrayBuffer());

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
