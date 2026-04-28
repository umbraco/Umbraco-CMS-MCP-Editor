/**
 * Formats an ISO 8601 timestamp for display in user-facing messages
 * (elicitation prompts, confirmation copy, tool output strings).
 *
 * Falls back to the raw input if it cannot be parsed.
 *
 * Example: "2026-05-04T20:23:25Z" → "May 4, 2026 at 8:23 PM".
 */
export function formatDate(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(ms));
}
