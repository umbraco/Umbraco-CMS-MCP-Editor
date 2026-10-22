/**
 * The Umbraco major this server targets, shared by both entry points: a
 * non-blank override, else this package's major (which tracks the Umbraco
 * major). Same `?.trim() ||` fallback as @umbraco-cms/mcp-dev — see CLAUDE.md
 * "Umbraco-major version guard".
 */

import packageJson from "../../package.json" with { type: "json" };

export function getExpectedUmbracoMajor(override?: string): string {
  return override?.trim() || packageJson.version.split(".")[0];
}
