/**
 * Coerce a member's `memberType` to a stable string for output schemas that
 * declare it as `z.string()`. The chained `find-member` returns `memberType`
 * as either a string or an object (`{ id, alias?, name?, icon? }`) depending
 * on Umbraco version, and `alias` is sometimes undefined.
 */
export function memberTypeToString(memberType: unknown): string {
  if (memberType === null || memberType === undefined) return "Unknown";
  if (typeof memberType === "string") return memberType.length > 0 ? memberType : "Unknown";
  if (typeof memberType === "object") {
    const obj = memberType as { alias?: string; name?: string; id?: string };
    return obj.alias || obj.name || obj.id || "Unknown";
  }
  return String(memberType);
}
