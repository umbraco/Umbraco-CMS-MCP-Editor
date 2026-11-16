/**
 * resolveUserNames — regression coverage for issue #307.
 *
 * Before this fix, `get-page-change-history` / `get-media-change-history`
 * called `get-user-by-id` once per distinct user ID in an audit log,
 * unconditionally. An API user without access to Umbraco's Users section
 * got a 403 from every one of those calls — the tool still degraded to the
 * raw ID, but each 403 was recorded as an `api_error` on the chained call,
 * which is what tripped the "chained tool-call system error rate high"
 * alert in production.
 *
 * These tests mock the chained CMS client (same `jest.unstable_mockModule`
 * pattern as `users-access.test.ts`) to prove: when the caller lacks Users
 * access, `get-user-by-id` is never called at all — not once, let alone once
 * per ID — and the raw IDs are returned unchanged. When the caller has
 * access, behavior is unchanged from before the fix.
 */
import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import { fileURLToPath } from "node:url";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockChainCms = jest.fn<(...args: any[]) => any>();
const cmsChainPath = fileURLToPath(new URL("../../../cms-chain.ts", import.meta.url));
jest.unstable_mockModule(cmsChainPath, () => ({
  chainCms: mockChainCms,
}));

const { resolveUserNames } = await import("../resolve-user-names.js");

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";

describe("resolveUserNames", () => {
  beforeEach(() => {
    mockChainCms.mockReset();
  });

  it("returns an empty map without calling the chained CMS for an empty input", async () => {
    const result = await resolveUserNames([]);
    expect(result).toEqual(new Map());
    expect(mockChainCms).not.toHaveBeenCalled();
  });

  it("skips get-user-by-id entirely when the caller has no Users-section access, falling back to raw IDs", async () => {
    mockChainCms.mockImplementation(async (toolName: string) => {
      if (toolName === "get-user-current") {
        return { ok: true, data: { allowedSections: ["Umb.Section.Content"] } };
      }
      throw new Error(`unexpected chained call: ${toolName}`);
    });

    const result = await resolveUserNames([USER_A, USER_B, USER_A]);

    expect(result).toEqual(new Map([[USER_A, USER_A], [USER_B, USER_B]]));
    // Exactly one chained call total: the access check. Not one per user ID.
    expect(mockChainCms).toHaveBeenCalledTimes(1);
    expect(mockChainCms).toHaveBeenCalledWith("get-user-current", {});
  });

  it("falls back to raw IDs (without calling get-user-by-id) when the access check itself fails", async () => {
    mockChainCms.mockImplementation(async (toolName: string) => {
      if (toolName === "get-user-current") {
        return { ok: false, errorResult: { isError: true, content: [] } };
      }
      throw new Error(`unexpected chained call: ${toolName}`);
    });

    const result = await resolveUserNames([USER_A]);

    expect(result).toEqual(new Map([[USER_A, USER_A]]));
    expect(mockChainCms).toHaveBeenCalledTimes(1);
  });

  it("resolves names via get-user-by-id when the caller has Users-section access (unchanged happy path)", async () => {
    mockChainCms.mockImplementation(async (toolName: string, args: { id?: string }) => {
      if (toolName === "get-user-current") {
        return { ok: true, data: { allowedSections: ["Umb.Section.Users"] } };
      }
      if (toolName === "get-user-by-id") {
        const names: Record<string, string> = { [USER_A]: "Alice", [USER_B]: "Bob" };
        return { ok: true, data: { name: names[args!.id!] } };
      }
      throw new Error(`unexpected chained call: ${toolName}`);
    });

    const result = await resolveUserNames([USER_A, USER_B]);

    expect(result).toEqual(new Map([[USER_A, "Alice"], [USER_B, "Bob"]]));
    // One access check + one get-user-by-id per distinct ID.
    expect(mockChainCms).toHaveBeenCalledTimes(3);
  });

  it("still falls back to the raw ID for an individual get-user-by-id failure when access is granted", async () => {
    mockChainCms.mockImplementation(async (toolName: string) => {
      if (toolName === "get-user-current") {
        return { ok: true, data: { allowedSections: ["Umb.Section.Users"] } };
      }
      if (toolName === "get-user-by-id") {
        return { ok: false, errorResult: { isError: true, content: [] } };
      }
      throw new Error(`unexpected chained call: ${toolName}`);
    });

    const result = await resolveUserNames([USER_A]);

    expect(result).toEqual(new Map([[USER_A, USER_A]]));
  });
});
