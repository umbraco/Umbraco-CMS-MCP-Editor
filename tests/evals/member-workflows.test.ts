/**
 * Member Workflow Eval Tests
 *
 * These tests cover member search, profile viewing, creation, group listing,
 * member count reporting, and activity reporting.
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
  "bulk-move-media",
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

describe("Member Workflows", () => {
  setupConsoleMock();

  const timeout = getDefaultTimeoutMs();

  it(
    "find a member",
    runScenarioTest({
      prompt:
        "Use search-members to search for members matching 'admin' or 'test'.",
      tools: ["search-members", "get-member"],
      requiredTools: ["search-members"],
      successPattern: /member|search|found|admin|test/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "view member profile",
    runScenarioTest({
      prompt:
        "Use search-members to find a member matching 'member'. If a result is found, use get-member to show their full profile details. If no members exist, report that the member list is empty.",
      tools: allTools,
      requiredTools: ["search-members"],
      successPattern: /member|profile|email|group|empty|no member/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "create member",
    runScenarioTest({
      prompt:
        "Use list-member-types to find a valid member type, then use create-member to create a test member with email eval-test@example.com.",
      tools: allTools,
      requiredTools: ["create-member"],
      successPattern: /member|created|confirm/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "member count",
    runScenarioTest({
      prompt:
        "Use report-member-count to show a breakdown of members by type and group.",
      tools: ["report-member-count", "list-member-groups"],
      requiredTools: ["report-member-count"],
      successPattern: /member|count|type|group|total/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "inactive members",
    runScenarioTest({
      prompt:
        "Use report-member-activity with a 90 day threshold to find inactive members.",
      tools: ["report-member-activity"],
      requiredTools: ["report-member-activity"],
      successPattern: /member|inactive|activity|login|day/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "list groups",
    runScenarioTest({
      prompt: "What member groups are available?",
      tools: ["list-member-groups"],
      requiredTools: ["list-member-groups"],
      successPattern: /group|member/i,
      verbose: true,
    }),
    timeout
  );
});
