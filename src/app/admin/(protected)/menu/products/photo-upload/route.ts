/**
 * Issues short-lived client tokens for direct browser-to-Blob photo
 * uploads (see src/server/menu/product-image.ts for why this exists —
 * Vercel's Serverless Function body cap, not Next.js's own config, was
 * what actually broke real photo uploads).
 *
 * This route never sees the file's bytes, only the upload metadata — the
 * multi-MB payload goes straight from the browser to Blob storage.
 * `reencodeStagedImage` (called from the product Server Actions once the
 * form is submitted) is what actually validates the bytes; this route
 * only decides whether an upload is allowed to happen at all.
 *
 * Sits under /admin/menu/**, so middleware.ts's OWNER-only requirement
 * for that prefix already covers it — no separate role check needed here,
 * matching every other menu Server Action (see `requireOwner` in
 * ../actions.ts, which likewise only checks a session exists).
 */

import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { auth } from "@/auth";
import { STAGED_PRODUCT_IMAGE_PREFIX, MAX_PRODUCT_IMAGE_UPLOAD_BYTES } from "@/lib/product-image";

export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(STAGED_PRODUCT_IMAGE_PREFIX)) {
          throw new Error("Invalid upload path");
        }
        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
          addRandomSuffix: true,
          maximumSizeInBytes: MAX_PRODUCT_IMAGE_UPLOAD_BYTES,
        };
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload failed" }, { status: 400 });
  }
}
