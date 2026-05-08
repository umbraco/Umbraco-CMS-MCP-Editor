/**
 * Whether the calling API user is in Umbraco's built-in "Sensitive Data"
 * user group (group key 8C6AD70F-D307-4E4A-AF58-72C2E4E9439D).
 *
 * Umbraco gates `isApproved`, `isLockedOut`, `isTwoFactorEnabled`, login
 * dates and member-type "sensitive" properties on both sides: responses
 * mask them to false/null/0 and incoming writes are silently reverted to
 * existing values. Member tools use this flag to either return null
 * (instead of misleading false) or refuse the operation with a clear 403.
 *
 * The result is fetched once via `get-user-current` and cached for the
 * process lifetime; group membership changes need a server restart.
 */

import { chainCms } from "../../cms-chain.js";

let cachedAccess: boolean | undefined;

export async function hasSensitiveDataAccess(): Promise<boolean> {
  if (cachedAccess !== undefined) return cachedAccess;
  const result = await chainCms("get-user-current", {});
  cachedAccess = result.ok ? result.data.hasAccessToSensitiveData ?? false : false;
  return cachedAccess;
}

/** For tests — clear the cache so the next call re-fetches. */
export function clearSensitiveDataAccessCache(): void {
  cachedAccess = undefined;
}
