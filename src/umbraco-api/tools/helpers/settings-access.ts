/**
 * Whether the calling backoffice user has access to Umbraco's built-in
 * **Settings** section.
 *
 * Several list tools (document types, blueprints, and other Settings-only
 * trees) only work against Settings-section endpoints. A user whose Umbraco
 * account isn't granted Settings access gets a raw `Forbidden` from the
 * chained CMS tool — or, worse, a tree walk that swallows the error and
 * returns a successful but empty/truncated list. Tools use this to refuse up
 * front with a clear 403 instead.
 *
 * `checkSettingsAccess()` distinguishes "the user genuinely lacks Settings
 * access" from "the `get-user-current` check itself failed" (a transient
 * network blip, the chained CMS momentarily unavailable, an expired token):
 * callers must propagate the latter as the real error rather than telling
 * the user they need Settings access when that was never actually checked.
 *
 * Checked fresh on every call — no caching. In the hosted worker each
 * session is its own Durable Object, but multiple DOs can share a V8
 * isolate, so a module-level cache would leak one user's access answer to
 * every other user sharing that isolate. A single `get-user-current` call
 * per gated call is cheap enough to make every time.
 *
 * Modeled on `checkSensitiveDataAccess()` in `../member/sensitive-data-access.ts`.
 */

import { createToolResultError } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../cms-chain.js";
import { sections } from "../../../auth/auth-policies.js";

export type SettingsAccessCheck =
  | { ok: true; hasAccess: boolean }
  | { ok: false; errorResult: ReturnType<typeof createToolResultError> };

export async function checkSettingsAccess(): Promise<SettingsAccessCheck> {
  const result = await chainCms("get-user-current", {});
  if (!result.ok) return result;
  return { ok: true, hasAccess: result.data.allowedSections?.includes(sections.settings) ?? false };
}
