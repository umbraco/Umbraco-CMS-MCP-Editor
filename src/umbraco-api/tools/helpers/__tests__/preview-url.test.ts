/**
 * Unit tests for the preview-url helper.
 *
 * These tests are pure — they do not hit the CMS, so they run without a live
 * Umbraco instance.
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { mkdtempSync, writeFileSync, utimesSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildPreviewUrl,
  flattenPublishedUrls,
  getUmbracoBaseUrl,
  _resetCacheForTests,
} from "../preview-url.js";

describe("preview-url helper", () => {
  const originalBaseUrl = process.env.UMBRACO_BASE_URL;

  afterEach(() => {
    if (originalBaseUrl === undefined) {
      delete process.env.UMBRACO_BASE_URL;
    } else {
      process.env.UMBRACO_BASE_URL = originalBaseUrl;
    }
    _resetCacheForTests();
  });

  describe("getUmbracoBaseUrl (process.env fallback — no .env file in cwd)", () => {
    // These tests run from the project root where .env may or may not exist.
    // We override process.env.UMBRACO_BASE_URL and rely on the fact that
    // when .env doesn't carry the key, the function falls back to process.env.
    // For isolation we use a tmpdir with no .env file.
    let tmpDir: string;
    let origCwd: () => string;

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), "preview-url-fallback-"));
      origCwd = process.cwd;
      process.cwd = () => tmpDir;
      _resetCacheForTests();
    });

    afterEach(() => {
      process.cwd = origCwd;
      try {
        rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // best effort
      }
    });

    it("falls back to process.env when .env is absent", () => {
      process.env.UMBRACO_BASE_URL = "https://cms.example.com/";
      expect(getUmbracoBaseUrl()).toBe("https://cms.example.com");
    });

    it("trims multiple trailing slashes (fallback path)", () => {
      process.env.UMBRACO_BASE_URL = "https://cms.example.com///";
      expect(getUmbracoBaseUrl()).toBe("https://cms.example.com");
    });

    it("returns null when the env var is unset and .env absent", () => {
      delete process.env.UMBRACO_BASE_URL;
      expect(getUmbracoBaseUrl()).toBeNull();
    });

    it("returns null when the env var is empty and .env absent", () => {
      process.env.UMBRACO_BASE_URL = "";
      expect(getUmbracoBaseUrl()).toBeNull();
    });
  });

  describe("getUmbracoBaseUrl .env file watcher", () => {
    let tmpDir: string;
    let origCwd: () => string;

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), "preview-url-test-"));
      origCwd = process.cwd;
      process.cwd = () => tmpDir;
      _resetCacheForTests();
      // Ensure process.env doesn't interfere with .env file reads.
      delete process.env.UMBRACO_BASE_URL;
    });

    afterEach(() => {
      process.cwd = origCwd;
      try {
        rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // best effort
      }
    });

    it("reads UMBRACO_BASE_URL from .env file", () => {
      writeFileSync(join(tmpDir, ".env"), "UMBRACO_BASE_URL=https://localhost:11111\n");
      expect(getUmbracoBaseUrl()).toBe("https://localhost:11111");
    });

    it("strips trailing slash from .env value", () => {
      writeFileSync(join(tmpDir, ".env"), "UMBRACO_BASE_URL=https://localhost:11111/\n");
      expect(getUmbracoBaseUrl()).toBe("https://localhost:11111");
    });

    it("strips surrounding double quotes from .env value", () => {
      writeFileSync(join(tmpDir, ".env"), 'UMBRACO_BASE_URL="https://localhost:22222"\n');
      expect(getUmbracoBaseUrl()).toBe("https://localhost:22222");
    });

    it("strips surrounding single quotes from .env value", () => {
      writeFileSync(join(tmpDir, ".env"), "UMBRACO_BASE_URL='https://localhost:22222'\n");
      expect(getUmbracoBaseUrl()).toBe("https://localhost:22222");
    });

    it("picks up port changes after .env mtime advances", () => {
      const envPath = join(tmpDir, ".env");
      writeFileSync(envPath, "UMBRACO_BASE_URL=https://localhost:22222\n");

      // First read — primes the cache.
      expect(getUmbracoBaseUrl()).toBe("https://localhost:22222");

      // Write new value and advance mtime by 1 s to guarantee a new mtime
      // (some filesystems store mtime at 1-second resolution).
      writeFileSync(envPath, "UMBRACO_BASE_URL=https://localhost:33333\n");
      const future = new Date(Date.now() + 1000);
      utimesSync(envPath, future, future);

      expect(getUmbracoBaseUrl()).toBe("https://localhost:33333");
    });

    it("returns null when .env exists but has no UMBRACO_BASE_URL key", () => {
      writeFileSync(join(tmpDir, ".env"), "OTHER_VAR=foo\n");
      expect(getUmbracoBaseUrl()).toBeNull();
    });

    it("supports optional export prefix", () => {
      writeFileSync(join(tmpDir, ".env"), "export UMBRACO_BASE_URL=https://localhost:55555\n");
      expect(getUmbracoBaseUrl()).toBe("https://localhost:55555");
    });
  });

  describe("buildPreviewUrl", () => {
    // Use a tmpdir with a .env file so the watcher reads the expected URL.
    // This avoids the project-root .env leaking into these tests.
    let tmpDir: string;
    let origCwd: () => string;

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), "preview-url-build-"));
      origCwd = process.cwd;
      process.cwd = () => tmpDir;
      _resetCacheForTests();
    });

    afterEach(() => {
      process.cwd = origCwd;
      try {
        rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // best effort
      }
    });

    it("builds the cookie-gated backoffice preview URL with the auth flag", () => {
      writeFileSync(join(tmpDir, ".env"), "UMBRACO_BASE_URL=https://cms.example.com\n");
      expect(buildPreviewUrl("1234-5678")).toEqual({
        url: "https://cms.example.com/umbraco/preview?id=1234-5678",
        requiresBackofficeAuth: true,
      });
    });

    it("URL-encodes the document id", () => {
      writeFileSync(join(tmpDir, ".env"), "UMBRACO_BASE_URL=https://cms.example.com\n");
      const result = buildPreviewUrl("a/b c");
      expect(result?.url).toBe("https://cms.example.com/umbraco/preview?id=a%2Fb%20c");
    });

    it("returns null when the base URL isn't resolvable", () => {
      // No .env file, no process.env — should return null.
      delete process.env.UMBRACO_BASE_URL;
      expect(buildPreviewUrl("doc-id")).toBeNull();
    });
  });

  describe("flattenPublishedUrls", () => {
    it("flattens the get-document-by-id shape", () => {
      const urls = [
        { culture: "en-US", url: "/home" },
        { culture: "fr", url: "/accueil" },
        { culture: "de", url: null },
      ];
      expect(flattenPublishedUrls(urls)).toEqual(["/home", "/accueil"]);
    });

    it("flattens the get-document-urls shape (urlInfos nested)", () => {
      const urls = [
        {
          id: "abc",
          urlInfos: [
            { culture: "en", url: "https://example.com/a", message: null, provider: "x" },
            { culture: "fr", url: "https://example.com/fr/a", message: null, provider: "x" },
          ],
        },
      ];
      expect(flattenPublishedUrls(urls)).toEqual([
        "https://example.com/a",
        "https://example.com/fr/a",
      ]);
    });

    it("drops entries with null/missing URLs", () => {
      const urls = [
        { culture: "en", url: null },
        { culture: "fr", url: "" },
        { culture: "de" },
        { culture: "es", url: "/only-good-one" },
      ];
      expect(flattenPublishedUrls(urls)).toEqual(["/only-good-one"]);
    });

    it("returns [] for non-array input", () => {
      expect(flattenPublishedUrls(undefined)).toEqual([]);
      expect(flattenPublishedUrls(null)).toEqual([]);
      expect(flattenPublishedUrls({ nope: true })).toEqual([]);
    });
  });
});
