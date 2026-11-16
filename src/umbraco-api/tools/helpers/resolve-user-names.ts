/**
 * Resolve a batch of Umbraco user IDs to display names via `get-user-by-id`,
 * for tools that show "who did this" in an audit trail
 * (`get-page-change-history`, `get-media-change-history`).
 *
 * Checks `checkUsersAccess()` once up front and skips the `get-user-by-id`
 * calls entirely when the caller can't read users — falling back to the raw
 * ID for every entry, exactly like the per-call try/catch fallback below
 * already does for an individual 403. Without this, an API user without
 * Users access got one `get-user-by-id` 403 per distinct user ID in the log
 * (recorded as `api_error` on the chained call), which is what tripped the
 * alert in issue #307. The one `get-user-current` check costs a single extra
 * chained call for users who DO have access — cheap, and it turns what would
 * otherwise be N expected 403s into 0.
 *
 * A failed access check (transient chained-CMS failure, not "no access")
 * fails closed too: this is a degraded-display fallback, not a hard gate, so
 * there's no sharper error to propagate — same reasoning as `get-member`'s
 * sensitive-data handling.
 */

import { chainCms } from "../../cms-chain.js";
import { checkUsersAccess } from "./users-access.js";

export async function resolveUserNames(userIds: string[]): Promise<Map<string, string>> {
  const uniqueIds = Array.from(new Set(userIds));
  if (uniqueIds.length === 0) return new Map();

  const accessCheck = await checkUsersAccess();
  if (!accessCheck.ok || !accessCheck.hasAccess) {
    return new Map(uniqueIds.map((id) => [id, id]));
  }

  const results = await Promise.all(
    uniqueIds.map(async (id) => {
      try {
        const userResult = await chainCms("get-user-by-id", { id });
        if (!userResult.ok) return [id, id] as const;
        return [id, userResult.data.name ?? id] as const;
      } catch {
        return [id, id] as const;
      }
    }),
  );
  return new Map(results);
}
