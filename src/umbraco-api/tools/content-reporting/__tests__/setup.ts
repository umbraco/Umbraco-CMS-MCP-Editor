/**
 * Content Reporting Collection Test Setup
 *
 * Re-exports shared test utilities, the test helper, and the builder for
 * content-reporting integration tests. All tools in this collection are
 * read-only reports — no cleanup is required between tests.
 */

export {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "@umbraco-cms/mcp-server-sdk/testing";

export { createEditorSnapshotResult as createSnapshotResult } from "../../../../testing/snapshot-helpers.js";

export { ContentReportingTestHelper } from "./helpers/content-reporting-test-helper.js";
export { ContentReportingBuilder } from "./helpers/content-reporting-builder.js";
