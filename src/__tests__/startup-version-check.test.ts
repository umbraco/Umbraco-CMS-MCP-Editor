/**
 * Unit tests for the stdio-only startup version check — no live Umbraco
 * needed. Drives `checkStdioUmbracoVersion` with a fake `getServerInformation`
 * for the mismatch, match, and unreachable-CMS cases, asserting
 * `getVersionCheckMessage()` ends up non-null / null and that the check never
 * throws (CheckVersionOptions.md requirement 6/7 for issue #247).
 *
 * `configureVersionCheckHook()` is never called here — asserted via a static
 * source check rather than `jest.spyOn` on the SDK's named exports: the SDK
 * is published as native ESM, whose module-namespace properties are
 * non-configurable live bindings, so `jest.spyOn`/`Object.defineProperty`
 * cannot replace them (the attempt throws "Cannot redefine property").
 * A real `VersionCheckService` instance is used per test (instead of the
 * SDK's module-level singleton) so cases don't leak state into each other.
 */

import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { VersionCheckService, getVersionCheckMessage } from "@umbraco-cms/mcp-server-sdk";
import { checkStdioUmbracoVersion } from "../startup-version-check.js";

describe("checkStdioUmbracoVersion", () => {
  it("sets a non-null message on a major-version mismatch", async () => {
    const service = new VersionCheckService();

    await checkStdioUmbracoVersion({
      mcpVersion: "18.0.0",
      expectedUmbracoMajor: "18",
      service,
      client: {
        getServerInformation: async () => ({ version: "17.2.0" }),
      },
    });

    expect(getVersionCheckMessage(service)).not.toBeNull();
    expect(getVersionCheckMessage(service)).toContain("Version Mismatch");
  });

  it("sets no message when the major versions match", async () => {
    const service = new VersionCheckService();

    await checkStdioUmbracoVersion({
      mcpVersion: "18.0.0",
      expectedUmbracoMajor: "18",
      service,
      client: {
        getServerInformation: async () => ({ version: "18.3.1" }),
      },
    });

    expect(getVersionCheckMessage(service)).toBeNull();
  });

  it("never throws when the CMS is unreachable, and sets a diagnostic message", async () => {
    const service = new VersionCheckService();

    await expect(
      checkStdioUmbracoVersion({
        mcpVersion: "18.0.0",
        expectedUmbracoMajor: "18",
        service,
        client: {
          getServerInformation: async () => {
            throw new Error("fetch failed: ECONNREFUSED");
          },
        },
      }),
    ).resolves.toBeUndefined();

    expect(getVersionCheckMessage(service)).toContain("Unable to verify");
  });

  it("never imports configureVersionCheckHook — stdio warns, it never blocks", () => {
    // See the file-level comment: the SDK's ESM exports can't be spied on
    // directly, so this asserts the invariant at the source level instead.
    // The function can only be called if it is imported from the SDK, so
    // checking the import specifier (rather than the whole file, which
    // mentions the name in prose/doc comments) is both sufficient and not
    // tripped up by those comments. PR #109 (closed in favour of issue #247)
    // added exactly this call; this guards against its reintroduction.
    const source = readFileSync(
      fileURLToPath(new URL("../startup-version-check.ts", import.meta.url)),
      "utf8",
    );
    const sdkImportMatch = source.match(
      /import\s*{([^}]*)}\s*from\s*["']@umbraco-cms\/mcp-server-sdk["']/,
    );
    expect(sdkImportMatch).not.toBeNull();
    expect(sdkImportMatch![1]).not.toContain("configureVersionCheckHook");
  });
});
