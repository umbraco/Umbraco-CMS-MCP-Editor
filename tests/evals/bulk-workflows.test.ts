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
  "compare-draft-to-published",
  "create-page",
  "create-and-publish-page",
  "edit-page",
  "rename-page",
  "edit-block",
  "add-blocklist-block",
  "add-blockgrid-block",
  "add-rte-block",
  "get-property-value-template",
  "list-page-templates",
  "set-page-template",
  "delete-page",
  "delete-block",
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

describe("Bulk Operation Workflows", () => {
  setupConsoleMock();

  const timeout = getDefaultTimeoutMs();

  it(
    "editor bulk publishes pages",
    runScenarioTest({
      prompt:
        "Use list-children to find the root pages, then use bulk-publish to publish them. Even if only one page is found, still call bulk-publish with that single page ID.",
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
        "Use list-children with no parentId — there will be one root page (Home). Use list-children passing Home's id to get its direct children (one level down, you'll see at least 2). Call bulk-move with ids set to [<second child's id>] and targetParentId set to <first child's id>. This moves the second sibling under the first sibling. You must call bulk-move; don't ask for clarification.",
      tools: allTools,
      requiredTools: ["bulk-move"],
      successPattern: /move|bulk|page|sibling/i,
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
