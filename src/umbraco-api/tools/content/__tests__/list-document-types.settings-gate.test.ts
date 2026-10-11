/**
 * list-document-types — Settings access gate and tree-walk error propagation
 *
 * These two failure paths can't be exercised against the real demo-site
 * Umbraco instance: the test API user is an Administrator, and Administrators
 * always have Settings-section access, so a real `Forbidden` from the
 * document-type tree is unreachable there. We mock the chained CMS client
 * instead, following the `jest.unstable_mockModule` pattern established in
 * `src/config/__tests__/server-config.test.ts` — the mock must be registered
 * before the module under test is imported, so both live at module scope
 * ahead of the `describe` block.
 */
import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import { fileURLToPath } from "node:url";
import { sections } from "../../../../auth/auth-policies.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockChainCms = jest.fn<(...args: any[]) => any>();
const cmsChainPath = fileURLToPath(new URL("../../../cms-chain.ts", import.meta.url));
jest.unstable_mockModule(cmsChainPath, () => ({
  chainCms: mockChainCms,
}));

const { default: listDocumentTypesTool } = await import("../get/list-document-types.js");
const { createMockRequestHandlerExtra, getResultText } = await import(
  "@umbraco-cms/mcp-server-sdk/testing"
);

const TEST_DOC_TYPE_ID = "11111111-1111-1111-1111-111111111111";

