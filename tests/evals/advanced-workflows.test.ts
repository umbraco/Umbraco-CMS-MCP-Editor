/**
 * Advanced Workflow Eval Tests
 *
 * These tests validate multi-tool reasoning, decision-making, and reporting
 * workflows where the LLM must chain health, audit, and structure tools.
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
  // Library Elements
  "get-element",
  "list-element-children",
  "search-elements",
  "inspect-element-blocks",
  "create-element",
  "create-element-folder",
  "edit-element",
  "edit-element-block",
  "publish-element",
  "unpublish-element",
  "delete-element",
  // Content
  "search-content",
  "get-page",
  "list-children",
  "list-document-types",
  "inspect-blocks",
  "compare-draft-to-published",
  "create-page",
  "edit-page",
  "rename-page",
  "edit-block",
  "add-blocklist-block",
  "add-blockgrid-block",
  "add-rte-block",
  "get-property-value-template",
  "list-page-templates",
  "set-page-template",
  "sort-children-by-field",
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
  "sort-media-children-by-field",
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
  // DISABLED — global tree-walking collections are not registered (see #20). Do not
  // add scenarios that require these until the collections are re-enabled:
  //   Content Reporting: report-stale-content, report-unpublished, report-recently-changed,
  //                      report-content-by-type, report-translation-coverage
  //   Content Health (dropped in #46): report-empty-fields, report-short-content, report-media-missing-alt
  //   Media Health: report-large-media
  // Site Structure
  "report-site-tree-summary",
  "report-deep-pages",
  // Relationships
  "report-content-references",
  // DISABLED (tree walk): report-orphan-pages
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
  // Dropped from the product (#46) — not registered: "list-scheduled-content"
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

describe("Advanced Workflows", () => {
  setupConsoleMock();

  const timeout = getDefaultTimeoutMs();

  it(
    "check before deleting media",
    runScenarioTest({
      prompt:
        "I want to delete a media item. First use list-media-children to find the first media item, then use report-content-references with type 'media' to check if anything references it. Tell me if it's safe to delete.",
      tools: allTools,
      requiredTools: ["report-content-references"],
      successPattern: /reference|safe|delete|used|not used/i,
      verbose: true,
    }),
    timeout
  );

  // Removed (see #20): scenarios requiring the disabled Content Reporting /
  // Media Health tree-walking collections — report-unpublished, report-large-media,
  // report-translation-coverage, report-recently-changed, report-content-by-type.
  // Re-add them when those collections are re-enabled (filtered-pages endpoint).

  it(
    "pre-publish SEO check",
    runScenarioTest({
      prompt:
        "Check if the homepage is ready to publish — use audit-page-seo to check its SEO health. First find the homepage with search-content or list-children.",
      tools: allTools,
      requiredTools: ["audit-page-seo"],
      successPattern: /seo|title|meta|ready|audit|heading/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "scoped SEO audit",
    runScenarioTest({
      prompt:
        "Use audit-page-seo on the homepage to check its SEO. First find the homepage.",
      tools: allTools,
      requiredTools: ["audit-page-seo"],
      successPattern: /seo|meta|title|heading|image|audit/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "site structure diagram request",
    runScenarioTest({
      prompt:
        "Use report-site-tree-summary with maxDepth 3 to get the site structure. Show me the tree data.",
      tools: ["report-site-tree-summary", "list-children"],
      requiredTools: ["report-site-tree-summary"],
      successPattern: /tree|structure|level|page|depth/i,
      verbose: true,
    }),
    timeout
  );

});
