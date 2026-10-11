/**
 * Whether the calling API user has access to Umbraco's built-in **Settings**
 * backoffice section.
 *
 * Several list tools (document types, blueprints, and other Settings-only
 * trees) only work against Settings-section endpoints. An editor whose
 * Umbraco user isn't granted Settings access gets a raw `Forbidden` from the
 * chained CMS tool — or, worse, a tree walk that swallows the error and
 * returns a successful but empty/truncated list. Tools use this flag to
 * refuse up front with a clear 403 instead.
 *
 * A successful result is fetched once via `get-user-current` and cached for
 * the process lifetime; group/section membership changes need a server
 * restart. A failed `get-user-current` call (network blip, chained CMS
 * momentarily unavailable, etc.) is never cached — that call fails closed
 * (returns `false`), but the next call retries `get-user-current` fresh
 * rather than being stuck on a transient failure forever.
 *
 * Modeled directly on `hasSensitiveDataAccess()` in
 * `../member/sensitive-data-access.ts`.
 */

import { chainCms } from "../../cms-chain.js";
import { sections } from "../../../auth/auth-policies.js";

let cachedAccess: boolean | undefined;

export async function hasSettingsAccess(): Promise<boolean> {
  if (cachedAccess !== undefined) return cachedAccess;
  const result = await chainCms("get-user-current", {});
  if (!result.ok) return false; // don't cache a transient failure — retry next call
  cachedAccess = result.data.allowedSections?.includes(sections.settings) ?? false;
  return cachedAccess;
}

/** For tests — clear the cache so the next call re-fetches. */
export function clearSettingsAccessCache(): void {
  cachedAccess = undefined;
}
