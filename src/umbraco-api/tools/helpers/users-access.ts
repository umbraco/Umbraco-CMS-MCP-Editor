/**
 * Whether the calling backoffice user has access to Umbraco's built-in
 * **Users** section.
 *
 * `get-user-by-id` is gated on the same Users-section access: an editor
 * whose account isn't granted Users access gets a raw `Forbidden` from the
 * chained CMS tool every time it's called. Change-history and rollback
 * tools use this to check once, up front, and skip the per-ID lookup
 * entirely instead of calling it and handling the 403 reactively — see
 * `resolve-user-names.ts`, which is what actually consumes this.
 *
 * `checkUsersAccess()` distinguishes "the user genuinely lacks Users
 * access" from "the `get-user-current` check itself failed" (a transient
 * network blip, the chained CMS momentarily unavailable, an expired token):
 * callers must propagate the latter as the real error rather than treating
 * a failed check as "no access", unless — as with the name-resolution
 * fallback here — degrading to a less friendly result is an acceptable
 * failure mode for that specific caller.
 *
 * Checked fresh on every call — no caching. In the hosted worker each
 * session is its own Durable Object, but multiple DOs can share a V8
 * isolate, so a module-level cache would leak one user's access answer to
 * every other user sharing that isolate. A single `get-user-current` call
 * per gated call is cheap enough to make every time.
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
