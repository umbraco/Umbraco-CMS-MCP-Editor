/**
 * Translation Collection Test Setup
 */

import { jest } from "@jest/globals";

export {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "@umbraco-cms/mcp-server-sdk/testing";

export { setupEditorElicitation } from "../../../../testing/setup-elicitation.js";
export { expectElicitationCancel } from "../../../../testing/elicitation-helpers.js";

import { getStructuredContent } from "@umbraco-cms/mcp-server-sdk/testing";
import { setupEditorElicitation } from "../../../../testing/setup-elicitation.js";
import listLanguagesTool from "../../language/get/list-languages.js";
import createLanguageTool from "../../language/post/create-language.js";
import listChildrenTool from "../../content/get/list-children.js";

interface TranslationTestState {
  multiLanguage: boolean;
  defaultCulture: string;
  secondaryCulture: string;
  testPageId: string | undefined;
}

let cachedState: TranslationTestState | null = null;

export async function initTranslationTestState(
  extra: Parameters<typeof listLanguagesTool.handler>[1],
): Promise<TranslationTestState> {
  if (cachedState) return cachedState;

  const langResult = await listLanguagesTool.handler({}, extra);
  if (langResult.isError) throw new Error("Failed to list languages");

  const langData = getStructuredContent(langResult) as any;
  let languages = langData?.items ?? [];
  const defaultLang = languages.find((l: any) => l.isDefault);
  let secondaryLang = languages.find((l: any) => !l.isDefault);

  if (!defaultLang || !secondaryLang) {
    // Create nb-NO for multi-language tests
    console.warn("Only one language — creating nb-NO");
    const createResult = await createLanguageTool.handler(
      { isoCode: "nb-NO", name: "Norwegian Bokmål", isDefault: false, isMandatory: false, fallbackIsoCode: undefined },
      extra,
    );
    if (!createResult.isError) {
      const langResult2 = await listLanguagesTool.handler({}, extra);
      const langData2 = getStructuredContent(langResult2) as any;
      languages = langData2?.items ?? [];
      secondaryLang = languages.find((l: any) => !l.isDefault);
    }
  }

  const multiLanguage = !!(defaultLang && secondaryLang);

  // Find test page
  let testPageId: string | undefined;
  const pagesResult = await listChildrenTool.handler({ parentId: undefined }, extra);
  if (!pagesResult.isError) {
    const pagesData = getStructuredContent(pagesResult) as any;
    if (pagesData?.items?.length > 0) testPageId = pagesData.items[0].id;
  }

  cachedState = {
    multiLanguage,
    defaultCulture: defaultLang?.isoCode ?? "",
    secondaryCulture: secondaryLang?.isoCode ?? "",
    testPageId,
  };
  return cachedState;
}

export function createElicitation() {
  return setupEditorElicitation(jest.fn as any);
}
