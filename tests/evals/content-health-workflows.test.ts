/**
 * Content Health and Reporting Workflow Eval Tests
 *
 * These tests cover SEO auditing, content quality checks, stale content
 * reporting, site structure analysis, media health, and translation coverage.
 * All tests are read-only and are safe to run sequentially.
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

describe("Content Health and Reporting Workflows", () => {
  setupConsoleMock();

  const timeout = getDefaultTimeoutMs();

  it(
    "editor asks for SEO audit",
    runScenarioTest({
      prompt:
        "Audit the homepage's SEO health — check its title, meta description, headings, and images. First find the homepage with search-content or list-children.",
      tools: allTools,
      requiredTools: ["audit-page-seo"],
      successPattern: /seo|title|meta|heading|image|audit/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "editor checks content alignment",
    runScenarioTest({
      prompt:
        "Does the homepage meta description match its actual content? Use audit-page-content to check. First find the homepage.",
      tools: allTools,
      requiredTools: ["audit-page-content"],
      successPattern: /meta|content|description|match|align/i,
      verbose: true,
    }),
    timeout
  );

  // Removed (see #20): "editor finds stale content" required report-stale-content,
  // in the disabled Content Reporting collection.

  it(
    "editor views site structure",
    runScenarioTest({
      prompt:
        "Use report-site-tree-summary to show me the site structure with page counts per level.",
      tools: ["report-site-tree-summary", "list-children"],
      requiredTools: ["report-site-tree-summary"],
      successPattern: /tree|site|structure|level|page/i,
      verbose: true,
    }),
    timeout
  );

  // Removed (see #20): "editor checks media alt text" (report-media-missing-alt,
  // dropped in #46) and "editor checks translation coverage" (report-translation-coverage,
  // in the disabled Content Reporting collection).
});