describe("list-document-types — Settings access gate and error propagation", () => {
  const extra = createMockRequestHandlerExtra();

  beforeEach(() => {
    mockChainCms.mockReset();
  });

  it("returns a 403 and never attempts the tree walk when the user lacks Settings access", async () => {
    mockChainCms.mockImplementation(async (toolName: string) => {
      if (toolName === "get-user-current") {
        return { ok: true, data: { allowedSections: [sections.content, sections.media] } };
      }
      throw new Error(`Unexpected chained call: ${toolName}`);
    });

    const result = await listDocumentTypesTool.handler({}, extra as never);

    expect(result.isError).toBeTruthy();
    const data = JSON.parse(getResultText(result as never));
    expect(data.status).toBe(403);
    expect(data.title).toContain("Settings");

    expect(mockChainCms).toHaveBeenCalledWith("get-user-current", {});
    expect(mockChainCms).not.toHaveBeenCalledWith("get-document-type-root", expect.anything());
  });

  it("surfaces a Forbidden from the tree walk as an error, not an empty success", async () => {
    mockChainCms.mockImplementation(async (toolName: string) => {
      if (toolName === "get-user-current") {
        return { ok: true, data: { allowedSections: [sections.settings] } };
      }
      if (toolName === "get-document-type-root") {
        return {
          ok: false,
          errorResult: {
            isError: true,
            content: [{ type: "text", text: JSON.stringify({ status: 403, title: "Forbidden", detail: "no access" }) }],
          },
        };
      }
      throw new Error(`Unexpected chained call: ${toolName}`);
    });

    const result = await listDocumentTypesTool.handler({}, extra as never);

    expect(result.isError).toBeTruthy();
    const data = JSON.parse(getResultText(result as never));
    expect(data.title).toBe("Forbidden");
  });

  it("surfaces a Forbidden from resolving a document type's details as an error, not a silently dropped item", async () => {
    mockChainCms.mockImplementation(async (toolName: string) => {
      if (toolName === "get-user-current") {
        return { ok: true, data: { allowedSections: [sections.settings] } };
      }
      if (toolName === "get-document-type-root") {
        return {
          ok: true,
          data: {
            items: [{ id: TEST_DOC_TYPE_ID, name: "Test Type", isFolder: false, hasChildren: false }],
            nextCursor: null,
          },
        };
      }
      if (toolName === "get-document-type-by-id") {
        return {
          ok: false,
          errorResult: {
            isError: true,
            content: [{ type: "text", text: JSON.stringify({ status: 403, title: "Forbidden", detail: "no access" }) }],
          },
        };
      }
      throw new Error(`Unexpected chained call: ${toolName}`);
    });

    const result = await listDocumentTypesTool.handler({}, extra as never);

    expect(result.isError).toBeTruthy();
    const data = JSON.parse(getResultText(result as never));
    expect(data.title).toBe("Forbidden");
  });

  it("surfaces a Forbidden from a nested folder's children as an error, not a silently truncated list", async () => {
    const FOLDER_ID = "33333333-3333-3333-3333-333333333333";
    mockChainCms.mockImplementation(async (toolName: string, args: unknown) => {
      if (toolName === "get-user-current") {
        return { ok: true, data: { allowedSections: [sections.settings] } };
      }
      if (toolName === "get-document-type-root") {
        return {
          ok: true,
          data: {
            items: [{ id: FOLDER_ID, name: "A Folder", isFolder: true, hasChildren: true }],
            nextCursor: null,
          },
        };
      }
      if (toolName === "get-document-type-children") {
        expect((args as { parentId?: string }).parentId).toBe(FOLDER_ID);
        return {
          ok: false,
          errorResult: {
            isError: true,
            content: [{ type: "text", text: JSON.stringify({ status: 403, title: "Forbidden", detail: "no access" }) }],
          },
        };
      }
      throw new Error(`Unexpected chained call: ${toolName}`);
    });

    const result = await listDocumentTypesTool.handler({}, extra as never);

    expect(result.isError).toBeTruthy();
    const data = JSON.parse(getResultText(result as never));
    expect(data.title).toBe("Forbidden");
  });

  it("surfaces a Forbidden from resolving a later item's details, even when an earlier item succeeds", async () => {
    const FIRST_ID = "11111111-1111-1111-1111-111111111111";
    const SECOND_ID = "22222222-2222-2222-2222-222222222222";
    mockChainCms.mockImplementation(async (toolName: string, args: unknown) => {
      if (toolName === "get-user-current") {
        return { ok: true, data: { allowedSections: [sections.settings] } };
      }
      if (toolName === "get-document-type-root") {
        return {
          ok: true,
          data: {
            items: [
              { id: FIRST_ID, name: "First Type", isFolder: false, hasChildren: false },
              { id: SECOND_ID, name: "Second Type", isFolder: false, hasChildren: false },
            ],
            nextCursor: null,
          },
        };
      }
      if (toolName === "get-document-type-by-id") {
        const id = (args as { id?: string }).id;
        if (id === FIRST_ID) {
          return { ok: true, data: { id: FIRST_ID, alias: "firstType", name: "First Type" } };
        }
        if (id === SECOND_ID) {
          return {
            ok: false,
            errorResult: {
              isError: true,
              content: [{ type: "text", text: JSON.stringify({ status: 403, title: "Forbidden", detail: "no access" }) }],
            },
          };
        }
      }
      throw new Error(`Unexpected chained call: ${toolName} ${JSON.stringify(args)}`);
    });

    const result = await listDocumentTypesTool.handler({}, extra as never);

    expect(result.isError).toBeTruthy();
    const data = JSON.parse(getResultText(result as never));
    expect(data.title).toBe("Forbidden");
  });

  it("surfaces a failed get-user-current check as its own error, not a misleading 403", async () => {
    let userCurrentCalls = 0;
    mockChainCms.mockImplementation(async (toolName: string) => {
      if (toolName === "get-user-current") {
        userCurrentCalls += 1;
        if (userCurrentCalls === 1) {
          return {
            ok: false,
            errorResult: {
              isError: true,
              content: [{ type: "text", text: JSON.stringify({ status: 500, title: "Internal Server Error", detail: "transient" }) }],
            },
          };
        }
        return { ok: true, data: { allowedSections: [sections.settings] } };
      }
      if (toolName === "get-document-type-root") {
        return { ok: true, data: { items: [], nextCursor: null } };
      }
      throw new Error(`Unexpected chained call: ${toolName}`);
    });

    const first = await listDocumentTypesTool.handler({}, extra as never);
    expect(first.isError).toBeTruthy();
    const firstData = JSON.parse(getResultText(first as never));
    expect(firstData.status).toBe(500);
    expect(firstData.title).toBe("Internal Server Error");

    const second = await listDocumentTypesTool.handler({}, extra as never);
    expect(second.isError).toBeFalsy();

    expect(userCurrentCalls).toBe(2);
  });

  it("checks fresh on every call — two different users in a row get their own answer, not a stale cached one", async () => {
    let userCurrentCalls = 0;
    mockChainCms.mockImplementation(async (toolName: string) => {
      if (toolName === "get-user-current") {
        userCurrentCalls += 1;
        return {
          ok: true,
          data: { allowedSections: userCurrentCalls === 1 ? [sections.content] : [sections.settings] },
        };
      }
      if (toolName === "get-document-type-root") {
        return { ok: true, data: { items: [], nextCursor: null } };
      }
      throw new Error(`Unexpected chained call: ${toolName}`);
    });

    const first = await listDocumentTypesTool.handler({}, extra as never);
    expect(first.isError).toBeTruthy();
    const firstData = JSON.parse(getResultText(first as never));
    expect(firstData.status).toBe(403);

    const second = await listDocumentTypesTool.handler({}, extra as never);
    expect(second.isError).toBeFalsy();

    expect(userCurrentCalls).toBe(2);
  });
});
