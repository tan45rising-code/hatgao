"use client";

/**
 * The photo half of the product form. A client component (unlike the rest
 * of the form) because it has to upload the raw file straight to Vercel
 * Blob from the browser, bypassing the Server Action entirely — see
 * src/server/menu/product-image.ts for why that's required rather than
 * just a nicety.
 *
 * All this component hands the surrounding <form> is a hidden
 * `stagedImageUrl` field once the upload finishes. The product Server
 * Action re-fetches and validates those bytes server-side before treating
 * the photo as real — this component's own size check is just fast UX
 * feedback, not the security boundary.
 */

import { useId, useState } from "react";
import { upload } from "@vercel/blob/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { STAGED_PRODUCT_IMAGE_PREFIX, MAX_PRODUCT_IMAGE_UPLOAD_BYTES } from "@/lib/product-image";

const MAX_UPLOAD_MB = MAX_PRODUCT_IMAGE_UPLOAD_BYTES / (1024 * 1024);

type ProductPhotoFieldProps = {
  currentImageUrl?: string | null;
  productName: string;
  onBusyChange: (busy: boolean) => void;
};

export function ProductPhotoField({ currentImageUrl, productName, onBusyChange }: ProductPhotoFieldProps) {
  const [status, setStatus] = useState<"idle" | "uploading" | "uploaded" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [stagedUrl, setStagedUrl] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentImageUrl ?? null);
  const inputId = useId();

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_PRODUCT_IMAGE_UPLOAD_BYTES) {
      setStatus("error");
      setError(`That photo is over ${MAX_UPLOAD_MB}MB — please use a smaller one.`);
      event.target.value = "";
      return;
    }

    setStatus("uploading");
    setError(null);
    onBusyChange(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const blob = await upload(`${STAGED_PRODUCT_IMAGE_PREFIX}${crypto.randomUUID()}.${ext}`, file, {
        access: "public",
        handleUploadUrl: "/admin/menu/products/photo-upload",
      });
      setStagedUrl(blob.url);
      setPreviewUrl(blob.url);
      setStatus("uploaded");
    } catch {
      setStatus("error");
      setError("That upload didn't go through — check your connection and try again.");
    } finally {
      onBusyChange(false);
    }
  }

  return (
    <div className="rounded-md border border-neutral-200 bg-white p-4">
      <p className="mb-3 text-sm font-semibold text-neutral-900">Photo</p>
      {previewUrl && (
        <div className="mb-3 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- remote Blob URL, not a local optimizable asset */}
          <img
            src={previewUrl}
            alt={productName}
            className="h-20 w-20 rounded-md border border-neutral-200 object-cover"
          />
          {currentImageUrl && (
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <Checkbox name="removePhoto" />
              Remove this photo
            </label>
          )}
        </div>
      )}
      <Label htmlFor={inputId}>{currentImageUrl ? "Replace photo" : "Upload a photo"}</Label>
      <input
        id={inputId}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="block w-full text-sm text-neutral-700 file:mr-3 file:rounded-md file:border-0 file:bg-neutral-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-neutral-800"
      />
      {/* The only thing the surrounding form actually submits for the photo — see module doc comment. */}
      <input type="hidden" name="stagedImageUrl" value={stagedUrl} />
      <p className="mt-1 text-xs text-neutral-500">
        {status === "uploading"
          ? "Uploading…"
          : status === "uploaded"
            ? "Photo uploaded — saved when you hit Save."
            : `JPG, PNG or similar. Resized automatically, up to ${MAX_UPLOAD_MB}MB.`}
      </p>
      {error && <p className="mt-1 text-xs font-medium text-red-700">{error}</p>}
    </div>
  );
}
