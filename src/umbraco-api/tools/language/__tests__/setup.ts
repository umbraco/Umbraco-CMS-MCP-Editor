/**
 * Language Collection Test Setup
 *
 * Re-exports shared test utilities and provides shared state initialisation
 * for language integration tests. Uses MCP chaining for all operations.
 */

import { jest } from "@jest/globals";

export {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "@umbraco-cms/mcp-server-sdk/testing";

export { createEditorSnapshotResult as createSnapshotResult } from "../../../../testing/snapshot-helpers.js";

export { LanguageBuilder } from "./helpers/language-builder.js";
export { LanguageTestHelper } from "./helpers/language-test-helper.js";

export { setupEditorElicitation } from "../../../../testing/setup-elicitation.js";
export { expectElicitationCancel } from "../../../../testing/elicitation-helpers.js";

import { getStructuredContent } from "@umbraco-cms/mcp-server-sdk/testing";
import { setupEditorElicitation } from "../../../../testing/setup-elicitation.js";
import listLanguagesTool from "../get/list-languages.js";

export const TEST_LANGUAGE_ISO = "nb-NO";
export const TEST_LANGUAGE_NAME = "Norwegian Bokmål";

interface LanguageTestState {
  /** ISO code of the default language */
  defaultIsoCode: string;
}

let cachedState: LanguageTestState | null = null;

/**
 * Initialise and cache shared language test state.
 *
 * - Lists languages to find the default language
 * - Caches the result so multiple test suites share the same lookup
 */
export async function initLanguageTestState(
  extra: Parameters<typeof listLanguagesTool.handler>[1],
): Promise<LanguageTestState> {
  if (cachedState) {
    return cachedState;
  }

  const result = await listLanguagesTool.handler({}, extra);
  if (result.isError) {
    throw new Error("Failed to list languages: " + JSON.stringify(result));
  }

  const data = getStructuredContent(result) as any;
  const defaultLang = data?.items?.find((l: any) => l.isDefault);
  if (!defaultLang) {
    throw new Error("No default language found");
  }

  const state: LanguageTestState = { defaultIsoCode: defaultLang.isoCode };
  cachedState = state;
  return state;
}

/**
 * Create a fresh elicitation mock for a test suite.
 */
export function createElicitation() {
  return setupEditorElicitation(jest.fn as any);
}
