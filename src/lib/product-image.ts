/**
 * Constants shared between the browser (product-photo-field.tsx, a client
 * component) and the server (src/server/menu/product-image.ts, the
 * photo-upload route handler) for the product-photo upload flow.
 *
 * Lives in src/lib, not src/server, specifically so the client component
 * can import it directly — src/server/menu/product-image.ts pulls in
 * `sharp` and `node:crypto`, neither of which can go in a browser bundle.
 * Keeping the prefix and size cap in one place means the client's staged
 * upload and the server's validation of it can never drift apart.
 */

/**
 * Where the browser uploads the untouched, not-yet-validated file to. The
 * server re-fetches from here, decodes it with `sharp` (the real
 * validation — see product-image.ts), and writes the result under
 * `products/` instead. Nothing under this prefix is ever linked from a
 * product record or served to a customer.
 */
export const STAGED_PRODUCT_IMAGE_PREFIX = "staging/products/";

/** Menu photos larger than this are rejected before decoding is attempted. */
export const MAX_PRODUCT_IMAGE_UPLOAD_BYTES = 8 * 1024 * 1024; // 8MB
