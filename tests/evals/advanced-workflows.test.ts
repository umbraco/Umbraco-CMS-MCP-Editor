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

  // SKIPPED: report-unpublished is disabled (tree walk). Re-enable with this test once
  // a filtered-pages endpoint replaces the walker.
  it.skip(
    "find stale unpublished pages",
    runScenarioTest({
      prompt:
        "Use report-unpublished to find draft pages. Report which ones exist and their state.",
      tools: ["report-unpublished", "report-stale-content", "list-children"],
      requiredTools: ["report-unpublished"],
      successPattern: /draft|unpublished|page|state/i,
      verbose: true,
    }),
    timeout
  );

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

  // SKIPPED: report-short-content / report-empty-fields / report-stale-content are disabled (tree walk).
  it.skip(
    "content health summary",
    runScenarioTest({
      prompt:
        "Give me a quick content health overview — use report-short-content with a threshold of 50 words to find thin pages.",
      tools: [
        "report-short-content",
        "report-empty-fields",
        "report-stale-content",
        "list-children",
      ],
      requiredTools: ["report-short-content"],
      successPattern: /short|thin|word|content|page/i,
      verbose: true,
    }),
    timeout
  );

  // SKIPPED: report-large-media is disabled (tree walk).
  it.skip(
    "find large unused media",
    runScenarioTest({
      prompt:
        "Use report-large-media with a threshold of 500KB to find oversized files in the media library.",
      tools: ["report-large-media", "list-media-children"],
      requiredTools: ["report-large-media"],
      successPattern: /large|size|media|file|KB|MB/i,
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

  // SKIPPED: report-translation-coverage is disabled (tree walk).
  it.skip(
    "translation coverage report",
    runScenarioTest({
      prompt:
        "Use report-translation-coverage to show which pages have which language variants. Include the summary statistics.",
      tools: ["report-translation-coverage", "list-languages"],
      requiredTools: ["report-translation-coverage"],
      successPattern: /translation|coverage|language|percentage|variant/i,
      verbose: true,
    }),
    timeout
  );

  // SKIPPED: report-recently-changed is disabled (tree walk).
  it.skip(
    "recently changed unpublished",
    runScenarioTest({
      prompt:
        "Use report-recently-changed with daysBack 30 to find pages changed in the last month.",
      tools: ["report-recently-changed", "report-unpublished", "list-children"],
      requiredTools: ["report-recently-changed"],
      successPattern: /changed|recent|page|day|modified/i,
      verbose: true,
    }),
    timeout
  );

  // SKIPPED: report-content-by-type is disabled (tree walk).
  it.skip(
    "content type distribution",
    runScenarioTest({
      prompt:
        "Use report-content-by-type to show me a breakdown of how many pages use each document type.",
      tools: ["report-content-by-type", "list-children"],
      requiredTools: ["report-content-by-type"],
      successPattern: /type|document|count|page|breakdown/i,
      verbose: true,
    }),
    timeout
  );
});
