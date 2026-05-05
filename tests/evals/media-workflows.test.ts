/**
 * Media and Blueprint Workflow Eval Tests
 *
 * These tests cover media library operations (read and write) and blueprint
 * discovery and creation workflows. Write tests mutate shared state so all
 * tests in this file run sequentially (Jest default).
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
  "add-blocklist-block",
  "add-blockgrid-block",
  "add-rte-block",
  "get-property-value-template",
  "list-page-templates",
  "set-page-template",
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

describe("Media and Blueprint Workflows", () => {
  setupConsoleMock();

  const timeout = getDefaultTimeoutMs();

  it(
    "editor asks to find images with banner in the name",
    runScenarioTest({
      prompt: "Find images in the media library that have 'banner' in the name",
      tools: [
        "search-media",
        "list-media-children",
        "get-media",
        "list-media-types",
      ],
      requiredTools: ["search-media"],
      successPattern: /banner|image|media|found|result/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "editor asks for media item details and URL",
    runScenarioTest({
      prompt:
        "List the items in the media library root. If you find any items, use get-media to fetch the full details of the first one, including its URL. Tell me what you find — even if the library is empty.",
      tools: ["list-media-children", "get-media", "search-media"],
      requiredTools: ["list-media-children"],
      successPattern: /url|media|detail|empty|no item|found/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "editor asks what folders are in the media library",
    runScenarioTest({
      prompt: "What folders are in the media library?",
      tools: [
        "search-media",
        "list-media-children",
        "get-media",
        "list-media-types",
      ],
      requiredTools: ["list-media-children"],
      successPattern: /folder|media|root/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "editor asks to upload a file",
    runScenarioTest({
      prompt:
        "Upload the file at /tmp/test-banner.jpg to the media library root",
      tools: [
        "search-media",
        "list-media-children",
        "get-media",
        "list-media-types",
        "upload-media",
        "create-media-folder",
        "move-media",
      ],
      requiredTools: ["upload-media"],
      successPattern: /upload|banner|confirm/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "editor asks what page templates are available",
    runScenarioTest({
      prompt: "What page templates or blueprints are available?",
      tools: ["list-blueprints", "get-blueprint"],
      requiredTools: ["list-blueprints"],
      successPattern: /blueprint|template|available/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "editor asks to save a page as a blueprint",
    runScenarioTest({
      prompt:
        "Save the homepage as a blueprint called 'Homepage Template'",
      tools: allTools,
      requiredTools: ["create-blueprint"],
      successPattern: /blueprint|template|saved|created|confirm/i,
      verbose: true,
    }),
    timeout
  );
});
