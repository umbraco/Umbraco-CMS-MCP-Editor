/**
 * Whether the calling backoffice user has access to Umbraco's built-in
 * **Users** section.
 *
 * Tools that resolve a raw user ID to a display name (audit-log entries,
 * rollback confirmations) call `get-user-by-id`. An API user that isn't
 * granted Users access gets a 403 from every one of those calls — the tool
 * still works by falling back to the raw ID, but each 403 is recorded as an
 * `api_error` on the chained call, and a burst of them (one per distinct
 * user ID being resolved) can trip alerting meant to catch real system
 * errors. See issue #307.
 *
 * `checkUsersAccess()` distinguishes "the user genuinely lacks Users access"
 * from "the `get-user-current` check itself failed" (a transient network
 * blip, the chained CMS momentarily unavailable, an expired token). Callers
 * doing a degraded-display fallback (the only use today) can fail closed and
 * treat a failed check the same as "no access" — see the call sites.
 *
 * Checked fresh on every call — no caching. In the hosted worker each
 * session is its own Durable Object, but multiple DOs can share a V8
 * isolate, so a module-level cache would leak one user's access answer to
 * every other user sharing that isolate. A single `get-user-current` call
 * per gated call is cheap enough to make every time, and it replaces what
 * would otherwise be one `get-user-by-id` 403 per distinct user ID with a
 * single call that's expected to succeed.
 *
 * Modeled on `checkSettingsAccess()` in `./settings-access.ts`.
 */

import { createToolResultError } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../cms-chain.js";
import { sections } from "../../../auth/auth-policies.js";

export type UsersAccessCheck =
  | { ok: true; hasAccess: boolean }
  | { ok: false; errorResult: ReturnType<typeof createToolResultError> };

export async function checkUsersAccess(): Promise<UsersAccessCheck> {
  const result = await chainCms("get-user-current", {});
  if (!result.ok) return result;
  return { ok: true, hasAccess: result.data.allowedSections?.includes(sections.users) ?? false };
}
