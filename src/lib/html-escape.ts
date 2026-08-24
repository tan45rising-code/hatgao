/** Shared by every hand-built HTML email — never interpolate a raw string
 * (customer name, order notes, etc.) into an email template without it. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
