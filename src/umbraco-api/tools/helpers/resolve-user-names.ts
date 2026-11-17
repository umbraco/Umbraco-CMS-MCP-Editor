/**
 * Resolve Umbraco user IDs to display names, falling back to the raw ID
 * when a name can't be resolved — shared by the change-history and
 * rollback tools that show "who did this" in their output.
 *
 * Checks Users-section access once via `checkUsersAccess()` before making
 * any `get-user-by-id` calls. An editor outside the Users section always
 * gets a 403 from that lookup (see `./users-access.ts` for why), and
 * calling it anyway just trades a clean skip for a chained-call `api_error`
 * on every single ID — for the exact same raw-ID fallback the tool would
 * show either way. (See issue #307: this 403-per-lookup pattern tripped
 * the "chained tool-call system error rate high" alert in production even
 * though every tool call itself succeeded.)
 *
 * A failed *access check* (network blip, expired token, chained CMS
 * momentarily unavailable) is treated the same as "no access" here: these
 * callers only use resolved names for a friendlier display, so degrading to
 * raw IDs is an acceptable failure mode — unlike a tool that would refuse
 * outright when an access check fails.
 */

import { chainCms } from "../../cms-chain.js";
import { checkUsersAccess } from "./users-access.js";

/** Resolve a batch of user IDs to display names (deduped internally). */
export async function resolveUserNames(userIds: string[]): Promise<Map<string, string>> {
  const uniqueIds = Array.from(new Set(userIds));
  if (uniqueIds.length === 0) return new Map();

  let accessCheck;
  try {
    accessCheck = await checkUsersAccess();
  } catch (error) {
    // checkUsersAccess() delegates to chainCms, which normally never throws
    // (it normalizes failures to { ok: false }) — but guard against an
    // unexpected throw anyway, since this helper only ever degrades to the
    // raw-ID fallback and must never itself throw.
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `resolveUserNames: users-access check threw unexpectedly, falling back to raw IDs: ${message}`,
    );
    return new Map(uniqueIds.map((id) => [id, id] as const));
  }
  if (!accessCheck.ok) {
    console.warn(
      `resolveUserNames: users-access check failed, falling back to raw IDs: ${JSON.stringify(accessCheck.errorResult)}`,
    );
    return new Map(uniqueIds.map((id) => [id, id] as const));
  }
  if (!accessCheck.hasAccess) {
    // Expected/routine path — the editor genuinely lacks Users access. This
    // is exactly the case issue #307 exists to keep quiet, so no logging here.
    return new Map(uniqueIds.map((id) => [id, id] as const));
  }

  const results = await Promise.all(
    uniqueIds.map(async (id) => {
      try {
        const userResult = await chainCms("get-user-by-id", { id });
        if (!userResult.ok) return [id, id] as const;
        return [id, userResult.data.name ?? id] as const;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          `resolveUserNames: unexpected error resolving user ${id} — falling back to raw ID: ${message}`,
        );
        return [id, id] as const;
      }
    }),
  );
  return new Map(results);
}

/** Resolve a single user ID to a display name. */
export async function resolveUserName(userId: string): Promise<string> {
  const names = await resolveUserNames([userId]);
  return names.get(userId) ?? userId;
}
