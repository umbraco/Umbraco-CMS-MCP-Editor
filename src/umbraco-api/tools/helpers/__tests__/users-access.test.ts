/**
 * checkUsersAccess — checks fresh on every call, no module-level cache, and
 * distinguishes a failed check from a confirmed "no access".
 *
 * Mocks the chained CMS client, following the `jest.unstable_mockModule`
 * pattern established in `src/config/__tests__/server-config.test.ts` and
 * mirrored by `member/__tests__/sensitive-data-access.test.ts`.
 */
import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import { fileURLToPath } from "node:url";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockChainCms = jest.fn<(...args: any[]) => any>();
const cmsChainPath = fileURLToPath(new URL("../../../cms-chain.ts", import.meta.url));
jest.unstable_mockModule(cmsChainPath, () => ({
  chainCms: mockChainCms,
}));

const { checkUsersAccess } = await import("../users-access.js");

describe("checkUsersAccess", () => {
  beforeEach(() => {
    mockChainCms.mockReset();
  });

  it("reports access when the Users section is in allowedSections", async () => {
    mockChainCms.mockResolvedValue({
      ok: true,
      data: { allowedSections: ["Umb.Section.Content", "Umb.Section.Users"] },
    });

    await expect(checkUsersAccess()).resolves.toEqual({ ok: true, hasAccess: true });
  });

  it("reports no access when the Users section is absent", async () => {
    mockChainCms.mockResolvedValue({
      ok: true,
      data: { allowedSections: ["Umb.Section.Content", "Umb.Section.Media"] },
    });

    await expect(checkUsersAccess()).resolves.toEqual({ ok: true, hasAccess: false });
  });

  it("checks fresh on every call — two different users in a row get their own answer, not a stale cached one", async () => {
    let calls = 0;
    mockChainCms.mockImplementation(async () => {
      calls += 1;
      return { ok: true, data: { allowedSections: calls === 1 ? ["Umb.Section.Users"] : [] } };
    });

    await expect(checkUsersAccess()).resolves.toEqual({ ok: true, hasAccess: true });
    await expect(checkUsersAccess()).resolves.toEqual({ ok: true, hasAccess: false });
    expect(calls).toBe(2);
  });

  it("surfaces a failed get-user-current check as its own error, not a misleading 'no access' result", async () => {
    let calls = 0;
    mockChainCms.mockImplementation(async () => {
      calls += 1;
      if (calls === 1) {
        return {
          ok: false,
          errorResult: { isError: true, content: [{ type: "text", text: JSON.stringify({ status: 500, title: "Internal Server Error", detail: "transient" }) }] },
        };
      }
      return { ok: true, data: { allowedSections: ["Umb.Section.Users"] } };
    });

    const first = await checkUsersAccess();
    expect(first.ok).toBe(false);
    if (!first.ok) {
      expect(first.errorResult).toEqual({
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ status: 500, title: "Internal Server Error", detail: "transient" }) }],
      });
    }

    await expect(checkUsersAccess()).resolves.toEqual({ ok: true, hasAccess: true });
    expect(calls).toBe(2);
  });
});
