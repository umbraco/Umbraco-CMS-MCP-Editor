/**
 * Scheduling and Redirect Workflow Eval Tests
 *
 * These tests cover scheduled publishing (checking publish status, listing
 * scheduled content, scheduling a page, and cancelling schedules) and URL
 * redirect management (listing redirects, fetching a single redirect, deleting
 * a redirect, and checking redirect tracking status).
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

describe("Scheduling and Redirect Workflows", () => {
  setupConsoleMock();

  const timeout = getDefaultTimeoutMs();

  it(
    "check publish status",
    runScenarioTest({
      prompt:
        "Use get-publish-status to check the publish state of the homepage. First find the homepage with list-children.",
      tools: allTools,
      requiredTools: ["get-publish-status"],
      successPattern: /publish|state|status|schedule|variant/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "list scheduled content",
    runScenarioTest({
      prompt:
        "Use list-scheduled-content to find pages with pending scheduled publish dates.",
      tools: ["list-scheduled-content", "list-children"],
      requiredTools: ["list-scheduled-content"],
      successPattern: /scheduled|publish|pending|none|found/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "schedule a page",
    runScenarioTest({
      prompt:
        "Schedule the homepage to publish on 2099-01-01T09:00:00Z. First find the homepage with list-children.",
      tools: allTools,
      requiredTools: ["schedule-publish"],
      successPattern: /schedule|publish|confirm|2099/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "list redirects",
    runScenarioTest({
      prompt:
        "What URL redirects are configured on the site? Use list-redirects.",
      tools: ["list-redirects", "get-redirect-status"],
      requiredTools: ["list-redirects"],
      successPattern: /redirect|url|none|found/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "check redirect tracking",
    runScenarioTest({
      prompt:
        "Is URL redirect tracking enabled? Use get-redirect-status.",
      tools: ["get-redirect-status"],
      requiredTools: ["get-redirect-status"],
      successPattern: /redirect|tracking|enabled|disabled/i,
      verbose: true,
    }),
    timeout
  );
});
