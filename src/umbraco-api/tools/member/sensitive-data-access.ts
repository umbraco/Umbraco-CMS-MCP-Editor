/**
 * Whether the calling user is in Umbraco's built-in "Sensitive Data"
 * user group (group key 8C6AD70F-D307-4E4A-AF58-72C2E4E9439D).
 *
 * Umbraco gates `isApproved`, `isLockedOut`, `isTwoFactorEnabled`, login
 * dates and member-type "sensitive" properties on both sides: responses
 * mask them to false/null/0 and incoming writes are silently reverted to
 * existing values. Member tools use this flag to either return null
 * (instead of misleading false) or refuse the operation with a clear 403.
 *
 * `checkSensitiveDataAccess()` distinguishes "the user genuinely isn't in
 * the Sensitive Data group" from "the `get-user-current` check itself
 * failed" (a transient network blip, the chained CMS momentarily
 * unavailable): a caller that refuses an operation outright (`update-member`)
 * must propagate the latter as the real error rather than telling the user
 * they need the Sensitive Data group when that was never actually checked.
 * A caller that only degrades a read (`get-member`) can fail closed and
 * treat a failed check the same as "no access" — see its own call site.
 *
 * Checked fresh on every call — no caching. In the hosted worker each
 * session is its own Durable Object, but multiple DOs can share a V8
 * isolate, so a module-level cache would leak one user's access answer to
 * every other user sharing that isolate. A single `get-user-current` call
 * per gated call is cheap enough to make every time.
 *
 * Modeled on `checkSettingsAccess()` in `../helpers/settings-access.ts`.
 */

import { createToolResultError } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../cms-chain.js";

export type SensitiveDataAccessCheck =
  | { ok: true; hasAccess: boolean }
  | { ok: false; errorResult: ReturnType<typeof createToolResultError> };

export async function checkSensitiveDataAccess(): Promise<SensitiveDataAccessCheck> {
  const result = await chainCms("get-user-current", {});
  if (!result.ok) return result;
  return { ok: true, hasAccess: result.data.hasAccessToSensitiveData ?? false };
}
