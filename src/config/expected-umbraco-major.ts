/**
 * Expected Umbraco Major — single source of truth
 *
 * Both entry points (stdio `index.ts` and the hosted `worker.ts`) need the
 * same default: the Umbraco major this package targets. That default is the
 * major component of this package's own `version` field (this package's
 * major deliberately tracks the Umbraco major it targets — 18.x on
 * `dev`/`main`, 17.x on `v17/dev`/`v17/main` — see CLAUDE.md's Gitflow
 * section), overridable per-deployment via `UMBRACO_EXPECTED_MAJOR`.
 *
 * `override?.trim() || packageJson.version.split(".")[0]` matches
 * `@umbraco-cms/mcp-dev`'s own `process.env.UMBRACO_EXPECTED_MAJOR?.trim() ||
 * UMBRACO_TARGET_MAJOR` — an override that is empty or all whitespace falls
 * back to the default rather than disabling the check with no log output.
 * `@umbraco-cms/mcp-hosted` instead does `env.UMBRACO_EXPECTED_MAJOR ??
 * options.expectedUmbracoMajor`, which an *empty string* override would NOT
 * fall back from (`??` only falls back on `null`/`undefined`). That is a gap
 * in the upstream `mcp-hosted` package, not something this function can fix
 * from the outside — see CLAUDE.md's configuration notes.
 */

import packageJson from "../../package.json" with { type: "json" };

export function getExpectedUmbracoMajor(override?: string): string {
  return override?.trim() || packageJson.version.split(".")[0];
}
