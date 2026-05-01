/**
 * Unit tests for the preview-url helper.
 *
 * These tests are pure — they do not hit the CMS, so they run without a live
 * Umbraco instance.
 */

import { describe, it, expect, afterEach } from "@jest/globals";
import {
  buildPreviewUrl,
  flattenPublishedUrls,
  getUmbracoBaseUrl,
} from "../preview-url.js";

describe("preview-url helper", () => {
  const originalBaseUrl = process.env.UMBRACO_BASE_URL;

  afterEach(() => {
    if (originalBaseUrl === undefined) {
      delete process.env.UMBRACO_BASE_URL;
    } else {
      process.env.UMBRACO_BASE_URL = originalBaseUrl;
    }
  });

  describe("getUmbracoBaseUrl", () => {
    it("returns the env value with trailing slashes trimmed", () => {
      process.env.UMBRACO_BASE_URL = "https://cms.example.com/";
      expect(getUmbracoBaseUrl()).toBe("https://cms.example.com");
    });

    it("trims multiple trailing slashes", () => {
      process.env.UMBRACO_BASE_URL = "https://cms.example.com///";
      expect(getUmbracoBaseUrl()).toBe("https://cms.example.com");
    });

    it("returns null when the env var is unset", () => {
      delete process.env.UMBRACO_BASE_URL;
      expect(getUmbracoBaseUrl()).toBeNull();
    });

    it("returns null when the env var is empty", () => {
      process.env.UMBRACO_BASE_URL = "";
      expect(getUmbracoBaseUrl()).toBeNull();
    });
  });

  describe("buildPreviewUrl", () => {
    it("builds the cookie-gated backoffice preview URL with the auth flag", () => {
      process.env.UMBRACO_BASE_URL = "https://cms.example.com";
      expect(buildPreviewUrl("1234-5678")).toEqual({
        url: "https://cms.example.com/umbraco/preview?id=1234-5678",
        requiresBackofficeAuth: true,
      });
    });

    it("URL-encodes the document id", () => {
      process.env.UMBRACO_BASE_URL = "https://cms.example.com";
      const result = buildPreviewUrl("a/b c");
      expect(result?.url).toBe("https://cms.example.com/umbraco/preview?id=a%2Fb%20c");
    });

    it("returns null when the base URL isn't resolvable", () => {
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
