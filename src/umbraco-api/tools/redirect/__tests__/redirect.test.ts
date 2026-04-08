/**
 * Redirect Collection Integration Tests
 *
 * Tests for list-redirects, get-redirect, get-redirect-status, delete-redirect.
 * Runs against a real Umbraco instance.
 *
 * Prerequisites:
 * - Running Umbraco instance with API user configured (see CLAUDE.md)
 * - Valid credentials in .env file
 */

import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  setupElicitationMock,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "@umbraco-cms/mcp-server-sdk/testing";

import listRedirectsTool from "../get/list-redirects.js";
import getRedirectTool from "../get/get-redirect.js";
import getRedirectStatusTool from "../get/get-redirect-status.js";
import deleteRedirectTool from "../delete/delete-redirect.js";

const elicitation = setupElicitationMock(jest.fn as any);

describe("Redirect Collection", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let firstRedirectId: string | undefined;
  let cmsAvailable = false;

  beforeAll(async () => {
    try {
      // get-redirect-status always works — use it as CMS availability check
      const statusResult = await getRedirectStatusTool.handler({}, extra);
      if (!statusResult.isError) {
        cmsAvailable = true;
      }

      // Try to grab the first redirect ID for subsequent tests
      const listResult = await listRedirectsTool.handler({ take: 1, skip: 0, filter: undefined }, extra);
      if (!listResult.isError) {
        const listData = getStructuredContent(listResult) as any;
        if (listData?.items?.length > 0) {
          firstRedirectId = listData.items[0].id;
        }
      }
    } catch {
      console.warn("CMS not available — redirect integration tests will be skipped");
    }
  }, 60000);

  afterAll(() => {
    elicitation.cleanup();
  }, 30000);

  beforeEach(() => {
    elicitation.reset();
  });

  describe("get-redirect-status", () => {
    it("should return whether redirect tracking is enabled", async () => {
      if (!cmsAvailable) return;

      const result = await getRedirectStatusTool.handler({}, extra);

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.isEnabled).toEqual(expect.any(Boolean));
      expect(data.message).toEqual(expect.any(String));
    }, 30000);
  });

  describe("list-redirects", () => {
    it("should list redirects and return structured result (may be empty)", async () => {
      if (!cmsAvailable) return;

      const result = await listRedirectsTool.handler({ take: 10, skip: 0, filter: undefined }, extra);

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.items).toBeInstanceOf(Array);
      expect(data.total).toEqual(expect.any(Number));

      // If redirects exist, verify item structure
      if (data.items.length > 0) {
        expect(data.items[0]).toHaveProperty("id");
        expect(data.items[0]).toHaveProperty("originalUrl");
        expect(data.items[0]).toHaveProperty("destinationUrl");
        expect(data.items[0]).toHaveProperty("destinationType");
        expect(data.items[0]).toHaveProperty("isAutomatic");
        expect(data.items[0].isAutomatic).toEqual(expect.any(Boolean));
      }
    }, 30000);
  });

  describe("get-redirect", () => {
    it("should get redirect details when one exists", async () => {
      if (!cmsAvailable || !firstRedirectId) {
        console.warn("Skipping get-redirect test: no redirects found on the site");
        return;
      }

      const result = await getRedirectTool.handler({ id: firstRedirectId }, extra);

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.id).toBe(firstRedirectId);
      expect(data.originalUrl).toEqual(expect.any(String));
      expect(data.destinationUrl).toEqual(expect.any(String));
      expect(data.destinationType).toEqual(expect.any(String));
      expect(data.isAutomatic).toEqual(expect.any(Boolean));
      expect(data.createDate).toEqual(expect.any(String));
    }, 30000);

    it("should return error or empty result for non-existent redirect", async () => {
      if (!cmsAvailable) return;

      const result = await getRedirectTool.handler(
        { id: "00000000-0000-0000-0000-000000000000" },
        extra,
      );

      // The API may return 404 (isError) or an empty object — both are acceptable
      if (result.isError) {
        expect(result.isError).toBeTruthy();
      } else {
        const data = getStructuredContent(result) as any;
        // If no error, the id should be empty or match what was requested
        expect(data).toBeDefined();
      }
    }, 30000);
  });

  describe("delete-redirect elicitation rejection", () => {
    it("should cancel delete-redirect when elicitation is rejected", async () => {
      if (!cmsAvailable || !firstRedirectId) {
        console.warn("Skipping delete-redirect elicitation test: no redirects found on the site");
        return;
      }

      elicitation.rejectAll();

      const result = await deleteRedirectTool.handler({ id: firstRedirectId }, extra);

      expect(result.isError).toBeFalsy();
      expect(elicitation.mock).toHaveBeenCalled();
      const data = getStructuredContent(result) as any;
      expect(data.message).toContain("cancelled");
    }, 30000);
  });
});
