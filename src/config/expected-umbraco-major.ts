/**
 * The Umbraco major this server targets, shared by both entry points: a
 * non-blank override, else the generated UMBRACO_TARGET_MAJOR (`npm run
 * generate`). Same `?.trim() ||` fallback as @umbraco-cms/mcp-dev — see
 * CLAUDE.md "Umbraco-major version guard".
 */

import { UMBRACO_TARGET_MAJOR } from "./umbraco-target.generated.js";

export function getExpectedUmbracoMajor(override?: string): string {
  return override?.trim() || UMBRACO_TARGET_MAJOR;
}
