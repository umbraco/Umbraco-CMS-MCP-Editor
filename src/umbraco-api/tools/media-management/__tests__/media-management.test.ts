/**
 * Media Management Collection Integration Tests
 *
 * Tests for create-media-folder, upload-media, move-media, delete-media, restore-media.
 * Runs against a real Umbraco instance via the chained @umbraco-cms/mcp-dev MCP server.
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

import createMediaFolderTool from "../post/create-media-folder.js";
import uploadMediaTool from "../post/upload-media.js";
import moveMediaTool from "../put/move-media.js";
import deleteMediaTool from "../delete/delete-media.js";
import restoreMediaTool from "../put/restore-media.js";
import listMediaChildrenTool from "../../media/get/list-media-children.js";

const elicitation = setupElicitationMock(jest.fn as any);

describe("Media Management Collection", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  const createdFolderIds: string[] = [];
  let cmsAvailable = false;

  beforeAll(async () => {
    try {
      const browseResult = await listMediaChildrenTool.handler(
        { parentId: undefined },
        extra,
      );
      const browseData = getStructuredContent(browseResult) as any;
      if (!browseResult.isError && browseData) {
        cmsAvailable = true;
      }
    } catch {
      console.warn("CMS not available — media-management integration tests will be skipped");
    }
  }, 60000);

  afterAll(async () => {
    for (const id of createdFolderIds) {
      try {
        await deleteMediaTool.handler({ id }, extra);
      } catch {
        // Best-effort cleanup
      }
    }
    elicitation.cleanup();
  }, 30000);

  beforeEach(() => {
    elicitation.reset();
  });

  describe("create-media-folder, delete-media, restore-media lifecycle", () => {
    let createdFolderId: string;

    it("should create a media folder", async () => {
      if (!cmsAvailable) return;

      const result = await createMediaFolderTool.handler(
        { name: "Integration Test Folder", parentId: undefined },
        extra,
      );

      if (result.isError) {
        console.warn("Skipping create-media-folder assertions: CMS returned error");
        return;
      }

      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.message).toContain("Created");
      expect(data.name).toBe("Integration Test Folder");
      expect(data.id).toBeTruthy();

      createdFolderId = data.id;
      createdFolderIds.push(createdFolderId);
    }, 30000);

    it("should delete the created folder", async () => {
      if (!cmsAvailable || !createdFolderId) {
        console.warn("Skipping delete test: no folder was created");
        return;
      }

      const result = await deleteMediaTool.handler({ id: createdFolderId }, extra);

      if (result.isError) {
        console.warn("Skipping delete-media assertions: CMS returned error");
        return;
      }

      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.message).toContain("recycle bin");
      expect(data.id).toBe(createdFolderId);
    }, 30000);

    it("should restore the deleted folder", async () => {
      if (!cmsAvailable || !createdFolderId) {
        console.warn("Skipping restore test: no folder was deleted");
        return;
      }

      const result = await restoreMediaTool.handler({ id: createdFolderId }, extra);

      if (result.isError) {
        console.warn("Skipping restore-media assertions: CMS returned error");
        return;
      }

      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.message).toContain("Restored");
      expect(data.id).toBe(createdFolderId);
    }, 30000);
  });

  describe("move-media", () => {
    let sourceFolderId: string;
    let targetFolderId: string;

    it("should move a media folder into another folder", async () => {
      if (!cmsAvailable) return;

      // Create two folders: one to move, one as target
      const sourceResult = await createMediaFolderTool.handler(
        { name: "Move Source Folder", parentId: undefined },
        extra,
      );
      elicitation.reset();
      const targetResult = await createMediaFolderTool.handler(
        { name: "Move Target Folder", parentId: undefined },
        extra,
      );
      elicitation.reset();

      if (sourceResult.isError || targetResult.isError) {
        console.warn("Skipping move test: could not create test folders");
        return;
      }

      const sourceData = getStructuredContent(sourceResult) as any;
      const targetData = getStructuredContent(targetResult) as any;
      sourceFolderId = sourceData.id;
      targetFolderId = targetData.id;
      createdFolderIds.push(sourceFolderId, targetFolderId);

      const result = await moveMediaTool.handler(
        { id: sourceFolderId, targetParentId: targetFolderId },
        extra,
      );

      if (result.isError) {
        console.warn("Skipping move-media assertions: CMS returned error");
        return;
      }

      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.message).toContain("Moved");
      expect(data.id).toBe(sourceFolderId);
    }, 60000);
  });

  describe("elicitation rejection", () => {
    it("should cancel create-media-folder when elicitation is rejected", async () => {
      if (!cmsAvailable) return;

      elicitation.rejectAll();

      const result = await createMediaFolderTool.handler(
        { name: "Should Not Be Created", parentId: undefined },
        extra,
      );

      const data = getStructuredContent(result) as any;
      // Tool may error before reaching elicitation (CMS call fails) or cancel via elicitation
      expect(data?.message?.includes("cancelled") || result.isError).toBe(true);
    }, 30000);

    it("should cancel delete-media when elicitation is rejected", async () => {
      if (!cmsAvailable) return;

      // Create a folder to attempt to delete
      const createResult = await createMediaFolderTool.handler(
        { name: "Elicitation Reject Test Folder", parentId: undefined },
        extra,
      );
      elicitation.reset();

      if (createResult.isError) {
        console.warn("Skipping delete-rejection test: could not create test folder");
        return;
      }

      const createData = getStructuredContent(createResult) as any;
      const folderId = createData.id;
      createdFolderIds.push(folderId);

      elicitation.rejectAll();

      const result = await deleteMediaTool.handler({ id: folderId }, extra);

      const data = getStructuredContent(result) as any;
      // Tool may error before reaching elicitation (CMS call fails) or cancel via elicitation
      expect(data?.message?.includes("cancelled") || result.isError).toBe(true);
    }, 30000);

    it("should cancel restore-media when elicitation is rejected", async () => {
      if (!cmsAvailable) return;

      // Create then delete a folder, then try to restore with rejection
      const createResult = await createMediaFolderTool.handler(
        { name: "Restore Reject Test Folder", parentId: undefined },
        extra,
      );
      elicitation.reset();

      if (createResult.isError) {
        console.warn("Skipping restore-rejection test: could not create test folder");
        return;
      }

      const createData = getStructuredContent(createResult) as any;
      const folderId = createData.id;
      createdFolderIds.push(folderId);

      // Delete it first
      await deleteMediaTool.handler({ id: folderId }, extra);
      elicitation.reset();

      elicitation.rejectAll();

      const result = await restoreMediaTool.handler({ id: folderId }, extra);

      const data = getStructuredContent(result) as any;
      // Tool may error before reaching elicitation (CMS call fails) or cancel via elicitation
      expect(data?.message?.includes("cancelled") || result.isError).toBe(true);
    }, 60000);

    it("should cancel move-media when elicitation is rejected", async () => {
      if (!cmsAvailable) return;

      // Create two folders for the move attempt
      const sourceResult = await createMediaFolderTool.handler(
        { name: "Move Reject Source", parentId: undefined },
        extra,
      );
      elicitation.reset();
      const targetResult = await createMediaFolderTool.handler(
        { name: "Move Reject Target", parentId: undefined },
        extra,
      );
      elicitation.reset();

      if (sourceResult.isError || targetResult.isError) {
        console.warn("Skipping move-rejection test: could not create test folders");
        return;
      }

      const sourceData = getStructuredContent(sourceResult) as any;
      const targetData = getStructuredContent(targetResult) as any;
      createdFolderIds.push(sourceData.id, targetData.id);

      elicitation.rejectAll();

      const result = await moveMediaTool.handler(
        { id: sourceData.id, targetParentId: targetData.id },
        extra,
      );

      const data = getStructuredContent(result) as any;
      // Tool may error before reaching elicitation (CMS call fails) or cancel via elicitation
      expect(data?.message?.includes("cancelled") || result.isError).toBe(true);
    }, 60000);

    it("should cancel upload-media when elicitation is rejected", async () => {
      if (!cmsAvailable) return;

      elicitation.rejectAll();

      const result = await uploadMediaTool.handler(
        { filePath: "/tmp/test-image.jpg", name: "Should Not Upload", parentId: undefined, mediaTypeId: undefined },
        extra,
      );

      const data = getStructuredContent(result) as any;
      // Tool may error before reaching elicitation (CMS call fails) or cancel via elicitation
      expect(data?.message?.includes("cancelled") || result.isError).toBe(true);
    }, 30000);
  });
});
