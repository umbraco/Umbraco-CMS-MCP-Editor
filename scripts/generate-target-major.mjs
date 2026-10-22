#!/usr/bin/env node
/**
 * Stamps src/config/umbraco-target.generated.ts with the Umbraco major the
 * connected instance reports, using the SDK's target-major transformer — the
 * same source of truth @umbraco-cms/mcp-dev generates its constant from. The
 * transformer never reads the spec, so this runs it without Orval.
 *
 * Needs UMBRACO_BASE_URL, UMBRACO_CLIENT_ID and UMBRACO_CLIENT_SECRET (.env).
 * Rerun after upgrading Umbraco, and commit the result.
 *
 * Usage: npm run generate
 */

import "dotenv/config";
import { createUmbracoTargetMajorTransformer } from "@umbraco-cms/mcp-server-sdk/orval";

await createUmbracoTargetMajorTransformer({
  outputPath: "./src/config/umbraco-target.generated.ts",
})({});
