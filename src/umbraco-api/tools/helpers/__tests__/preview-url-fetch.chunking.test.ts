/**
 * Unit coverage for `fetchPublishedUrlsBatch`'s chunking behaviour (PR #235
 * review). `get-document-urls` takes ids via repeated `id=` query params, so
 * an unbounded single call trips `414 URI Too Long` once the id list is
 * large enough (see `URL_BATCH_CHUNK_SIZE` in `../preview-url.ts`). These
 * tests mock the chained CMS client, following the `jest.unstable_mockModule`
 * pattern established in `src/config/__tests__/server-config.test.ts`, so
 * the chunk boundary and partial-failure behaviour can be verified without a
 * live Umbraco instance or enough real ids to actually hit a 414. The real
 * 414 regression (one published page id + ~300 random ids) is covered
 * separately in `preview-url-fetch.test.ts`, which does run against a live
 * instance. Also asserts the `console.warn` logged on a failed/thrown chunk
 * (PR #235 review follow-up) so a batch of silently-empty URLs leaves a
 * diagnostic trail.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockChainCms = jest.fn<(...args: any[]) => any>();
const cmsChainPath = fileURLToPath(new URL("../../../cms-chain.ts", import.meta.url));
const actualCmsChain = await import(cmsChainPath);
jest.unstable_mockModule(cmsChainPath, () => ({
  ...actualCmsChain,
  chainCms: mockChainCms,
}));

const { fetchPublishedUrlsBatch, fetchPublishedUrls, _resetCacheForTests } = await import(
  "../preview-url.js"
);

function makeIds(count: number): string[] {
  return Array.from(
    { length: count },
    (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`
  );
}

describe("fetchPublishedUrlsBatch — chunking", () => {
  // Pin to "no base URL resolvable" (tmpdir with no .env, no process.env var)
  // so the returned URLs stay the plain root-relative strings the mock
  // returns, regardless of whatever UMBRACO_BASE_URL happens to be set in
  // this environment.
  let tmpDir: string;
  let origCwd: () => string;
  const originalBaseUrl = process.env.UMBRACO_BASE_URL;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let warnSpy: any;

  beforeEach(() => {
    mockChainCms.mockReset();
    tmpDir = mkdtempSync(join(tmpdir(), "preview-url-chunking-"));
    origCwd = process.cwd;
    process.cwd = () => tmpDir;
    delete process.env.UMBRACO_BASE_URL;
    _resetCacheForTests();
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    process.cwd = origCwd;
    if (originalBaseUrl === undefined) {
      delete process.env.UMBRACO_BASE_URL;
    } else {
      process.env.UMBRACO_BASE_URL = originalBaseUrl;
    }
    _resetCacheForTests();
    warnSpy.mockRestore();
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // best effort
    }
  });

  it("sends exactly one chained call for exactly 40 ids (chunk boundary)", async () => {
    const ids = makeIds(40);
    const calls: string[][] = [];

    mockChainCms.mockImplementation(async (toolName: string, args: { id: string[] }) => {
      expect(toolName).toBe("get-document-urls");
      calls.push(args.id);
      return {
        ok: true,
        data: {
          items: args.id.map((id) => ({
            id,
            urlInfos: [{ culture: "en-US", url: `/page-${id}`, message: null, provider: "x" }],
          })),
        },
      };
    });

    const result = await fetchPublishedUrlsBatch(ids);

    expect(calls.length).toBe(1);
    expect(calls[0].length).toBe(40);
    expect(result.size).toBe(40);
  });

  it("splits a 95-id batch into multiple chained calls, none over 40 ids, and merges every id", async () => {
    const ids = makeIds(95);
    const calls: string[][] = [];

    mockChainCms.mockImplementation(async (toolName: string, args: { id: string[] }) => {
      expect(toolName).toBe("get-document-urls");
      calls.push(args.id);
      return {
        ok: true,
        data: {
          items: args.id.map((id) => ({
            id,
            urlInfos: [{ culture: "en-US", url: `/page-${id}`, message: null, provider: "x" }],
          })),
        },
      };
    });

    const result = await fetchPublishedUrlsBatch(ids);

    // 95 ids at 40/chunk -> 3 calls (40 + 40 + 15), never one unbounded call.
    expect(calls.length).toBe(3);
    expect(calls.every((chunk) => chunk.length <= 40)).toBe(true);
    expect(calls.flat().length).toBe(95);

    expect(result.size).toBe(95);
    for (const id of ids) {
      expect(result.get(id)).toEqual([`/page-${id}`]);
    }
  });

  it("keeps the other chunks' results when one chunk fails outright", async () => {
    const ids = makeIds(80); // two chunks of 40

    mockChainCms.mockImplementation(async (_toolName: string, args: { id: string[] }) => {
      if (args.id[0] === ids[40]) {
        return {
          ok: false,
          errorResult: {
            isError: true,
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  type: "Error",
                  title: "Document not found",
                  status: 404,
                  detail: "No document exists with the requested id.",
                }),
              },
            ],
          },
        };
      }
      return {
        ok: true,
        data: {
          items: args.id.map((id) => ({
            id,
            urlInfos: [{ culture: "en-US", url: `/page-${id}`, message: null, provider: "x" }],
          })),
        },
      };
    });

    const result = await fetchPublishedUrlsBatch(ids);

    for (const id of ids.slice(0, 40)) {
      expect(result.get(id)).toEqual([`/page-${id}`]);
    }
    for (const id of ids.slice(40, 80)) {
      expect(result.has(id)).toBe(false);
    }
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain("Document not found");
    expect(String(warnSpy.mock.calls[0][0])).toContain("No document exists with the requested id.");
  });

  it("keeps the other chunks' results when one chunk throws", async () => {
    const ids = makeIds(80);

    mockChainCms.mockImplementation(async (_toolName: string, args: { id: string[] }) => {
      if (args.id[0] === ids[40]) {
        throw new Error("network error");
      }
      return {
        ok: true,
        data: {
          items: args.id.map((id) => ({
            id,
            urlInfos: [{ culture: "en-US", url: `/page-${id}`, message: null, provider: "x" }],
          })),
        },
      };
    });

    const result = await fetchPublishedUrlsBatch(ids);

    for (const id of ids.slice(0, 40)) {
      expect(result.get(id)).toEqual([`/page-${id}`]);
    }
    for (const id of ids.slice(40, 80)) {
      expect(result.has(id)).toBe(false);
    }
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain("network error");
  });
});

describe("fetchPublishedUrls — warn content on failure (#239)", () => {
  // Same tmpdir/.env isolation as the batch describe block above — not
  // load-bearing for these assertions (they only inspect console.warn), but
  // kept consistent with the rest of this file.
  let tmpDir: string;
  let origCwd: () => string;
  const originalBaseUrl = process.env.UMBRACO_BASE_URL;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let warnSpy: any;

  beforeEach(() => {
    mockChainCms.mockReset();
    tmpDir = mkdtempSync(join(tmpdir(), "preview-url-single-"));
    origCwd = process.cwd;
    process.cwd = () => tmpDir;
    delete process.env.UMBRACO_BASE_URL;
    _resetCacheForTests();
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    process.cwd = origCwd;
    if (originalBaseUrl === undefined) {
      delete process.env.UMBRACO_BASE_URL;
    } else {
      process.env.UMBRACO_BASE_URL = originalBaseUrl;
    }
    _resetCacheForTests();
    warnSpy.mockRestore();
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // best effort
    }
  });

  it("warns with the real title/detail when the chained call resolves !ok", async () => {
    mockChainCms.mockResolvedValue({
      ok: false,
      errorResult: {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({
              type: "Error",
              title: "Document not found",
              status: 404,
              detail: "No document exists with the requested id.",
            }),
          },
        ],
      },
    });

    const urls = await fetchPublishedUrls("00000000-0000-0000-0000-000000000001");

    expect(urls).toEqual([]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain("Document not found");
    expect(String(warnSpy.mock.calls[0][0])).toContain("No document exists with the requested id.");
  });

  it("warns with the thrown error's message when the chained call throws", async () => {
    mockChainCms.mockImplementation(async () => {
      throw new Error("network error");
    });

    const urls = await fetchPublishedUrls("00000000-0000-0000-0000-000000000001");

    expect(urls).toEqual([]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain("network error");
  });
});
