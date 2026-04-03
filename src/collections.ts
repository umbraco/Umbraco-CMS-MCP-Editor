/**
 * Tool Collections Export
 *
 * Lightweight entry point for in-process chaining.
 * Import this from another MCP server to chain tools without spawning a process.
 *
 * @example
 * ```typescript
 * import { collections, allModes, allModeNames, allSliceNames } from "my-umbraco-mcp/collections";
 *
 * manager.registerServer({
 *   transport: "in-process",
 *   name: "my-addon",
 *   collections,
 *   modeRegistry: allModes,
 *   allModeNames,
 *   allSliceNames,
 * });
 * ```
 */

import contentCollection from "./umbraco-api/tools/content/index.js";
import publishingCollection from "./umbraco-api/tools/publishing/index.js";
import versioningCollection from "./umbraco-api/tools/versioning/index.js";
import mediaCollection from "./umbraco-api/tools/media/index.js";
import mediaManagementCollection from "./umbraco-api/tools/media-management/index.js";
import blueprintCollection from "./umbraco-api/tools/blueprint/index.js";

export const collections = [
  contentCollection,
  publishingCollection,
  versioningCollection,
  mediaCollection,
  mediaManagementCollection,
  blueprintCollection,
];

export { allModes, allModeNames } from "./config/mode-registry.js";
export { allSliceNames } from "./config/slice-registry.js";
