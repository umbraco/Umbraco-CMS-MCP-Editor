/**
 * list-blueprints — Settings access gate
 *
 * list-blueprints already propagated chained failures safely before this
 * change (`if (!result.ok) return result.errorResult;`) — the bug here was
 * that a `Forbidden` reached the model with no explanation, so the model
 * couldn't tell it was a permissions issue. This test covers the new gate,
 * which gives a friendly 403 before the chained call is even attempted.
 *
 * As in list-document-types.settings-gate.test.ts, this is mocked rather
 * than run against the real demo-site Umbraco instance: the test API user
 * is an Administrator and always has Settings-section access, so the real
 * 403 path is unreachable there. Follows the `jest.unstable_mockModule`
 * pattern from `src/config/__tests__/server-config.test.ts`.
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

const { default: listBlueprintsTool } = await import("../get/list-blueprints.js");
const { createMockRequestHandlerExtra, getResultText } = await import(
  "@umbraco-cms/mcp-server-sdk/testing"
);

describe("list-blueprints — Settings access gate", () => {
  const extra = createMockRequestHandlerExtra();

  beforeEach(() => {
    mockChainCms.mockReset();
  });

  it("returns a 403 and never attempts the chained call when the user lacks Settings access", async () => {
    mockChainCms.mockImplementation(async (toolName: string) => {
      if (toolName === "get-user-current") {
        return { ok: true, data: { allowedSections: [sections.content, sections.media] } };
      }
      throw new Error(`Unexpected chained call: ${toolName}`);
    });

    const result = await listBlueprintsTool.handler({ parentId: undefined }, extra as never);

    expect(result.isError).toBeTruthy();
    const data = JSON.parse(getResultText(result as never));
    expect(data.status).toBe(403);
    expect(data.title).toContain("Settings");

    expect(mockChainCms).toHaveBeenCalledWith("get-user-current", {});
    expect(mockChainCms).not.toHaveBeenCalledWith("get-document-blueprint-root", expect.anything());
  });

  it("still propagates a chained Forbidden once past the gate (unchanged behaviour)", async () => {
    mockChainCms.mockImplementation(async (toolName: string) => {
      if (toolName === "get-user-current") {
        return { ok: true, data: { allowedSections: [sections.settings] } };
      }
      if (toolName === "get-document-blueprint-root") {
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

    const result = await listBlueprintsTool.handler({ parentId: undefined }, extra as never);

    expect(result.isError).toBeTruthy();
    const data = JSON.parse(getResultText(result as never));
    expect(data.title).toBe("Forbidden");
  });

  it("surfaces a failed get-user-current check as its own error, not a misleading 403", async () => {
    mockChainCms.mockImplementation(async (toolName: string) => {
      if (toolName === "get-user-current") {
        return {
          ok: false,
          errorResult: {
            isError: true,
            content: [{ type: "text", text: JSON.stringify({ status: 500, title: "Internal Server Error", detail: "transient" }) }],
          },
        };
      }
      throw new Error(`Unexpected chained call: ${toolName}`);
    });

    const result = await listBlueprintsTool.handler({ parentId: undefined }, extra as never);

    expect(result.isError).toBeTruthy();
    const data = JSON.parse(getResultText(result as never));
    expect(data.status).toBe(500);
    expect(data.title).toBe("Internal Server Error");
  });
});
