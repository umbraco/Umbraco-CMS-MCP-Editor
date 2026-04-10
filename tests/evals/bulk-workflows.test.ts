/**
 * Bulk Operation Workflow Eval Tests
 *
 * These tests validate bulk content operations where the LLM must first
 * discover page IDs via list-children and then apply bulk actions.
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
  // Publishing
  "publish-page",
  "unpublish-page",
  // Versioning
  "list-versions",
  "rollback-page",
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
  "report-empty-fields",
  "report-short-content",
  "report-media-missing-alt",
  // Content Reporting
  "report-stale-content",
  "report-unpublished",
  "report-recently-changed",
  "report-content-by-type",
  "report-translation-coverage",
  // Site Structure
  "report-site-tree-summary",
  "report-deep-pages",
  // Media Health
  "report-large-media",
  // Relationships
  "report-content-references",
  "report-orphan-pages",
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
  // Scheduling
  "get-publish-status",
  "list-scheduled-content",
  "schedule-publish",
  "cancel-schedule",
  // Redirects
  "list-redirects",
  "get-redirect",
  "delete-redirect",
  "get-redirect-status",
];

describe("Bulk Operation Workflows", () => {
  setupConsoleMock();

  const timeout = getDefaultTimeoutMs();

  it(
    "editor bulk publishes pages",
    runScenarioTest({
      prompt:
        "Use list-children to find the root pages, then use bulk-publish to publish the first two pages found.",
      tools: allTools,
      requiredTools: ["bulk-publish"],
      successPattern: /publish|bulk|page|confirm/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "editor bulk unpublishes pages",
    runScenarioTest({
      prompt:
        "Use list-children to find root pages, then use bulk-unpublish on the first page.",
      tools: allTools,
      requiredTools: ["bulk-unpublish"],
      successPattern: /unpublish|bulk|offline|confirm/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "editor schedules bulk publish",
    runScenarioTest({
      prompt:
        "Use bulk-schedule-publish to schedule the homepage to publish on 2099-01-01T09:00:00Z. First find the homepage with list-children.",
      tools: allTools,
      requiredTools: ["bulk-schedule-publish"],
      successPattern: /schedule|publish|bulk|date|confirm/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "editor sets property on multiple pages",
    runScenarioTest({
      prompt:
        "Use list-children to find root pages, then use bulk-set-property to set the 'title' property to 'Updated' on the first page.",
      tools: allTools,
      requiredTools: ["bulk-set-property"],
      successPattern: /set|property|bulk|title|confirm/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "editor moves pages",
    runScenarioTest({
      prompt:
        "Use list-children to find root pages. Then use list-children again passing the first page's ID to find its children. Use bulk-move to move the first child page you find under the root Home page. You must call bulk-move regardless of the result — if there are no children report the error and say 'bulk-move attempted'.",
      tools: allTools,
      requiredTools: ["bulk-move"],
      successPattern: /move|bulk|page|confirm|attempted/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "editor bulk updates block properties across pages",
    runScenarioTest({
      prompt:
        "Use list-children to find root pages. Then use inspect-blocks on the first page to discover its block types and property aliases. Then use bulk-set-block-property to update a property on all blocks of that type on the first page. Use the same value that's already there if you need to — the goal is to exercise the tool.",
      tools: allTools,
      requiredTools: ["inspect-blocks", "bulk-set-block-property"],
      successPattern: /block|update|bulk|confirm/i,
      verbose: true,
    }),
    timeout
  );
});
