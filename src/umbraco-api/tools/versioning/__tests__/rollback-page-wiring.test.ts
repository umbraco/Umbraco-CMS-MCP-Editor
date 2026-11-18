/**
 * rollback-page — resolveUserName wiring (unit-level, mocked)
 *
 * The real `rollback-page.test.ts` runs against a live demo-site Umbraco
 * instance where every version carries a resolvable `user.id`, so it never
 * exercises either of the two branches covered here:
 *
 *  - `targetVersion?.user?.id` absent (e.g. a version with no recorded
 *    author) — `resolveUserName` must never be called, and the confirmation
 *    message must not grow a broken "by <name>" clause.
 *  - `resolveUserName` itself throwing — this is the regression pr-test-analyzer
 *    flagged (mcp-review on PR #317 / issue #307 follow-up, "Fix 2"): before
 *    this PR an inline, un-caught `get-user-by-id` call meant a thrown
 *    exception surfaced as a visible tool error; after this PR the call goes
 *    through the shared `resolve-user-names.ts` helper. That helper's own
 *    internal try/catch (see `resolve-user-names.test.ts`) keeps *routine*
 *    chained-call failures silent, but this test proves that if something
 *    upstream still throws, `withStandardDecorators`'s `withErrorHandling`
 *    wrapper converts it into a visible 500 error result rather than the
 *    tool silently reporting success with a raw-ID fallback.
 *
 * Mocks both `cms-chain.js` (so no real Umbraco instance is needed) and
 * `resolve-user-names.js` (so this test only has to prove rollback-page's
 * *wiring* to the helper, not the helper's own fallback behaviour, which is
 * covered separately in resolve-user-names.test.ts) — same
 * `jest.unstable_mockModule` pattern used elsewhere in this PR (see
 * src/umbraco-api/tools/helpers/__tests__/resolve-user-names.test.ts).
 * Elicitation uses the same `setupEditorElicitation` helper as the real
 * integration test, which also lets us inspect the message sent for the
 * confirmation prompt.
 */
import { jest, describe, it, expect, beforeEach, afterAll } from "@jest/globals";
import { fileURLToPath } from "node:url";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockChainCms = jest.fn<(...args: any[]) => any>();
const cmsChainPath = fileURLToPath(new URL("../../../cms-chain.ts", import.meta.url));
const actualCmsChain = await import(cmsChainPath);
jest.unstable_mockModule(cmsChainPath, () => ({
  ...actualCmsChain,
  chainCms: mockChainCms,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockResolveUserName = jest.fn<(...args: any[]) => any>();
const resolveUserNamesPath = fileURLToPath(
  new URL("../../helpers/resolve-user-names.ts", import.meta.url),
);
jest.unstable_mockModule(resolveUserNamesPath, () => ({
  resolveUserName: mockResolveUserName,
  resolveUserNames: jest.fn(),
}));

const { default: rollbackPageTool } = await import("../post/rollback-page.js");
const { createMockRequestHandlerExtra, getStructuredContent } = await import(
  "@umbraco-cms/mcp-server-sdk/testing"
);
const { setupEditorElicitation } = await import("../../../../testing/setup-elicitation.js");

const TEST_PAGE_ID = "11111111-1111-4111-8111-111111111111";
const TEST_VERSION_ID = "000005e3-0000-0000-0000-000000000000";

function baseChainCmsMock(versionUser: { id: string } | undefined) {
  return jest.fn(async (toolName: string) => {
    switch (toolName) {
      case "get-document-by-id":
        return {
          ok: true,
          data: {
            variants: [{ name: "Test Page" }],
            values: [],
            documentType: { id: "dt-1" },
            template: null,
          },
        };
      case "get-document-version":
        return {
          ok: true,
          data: {
            items: [
              {
                id: TEST_VERSION_ID,
                versionDate: "2026-01-01T00:00:00Z",
                ...(versionUser ? { user: versionUser } : {}),
              },
            ],
          },
        };
      case "create-document-version-rollback":
        return { ok: true, data: {} };
      // v17: validateDocumentState resolves the parent via get-document-ancestors
      // (the v18 line uses get-item-document for the same lookup).
      case "get-document-ancestors":
        return { ok: true, data: { items: [{ id: TEST_PAGE_ID, parent: null }] } };
      case "validate-document":
        return { ok: true, data: {} };
      default:
        throw new Error(`Unexpected chainCms call: ${toolName}`);
    }
  });
}

describe("rollback-page — resolveUserName wiring", () => {
  const extra = createMockRequestHandlerExtra();
  const elicitation = setupEditorElicitation(jest.fn as any);

  beforeEach(() => {
    mockChainCms.mockReset();
    mockResolveUserName.mockReset();
    elicitation.reset();
  });

  afterAll(() => {
    elicitation.cleanup();
  });

  it("never calls resolveUserName when the target version has no recorded user, and doesn't add a broken 'by <name>' clause", async () => {
    mockChainCms.mockImplementation(baseChainCmsMock(undefined));

    const result = await rollbackPageTool.handler(
      { id: TEST_PAGE_ID, versionId: TEST_VERSION_ID, culture: undefined },
      extra as never,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.message).toContain("Rolled back");

    expect(mockResolveUserName).not.toHaveBeenCalled();

    // Inspect the elicitation message sent for the confirmation prompt.
    expect(elicitation.mock).toHaveBeenCalled();
    const elicitRequest = elicitation.mock.mock.calls[0][0] as { message?: string };
    expect(elicitRequest.message).not.toContain("by ");
    expect(elicitRequest.message).not.toMatch(/by\s*$/);
  });

  it("surfaces resolveUserName throwing as a visible tool error rather than a silent success", async () => {
    mockChainCms.mockImplementation(baseChainCmsMock({ id: "user-1" }));
    mockResolveUserName.mockRejectedValue(new Error("boom from resolveUserName"));

    const result = await rollbackPageTool.handler(
      { id: TEST_PAGE_ID, versionId: TEST_VERSION_ID, culture: undefined },
      extra as never,
    );

    // withStandardDecorators' withErrorHandling wrapper converts the thrown
    // error into a visible error result — never a silently-swallowed success.
    expect(result.isError).toBeTruthy();
    expect(mockResolveUserName).toHaveBeenCalledWith("user-1");
  });
});
