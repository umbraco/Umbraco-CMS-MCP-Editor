/**
 * resolveUserNames / resolveUserName — the shared fallback-to-raw-ID name
 * resolver used by get-page-change-history, get-media-change-history and
 * rollback-page (issue #307).
 *
 * The key behaviour under test: when the caller lacks Users-section access,
 * `get-user-by-id` must never be called at all — that's what stops the
 * reactive-403 pattern that tripped the "chained tool-call system error
 * rate high" alert in production. Mocks the chained CMS client, following
 * the `jest.unstable_mockModule` pattern established in
 * `src/config/__tests__/server-config.test.ts`.
 */
import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import { fileURLToPath } from "node:url";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockChainCms = jest.fn<(...args: any[]) => any>();
const cmsChainPath = fileURLToPath(new URL("../../../cms-chain.ts", import.meta.url));
jest.unstable_mockModule(cmsChainPath, () => ({
  chainCms: mockChainCms,
}));

const { resolveUserNames, resolveUserName } = await import("../resolve-user-names.js");

describe("resolveUserNames", () => {
  beforeEach(() => {
    mockChainCms.mockReset();
  });

  it("skips get-user-by-id entirely and falls back to raw IDs when the caller lacks Users access", async () => {
    mockChainCms.mockImplementation(async (toolName: string) => {
      if (toolName === "get-user-current") {
        return { ok: true, data: { allowedSections: ["Umb.Section.Content"] } };
      }
      throw new Error(`unexpected chainCms call: ${toolName}`);
    });

    const result = await resolveUserNames(["user-1", "user-2"]);

    expect(result.get("user-1")).toBe("user-1");
    expect(result.get("user-2")).toBe("user-2");
    // Exactly one chained call total (the access check) — get-user-by-id never fires.
    expect(mockChainCms).toHaveBeenCalledTimes(1);
    expect(mockChainCms).toHaveBeenCalledWith("get-user-current", {});
  });

  it("resolves display names via get-user-by-id when the caller has Users access", async () => {
    mockChainCms.mockImplementation(async (toolName: string, args: { id?: string }) => {
      if (toolName === "get-user-current") {
        return { ok: true, data: { allowedSections: ["Umb.Section.Users"] } };
      }
      if (toolName === "get-user-by-id") {
        return { ok: true, data: { name: `Name for ${args.id}` } };
      }
      throw new Error(`unexpected chainCms call: ${toolName}`);
    });

    const result = await resolveUserNames(["user-1", "user-2"]);

    expect(result.get("user-1")).toBe("Name for user-1");
    expect(result.get("user-2")).toBe("Name for user-2");
    // One access check + one get-user-by-id per unique id.
    expect(mockChainCms).toHaveBeenCalledTimes(3);
  });

  it("dedupes IDs before calling get-user-by-id", async () => {
    let lookups = 0;
    mockChainCms.mockImplementation(async (toolName: string, args: { id?: string }) => {
      if (toolName === "get-user-current") {
        return { ok: true, data: { allowedSections: ["Umb.Section.Users"] } };
      }
      lookups += 1;
      return { ok: true, data: { name: `Name for ${args.id}` } };
    });

    const result = await resolveUserNames(["user-1", "user-1", "user-1"]);

    expect(lookups).toBe(1);
    expect(result.get("user-1")).toBe("Name for user-1");
  });

  it("falls back to the raw ID for a single get-user-by-id failure without throwing", async () => {
    mockChainCms.mockImplementation(async (toolName: string) => {
      if (toolName === "get-user-current") {
        return { ok: true, data: { allowedSections: ["Umb.Section.Users"] } };
      }
      return { ok: false, errorResult: { isError: true, content: [] } };
    });

    const result = await resolveUserNames(["user-1"]);
    expect(result.get("user-1")).toBe("user-1");
  });

  it("falls back to raw IDs (without throwing) when the access check itself fails", async () => {
    mockChainCms.mockResolvedValue({
      ok: false,
      errorResult: { isError: true, content: [{ type: "text", text: "transient" }] },
    });

    const result = await resolveUserNames(["user-1"]);
    expect(result.get("user-1")).toBe("user-1");
  });

  it("falls back to the raw ID (without throwing) when get-user-by-id throws", async () => {
    mockChainCms.mockImplementation(async (toolName: string) => {
      if (toolName === "get-user-current") {
        return { ok: true, data: { allowedSections: ["Umb.Section.Users"] } };
      }
      if (toolName === "get-user-by-id") {
        throw new Error("boom");
      }
      throw new Error(`unexpected chainCms call: ${toolName}`);
    });

    const result = await resolveUserNames(["user-1"]);
    expect(result.get("user-1")).toBe("user-1");
  });

  it("falls back to raw IDs (without throwing) when the underlying get-user-current call throws", async () => {
    mockChainCms.mockImplementation(async (toolName: string) => {
      if (toolName === "get-user-current") {
        throw new Error("network blip");
      }
      throw new Error(`unexpected chainCms call: ${toolName}`);
    });

    const result = await resolveUserNames(["user-1"]);
    expect(result.get("user-1")).toBe("user-1");
  });

  it("short-circuits before any chained call when given no IDs", async () => {
    const result = await resolveUserNames([]);
    expect(result.size).toBe(0);
    expect(mockChainCms).not.toHaveBeenCalled();
  });
});

describe("resolveUserName", () => {
  beforeEach(() => {
    mockChainCms.mockReset();
  });

  it("resolves a single ID to its display name", async () => {
    mockChainCms.mockImplementation(async (toolName: string, args: { id?: string }) => {
      if (toolName === "get-user-current") {
        return { ok: true, data: { allowedSections: ["Umb.Section.Users"] } };
      }
      return { ok: true, data: { name: `Name for ${args.id}` } };
    });

    await expect(resolveUserName("user-1")).resolves.toBe("Name for user-1");
  });

  it("falls back to the raw ID when the caller lacks Users access", async () => {
    mockChainCms.mockResolvedValue({ ok: true, data: { allowedSections: [] } });

    await expect(resolveUserName("user-1")).resolves.toBe("user-1");
  });
});
