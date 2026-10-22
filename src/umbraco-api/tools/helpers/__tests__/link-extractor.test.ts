/**
 * Unit coverage for `link-extractor.ts`'s exported `resolveOutboundIds`
 * (#239 requirement 4). Mocks `chainCms` — same `jest.unstable_mockModule`
 * pattern as `preview-url-fetch.chunking.test.ts` — so this runs without a
 * live Umbraco instance. `resolveOutboundIds` reuses `fetchPrimaryPublishedUrlsBatch`
 * (itself covered live in `preview-url-fetch.test.ts`'s 414-regression suite),
 * so this test only needs to assert the resolved `internalPages[].url` matches
 * what that primitive returned — no integration test needed here.
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

const { resolveOutboundIds } = await import("../link-extractor.js");
const { _resetCacheForTests } = await import("../preview-url.js");

const PAGE_ID = "11111111-1111-1111-1111-111111111111";
const MEDIA_ID = "22222222-2222-2222-2222-222222222222";
const SOURCE_ID = "33333333-3333-3333-3333-333333333333";

describe("resolveOutboundIds", () => {
  // Pin to "no base URL resolvable" (tmpdir with no .env, no process.env var)
  // so `fetchPrimaryPublishedUrlsBatch`'s underlying `flattenPublishedUrls`
  // returns the mock's root-relative url untouched — same isolation as
  // preview-url-fetch.chunking.test.ts.
  let tmpDir: string;
  let origCwd: () => string;
  const originalBaseUrl = process.env.UMBRACO_BASE_URL;

  beforeEach(() => {
    mockChainCms.mockReset();
    tmpDir = mkdtempSync(join(tmpdir(), "link-extractor-"));
    origCwd = process.cwd;
    process.cwd = () => tmpDir;
    delete process.env.UMBRACO_BASE_URL;
    _resetCacheForTests();
  });

  afterEach(() => {
    process.cwd = origCwd;
    if (originalBaseUrl === undefined) {
      delete process.env.UMBRACO_BASE_URL;
    } else {
      process.env.UMBRACO_BASE_URL = originalBaseUrl;
    }
    _resetCacheForTests();
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // best effort
    }
  });

  it("resolves a document id's internalPages[].url to what fetchPrimaryPublishedUrlsBatch returned", async () => {
    mockChainCms.mockImplementation(async (toolName: string, args: Record<string, unknown>) => {
      if (toolName === "get-document-urls") {
        const ids = args.id as string[];
        return {
          ok: true,
          data: {
            items: ids
              .filter((id) => id === PAGE_ID)
              .map((id) => ({
                id,
                urlInfos: [{ culture: "en-US", url: "/about-us", message: null, provider: "x" }],
              })),
          },
        };
      }
      if (toolName === "get-document-by-id") {
        if (args.id === PAGE_ID) {
          return {
            ok: true,
            data: {
              variants: [{ name: "About Us" }],
              documentType: { alias: "articlePage" },
            },
          };
        }
        return { ok: false, errorResult: { isError: true, content: [] } };
      }
      if (toolName === "get-media-by-id") {
        return { ok: false, errorResult: { isError: true, content: [] } };
      }
      throw new Error(`Unexpected chained tool: ${toolName}`);
    });

    const result = await resolveOutboundIds([PAGE_ID], SOURCE_ID);

    expect(result.internalPages).toEqual([
      { id: PAGE_ID, name: "About Us", url: "/about-us", documentType: "articlePage" },
    ]);
    expect(result.media).toEqual([]);
  });

  it("resolves a media id separately, with no published url expected", async () => {
    mockChainCms.mockImplementation(async (toolName: string, args: Record<string, unknown>) => {
      if (toolName === "get-document-urls") {
        return { ok: true, data: { items: [] } };
      }
      if (toolName === "get-document-by-id") {
        return { ok: false, errorResult: { isError: true, content: [] } };
      }
      if (toolName === "get-media-by-id") {
        if (args.id === MEDIA_ID) {
          return {
            ok: true,
            data: {
              variants: [{ name: "Hero Image" }],
              mediaType: { alias: "image" },
            },
          };
        }
        return { ok: false, errorResult: { isError: true, content: [] } };
      }
      throw new Error(`Unexpected chained tool: ${toolName}`);
    });

    const result = await resolveOutboundIds([MEDIA_ID], SOURCE_ID);

    expect(result.internalPages).toEqual([]);
    expect(result.media).toEqual([{ id: MEDIA_ID, name: "Hero Image", mediaType: "image" }]);
  });

  it("excludes the source page's own id before resolving", async () => {
    mockChainCms.mockImplementation(async (toolName: string) => {
      if (toolName === "get-document-urls") return { ok: true, data: { items: [] } };
      throw new Error(`Unexpected chained tool call for excluded id: ${toolName}`);
    });

    const result = await resolveOutboundIds([SOURCE_ID.toLowerCase()], SOURCE_ID);

    expect(result.internalPages).toEqual([]);
    expect(result.media).toEqual([]);
    expect(mockChainCms).not.toHaveBeenCalledWith("get-document-by-id", expect.anything());
    expect(mockChainCms).not.toHaveBeenCalledWith("get-media-by-id", expect.anything());
  });
});
