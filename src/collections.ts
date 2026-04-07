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
import languageCollection from "./umbraco-api/tools/language/index.js";
import translationCollection from "./umbraco-api/tools/translation/index.js";
import dictionaryCollection from "./umbraco-api/tools/dictionary/index.js";
import tagCollection from "./umbraco-api/tools/tag/index.js";
import contentHealthCollection from "./umbraco-api/tools/content-health/index.js";
import contentReportingCollection from "./umbraco-api/tools/content-reporting/index.js";
import siteStructureCollection from "./umbraco-api/tools/site-structure/index.js";
import mediaHealthCollection from "./umbraco-api/tools/media-health/index.js";
import bulkOperationsCollection from "./umbraco-api/tools/bulk-operations/index.js";
import memberCollection from "./umbraco-api/tools/member/index.js";
import memberGroupCollection from "./umbraco-api/tools/member-group/index.js";
import memberReportingCollection from "./umbraco-api/tools/member-reporting/index.js";

export const collections = [
  contentCollection,
  publishingCollection,
  versioningCollection,
  mediaCollection,
  mediaManagementCollection,
  blueprintCollection,
  languageCollection,
  translationCollection,
  dictionaryCollection,
  tagCollection,
  contentHealthCollection,
  contentReportingCollection,
  siteStructureCollection,
  mediaHealthCollection,
  bulkOperationsCollection,
  memberCollection,
  memberGroupCollection,
  memberReportingCollection,
];

export { allModes, allModeNames } from "./config/mode-registry.js";
export { allSliceNames } from "./config/slice-registry.js";
