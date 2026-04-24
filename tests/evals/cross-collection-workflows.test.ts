/**
 * Cross-Collection Workflow Eval Tests
 *
 * These tests validate multi-step workflows where the LLM must chain tools
 * across different collections (content, media, languages, dictionary, etc.).
 *
 * Write operations use elicitation which is auto-accepted by the eval runner.
 */

import { describe, it } from "@jest/globals";
import {
  runScenarioTest,
  setupConsoleMock,
  getDefaultTimeoutMs,
} from "@umbraco-cms/mcp-server-sdk/evals";

const allTools = [
  // Content
  "search-content",
  "get-page",
  "list-children",
  "list-document-types",
  "inspect-blocks",
  "create-page",
  "edit-page",
  "edit-block",
  "delete-page",
  "restore-page",
  // Publishing
  "publish-page",
  "unpublish-page",
  // Versioning
  "list-versions",
  "rollback-page",
  "get-page-change-history",
  // Media
  "search-media",
  "list-media-children",
  "get-media",
  "list-media-types",
  "upload-media",
  "create-media-folder",
  "move-media",
  "delete-media",
  "restore-media",
  "bulk-move-media",
  "get-media-change-history",
  // Recycle Bin
  "list-recycle-bin",
  "permanent-delete-recycle-bin-item",
  "empty-recycle-bin",
  // Blueprints
  "list-blueprints",
  "get-blueprint",
  "create-blueprint",
  // Languages
  "list-languages",
  "get-language",
  "create-language",
  "update-language",
  "delete-language",
  // Translation
  "create-variant",
  "copy-variant",
  "list-untranslated",
  // Dictionary
  "list-dictionary",
  "search-dictionary",
  "get-dictionary",
  "create-dictionary",
  "update-dictionary",
  "move-dictionary",
  // Tags
  "list-tags",
  // Content Health
  "audit-page-seo",
  "audit-page-content",
  // DISABLED (tree walk, scanLimit=100): "report-empty-fields", "report-short-content", "report-media-missing-alt"
  // Content Reporting — DISABLED at collection level (tree walk, scanLimit=100–500):
  // "report-stale-content", "report-unpublished", "report-recently-changed",
  // "report-content-by-type", "report-translation-coverage"
  // Site Structure
  "report-site-tree-summary",
  "report-deep-pages",
  // Media Health — DISABLED at collection level (tree walk, scanLimit=100): "report-large-media"
  // Relationships
  "report-content-references",
  // DISABLED (tree walk, scanLimit=100): "report-orphan-pages"
  "report-outbound-links",
  // Bulk Operations
  "bulk-publish",
  "bulk-unpublish",
  "bulk-schedule-publish",
  "bulk-set-property",
  "bulk-move",
  "bulk-set-block-property",
  // Members
  "search-members",
  "get-member",
  "list-member-types",
  "create-member",
  "update-member",
  "delete-member",
  // Member Groups
  "list-member-groups",
  "create-member-group",
  "delete-member-group",
  // Member Reporting
  "report-member-count",
  "report-members-by-group",
  "report-member-activity",
  // Scheduling — DISABLED (tree walk, scanLimit=100): "list-scheduled-content"
  "get-publish-status",
  "schedule-publish",
  "cancel-schedule",
  // Redirects
  "list-redirects",
  "get-redirect",
  "delete-redirect",
  "get-redirect-status",
  // Public Access
  "get-public-access",
  "set-public-access",
  "remove-public-access",
  // Notifications (hosted-only — exposed in evals for coverage)
  "get-content-notifications",
  "set-content-notifications",
];

describe("Cross-Collection Workflows", () => {
  setupConsoleMock();

  const timeout = getDefaultTimeoutMs();

  it(
    "copy and translate workflow",
    runScenarioTest({
      prompt:
        "Complete these tasks in order: 1. Use list-children to find the homepage and get its ID. 2. Call copy-variant with the homepage ID to copy the en-US content to da-DK (you must call copy-variant even if the culture does not exist yet). 3. Report the result.",
      tools: allTools,
      requiredTools: ["copy-variant"],
      successPattern: /copy|variant|danish|da|velkommen|confirm|copied|error/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "create dictionary with language lookup",
    runScenarioTest({
      prompt:
        "First check what languages are available with list-languages, then create a dictionary key 'Buttons.ContactUs' with translations for each language found. Use the ISO codes from list-languages.",
      tools: allTools,
      requiredTools: ["list-languages", "create-dictionary"],
      successPattern: /dictionary|created|contact|confirm/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "media browse and inspect",
    runScenarioTest({
      prompt:
        "Complete these two tasks in order: Step 1 — call search-media with query 'image' to find media items. Step 2 — if results are returned, take the id field from the first result and call get-media with that id to retrieve full details. Report what you find, including any errors.",
      tools: ["list-media-children", "get-media", "search-media"],
      requiredTools: ["search-media"],
      successPattern: /media|url|detail|item|image|type|error|found/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "blueprint browse and inspect",
    runScenarioTest({
      prompt:
        "List available blueprints, then show me the full details and property values of the first one.",
      tools: ["list-blueprints", "get-blueprint"],
      requiredTools: ["list-blueprints"],
      successPattern: /blueprint|template|properties|values|no blueprint/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "dictionary tree then details",
    runScenarioTest({
      prompt:
        "Browse the dictionary root with list-dictionary, then use get-dictionary to see all translations for the first item found.",
      tools: ["list-dictionary", "get-dictionary", "search-dictionary"],
      requiredTools: ["list-dictionary", "get-dictionary"],
      successPattern: /dictionary|translation|language/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "media organise workflow",
    runScenarioTest({
      prompt:
        "Create a folder called 'Test Archives' in the media library root using create-media-folder.",
      tools: allTools,
      requiredTools: ["create-media-folder"],
      successPattern: /folder|created|archives|confirm/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "language-aware translation audit",
    runScenarioTest({
      prompt:
        "Complete these tasks in order: 1. Call list-languages to see what languages are configured. 2. Call list-untranslated — you must call this tool regardless of how many languages exist. Pass any ISO code you found in step 1. Report what you find.",
      tools: allTools,
      requiredTools: ["list-languages", "list-untranslated"],
      successPattern: /language|untranslated|missing|translation|page/i,
      verbose: true,
    }),
    timeout
  );
});
