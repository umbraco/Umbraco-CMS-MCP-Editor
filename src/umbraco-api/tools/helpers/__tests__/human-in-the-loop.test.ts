/**
 * Unit tests for the human-in-the-loop gate helper.
 *
 * These tests are pure — they do not hit the CMS, so they run without a live
 * Umbraco instance.
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isHumanInTheLoopBlocking,
  setHumanInTheLoopOverride,
  checkHumanInTheLoop,
} from "../human-in-the-loop.js";
import { _resetCacheForTests } from "../preview-url.js";

describe("human-in-the-loop gate", () => {
  const originalEnvVar = process.env.UMBRACO_HUMAN_IN_THE_LOOP;
  const originalBaseUrl = process.env.UMBRACO_BASE_URL;
  let tmpDir: string;
  let origCwd: () => string;

  beforeEach(() => {
    // Point cwd at an empty tmp dir so getUmbracoBaseUrl() (used internally
    // for the deep-link URLs) falls back to process.env.UMBRACO_BASE_URL
    // deterministically, rather than reading this repo's real .env.
    tmpDir = mkdtempSync(join(tmpdir(), "human-in-the-loop-"));
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
    setHumanInTheLoopOverride(undefined);
    if (originalEnvVar === undefined) delete process.env.UMBRACO_HUMAN_IN_THE_LOOP;
    else process.env.UMBRACO_HUMAN_IN_THE_LOOP = originalEnvVar;
    if (originalBaseUrl === undefined) delete process.env.UMBRACO_BASE_URL;
    else process.env.UMBRACO_BASE_URL = originalBaseUrl;
  });

  describe("isHumanInTheLoopBlocking", () => {
    it("blocks when the env var is unset", () => {
      delete process.env.UMBRACO_HUMAN_IN_THE_LOOP;
      expect(isHumanInTheLoopBlocking()).toBe(true);
    });

    it("blocks for any value other than 'false'", () => {
      process.env.UMBRACO_HUMAN_IN_THE_LOOP = "true";
      expect(isHumanInTheLoopBlocking()).toBe(true);
      process.env.UMBRACO_HUMAN_IN_THE_LOOP = "nonsense";
      expect(isHumanInTheLoopBlocking()).toBe(true);
    });

    it("opens the gate only for 'false' (case-insensitive, trimmed)", () => {
      process.env.UMBRACO_HUMAN_IN_THE_LOOP = "false";
      expect(isHumanInTheLoopBlocking()).toBe(false);
      process.env.UMBRACO_HUMAN_IN_THE_LOOP = "FALSE";
      expect(isHumanInTheLoopBlocking()).toBe(false);
      process.env.UMBRACO_HUMAN_IN_THE_LOOP = "  false  ";
      expect(isHumanInTheLoopBlocking()).toBe(false);
    });

    it("setHumanInTheLoopOverride(true) forces blocking even when the env var says open", () => {
      process.env.UMBRACO_HUMAN_IN_THE_LOOP = "false";
      setHumanInTheLoopOverride(true);
      expect(isHumanInTheLoopBlocking()).toBe(true);
    });

    it("setHumanInTheLoopOverride(false) forces the gate open even when the env var says blocking", () => {
      delete process.env.UMBRACO_HUMAN_IN_THE_LOOP;
      setHumanInTheLoopOverride(false);
      expect(isHumanInTheLoopBlocking()).toBe(false);
    });

    it("setHumanInTheLoopOverride(undefined) clears a prior override", () => {
      setHumanInTheLoopOverride(true);
      setHumanInTheLoopOverride(undefined);
      process.env.UMBRACO_HUMAN_IN_THE_LOOP = "false";
      expect(isHumanInTheLoopBlocking()).toBe(false);
    });
  });

  describe("checkHumanInTheLoop", () => {
    it("returns null when the gate is open", () => {
      process.env.UMBRACO_HUMAN_IN_THE_LOOP = "false";
      expect(checkHumanInTheLoop({ verb: "publish", documentId: "abc" })).toBeNull();
    });

    it("links to the document edit screen for publish/unpublish with a documentId", () => {
      delete process.env.UMBRACO_HUMAN_IN_THE_LOOP;
      process.env.UMBRACO_BASE_URL = "https://cms.example.com";
      const result = checkHumanInTheLoop({ verb: "publish", documentId: "abc-123" });
      expect(result?.isError).toBe(true);
      const detail = String((result as any).structuredContent?.detail ?? "");
      expect(detail).toContain("https://cms.example.com/umbraco/section/content/workspace/document/edit/abc-123");
    });

    it("falls back to the Content section URL for publish/unpublish with no documentId", () => {
      delete process.env.UMBRACO_HUMAN_IN_THE_LOOP;
      process.env.UMBRACO_BASE_URL = "https://cms.example.com";
      const result = checkHumanInTheLoop({ verb: "unpublish" });
      const detail = String((result as any).structuredContent?.detail ?? "");
      expect(detail).toContain("https://cms.example.com/umbraco/section/content");
      expect(detail).not.toContain("workspace/document/edit");
    });

    it("always uses the Content section URL for delete, never a document link", () => {
      delete process.env.UMBRACO_HUMAN_IN_THE_LOOP;
      process.env.UMBRACO_BASE_URL = "https://cms.example.com";
      const result = checkHumanInTheLoop({ verb: "delete" });
      const detail = String((result as any).structuredContent?.detail ?? "");
      expect(detail).toContain("https://cms.example.com/umbraco/section/content");
      expect(detail).not.toContain("workspace/document/edit");
    });

    it("appends the hint when given", () => {
      delete process.env.UMBRACO_HUMAN_IN_THE_LOOP;
      process.env.UMBRACO_BASE_URL = "https://cms.example.com";
      const result = checkHumanInTheLoop({ verb: "publish", hint: "Use create-page instead." });
      const detail = String((result as any).structuredContent?.detail ?? "");
      expect(detail).toContain("Use create-page instead.");
    });

    it("omits the link sentence when the base URL isn't resolvable", () => {
      delete process.env.UMBRACO_HUMAN_IN_THE_LOOP;
      delete process.env.UMBRACO_BASE_URL;
      const result = checkHumanInTheLoop({ verb: "delete" });
      const detail = String((result as any).structuredContent?.detail ?? "");
      expect(detail).not.toContain("undefined");
      expect(detail).not.toContain("Open ");
    });
  });
});
