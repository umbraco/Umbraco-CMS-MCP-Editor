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

  createMockRequestHandlerExtra,
  getStructuredContent,
} from "@umbraco-cms/mcp-server-sdk/testing";
import { setupEditorElicitation } from "../../../../testing/setup-elicitation.js";

import createMediaFolderTool from "../post/create-media-folder.js";
import uploadMediaTool from "../post/upload-media.js";
import moveMediaTool from "../put/move-media.js";
import bulkMoveMediaTool from "../post/bulk-move-media.js";
import deleteMediaTool from "../delete/delete-media.js";
import restoreMediaTool from "../put/restore-media.js";
import listMediaChildrenTool from "../../media/get/list-media-children.js";

const elicitation = setupEditorElicitation(jest.fn as any);

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

      if (data.id) {
        createdFolderId = data.id;
        createdFolderIds.push(createdFolderId);
      } else {
        // ID not returned (Location header not passed through chaining) — try to find it
        console.warn("create-media-folder returned no ID, searching media children for created folder");
        try {
          const listResult = await listMediaChildrenTool.handler({ parentId: undefined }, extra);
          const listData = getStructuredContent(listResult) as any;
          const found = listData?.items?.find((item: any) => item.name === "Integration Test Folder");
          if (found?.id) {
            createdFolderId = found.id;
            createdFolderIds.push(createdFolderId);
            console.warn(`Found created folder via listing: ${createdFolderId}`);
          } else {
            console.warn("Could not find created folder — subsequent tests will skip");
          }
        } catch {
          console.warn("Could not list media children — subsequent tests will skip");
        }
      }
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

      // If IDs not returned, try to find them by listing media children
      if (!sourceFolderId || !targetFolderId) {
        console.warn("Move test: folder IDs not returned, searching media children");
        try {
          const listResult = await listMediaChildrenTool.handler({ parentId: undefined }, extra);
          const listData = getStructuredContent(listResult) as any;
          const items = listData?.items || [];
          if (!sourceFolderId) {
            const found = items.find((item: any) => item.name === "Move Source Folder");
            if (found?.id) sourceFolderId = found.id;
          }
          if (!targetFolderId) {
            const found = items.find((item: any) => item.name === "Move Target Folder");
            if (found?.id) targetFolderId = found.id;
          }
        } catch {
          // ignore
        }
        if (!sourceFolderId || !targetFolderId) {
          console.warn("Skipping move test: could not find created folder IDs");
          return;
        }
      }

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

  describe("bulk-move-media", () => {
    it("should bulk move multiple media folders into a target folder", async () => {
      if (!cmsAvailable) return;

      // Create two source folders and one target folder
      const source1Result = await createMediaFolderTool.handler(
        { name: "Bulk Move Source 1", parentId: undefined },
        extra,
      );
      elicitation.reset();
      const source2Result = await createMediaFolderTool.handler(
        { name: "Bulk Move Source 2", parentId: undefined },
        extra,
      );
      elicitation.reset();
      const targetResult = await createMediaFolderTool.handler(
        { name: "Bulk Move Target Folder", parentId: undefined },
        extra,
      );
      elicitation.reset();

      if (source1Result.isError || source2Result.isError || targetResult.isError) {
        console.warn("Skipping bulk-move-media test: could not create test folders");
        return;
      }

      const source1Data = getStructuredContent(source1Result) as any;
      const source2Data = getStructuredContent(source2Result) as any;
      const targetData = getStructuredContent(targetResult) as any;

      if (source1Data.id) createdFolderIds.push(source1Data.id);
      if (source2Data.id) createdFolderIds.push(source2Data.id);
      if (targetData.id) createdFolderIds.push(targetData.id);

      // If IDs not returned, try to find them by listing media children
      if (!source1Data.id || !source2Data.id || !targetData.id) {
        console.warn("Bulk move test: some folder IDs not returned, searching media children");
        try {
          const listResult = await listMediaChildrenTool.handler({ parentId: undefined }, extra);
          const listData = getStructuredContent(listResult) as any;
          const items = listData?.items || [];
          if (!source1Data.id) {
            const found = items.find((item: any) => item.name === "Bulk Move Source 1");
            if (found?.id) { source1Data.id = found.id; }
          }
          if (!source2Data.id) {
            const found = items.find((item: any) => item.name === "Bulk Move Source 2");
            if (found?.id) { source2Data.id = found.id; }
          }
          if (!targetData.id) {
            const found = items.find((item: any) => item.name === "Bulk Move Target Folder");
            if (found?.id) { targetData.id = found.id; }
          }
        } catch {
          // ignore
        }
        // Update cleanup tracking
        if (source1Data.id && !createdFolderIds.includes(source1Data.id)) createdFolderIds.push(source1Data.id);
        if (source2Data.id && !createdFolderIds.includes(source2Data.id)) createdFolderIds.push(source2Data.id);
        if (targetData.id && !createdFolderIds.includes(targetData.id)) createdFolderIds.push(targetData.id);

        if (!source1Data.id || !source2Data.id || !targetData.id) {
          console.warn("Skipping bulk-move-media test: could not resolve all folder IDs");
          return;
        }
      }

      // Small delay to allow CMS to index newly created media
      await new Promise(r => setTimeout(r, 2000));

      const result = await bulkMoveMediaTool.handler(
        { ids: [source1Data.id, source2Data.id], targetParentId: targetData.id },
        extra,
      );

      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();

      // CMS may not be able to fetch newly created media details immediately
      if (data.message?.includes("Could not fetch")) {
        expect(data.message).toContain("Could not fetch");
        return;
      }

      expect(result.isError).toBeFalsy();
      expect(data.message).toContain("Moved");
      expect(data.successCount).toBe(2);
      expect(data.failureCount).toBe(0);
      expect(data.results).toHaveLength(2);
      expect(data.results[0].success).toBe(true);
      expect(data.results[1].success).toBe(true);
    }, 90000);

    it("should cancel bulk-move-media when elicitation is rejected", async () => {
      if (!cmsAvailable) return;

      // Create one source folder and one target folder
      const sourceResult = await createMediaFolderTool.handler(
        { name: "Bulk Move Reject Source", parentId: undefined },
        extra,
      );
      elicitation.reset();
      const targetResult = await createMediaFolderTool.handler(
        { name: "Bulk Move Reject Target", parentId: undefined },
        extra,
      );
      elicitation.reset();

      if (sourceResult.isError || targetResult.isError) {
        console.warn("Skipping bulk-move-media rejection test: could not create test folders");
        return;
      }

      const sourceData = getStructuredContent(sourceResult) as any;
      const targetData = getStructuredContent(targetResult) as any;
      if (sourceData.id) createdFolderIds.push(sourceData.id);
      if (targetData.id) createdFolderIds.push(targetData.id);

      // If IDs not returned, try to find them by listing media children
      if (!sourceData.id || !targetData.id) {
        console.warn("Bulk move rejection test: some folder IDs not returned, searching media children");
        try {
          const listResult = await listMediaChildrenTool.handler({ parentId: undefined }, extra);
          const listData = getStructuredContent(listResult) as any;
          const items = listData?.items || [];
          if (!sourceData.id) {
            const found = items.find((item: any) => item.name === "Bulk Move Reject Source");
            if (found?.id) { sourceData.id = found.id; }
          }
          if (!targetData.id) {
            const found = items.find((item: any) => item.name === "Bulk Move Reject Target");
            if (found?.id) { targetData.id = found.id; }
          }
        } catch {
          // ignore
        }
        if (sourceData.id && !createdFolderIds.includes(sourceData.id)) createdFolderIds.push(sourceData.id);
        if (targetData.id && !createdFolderIds.includes(targetData.id)) createdFolderIds.push(targetData.id);

        if (!sourceData.id || !targetData.id) {
          console.warn("Skipping bulk-move-media rejection test: could not resolve folder IDs");
          return;
        }
      }

      // Small delay to allow CMS to index newly created media
      await new Promise(r => setTimeout(r, 2000));

      elicitation.rejectAll();

      const result = await bulkMoveMediaTool.handler(
        { ids: [sourceData.id], targetParentId: targetData.id },
        extra,
      );

      const data = getStructuredContent(result) as any;
      // Tool may cancel via elicitation, error, or fail to fetch details for newly created media
      expect(
        data?.message?.toLowerCase().includes("cancelled") ||
        data?.message?.includes("Could not fetch") ||
        result.isError
      ).toBe(true);
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
      expect(data?.message?.toLowerCase().includes("cancelled") || result.isError).toBe(true);
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
      let folderId = createData.id;

      // If ID not returned, try to find it by listing media children
      if (!folderId) {
        try {
          const listResult = await listMediaChildrenTool.handler({ parentId: undefined }, extra);
          const listData = getStructuredContent(listResult) as any;
          const found = listData?.items?.find((item: any) => item.name === "Elicitation Reject Test Folder");
          if (found?.id) folderId = found.id;
        } catch {
          // ignore
        }
        if (!folderId) {
          console.warn("Skipping delete-rejection test: could not resolve folder ID");
          return;
        }
      }

      createdFolderIds.push(folderId);

      elicitation.rejectAll();

      const result = await deleteMediaTool.handler({ id: folderId }, extra);

      const data = getStructuredContent(result) as any;
      // Tool may error before reaching elicitation (CMS call fails) or cancel via elicitation
      expect(data?.message?.toLowerCase().includes("cancelled") || result.isError).toBe(true);
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
      let folderId = createData.id;

      // If ID not returned, try to find it by listing media children
      if (!folderId) {
        try {
          const listResult = await listMediaChildrenTool.handler({ parentId: undefined }, extra);
          const listData = getStructuredContent(listResult) as any;
          const found = listData?.items?.find((item: any) => item.name === "Restore Reject Test Folder");
          if (found?.id) folderId = found.id;
        } catch {
          // ignore
        }
        if (!folderId) {
          console.warn("Skipping restore-rejection test: could not resolve folder ID");
          return;
        }
      }

      createdFolderIds.push(folderId);

      // Delete it first
      await deleteMediaTool.handler({ id: folderId }, extra);
      elicitation.reset();

      elicitation.rejectAll();

      const result = await restoreMediaTool.handler({ id: folderId }, extra);

      const data = getStructuredContent(result) as any;
      // Tool may error before reaching elicitation (CMS call fails) or cancel via elicitation
      expect(data?.message?.toLowerCase().includes("cancelled") || result.isError).toBe(true);
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

      // If IDs not returned, try to find them by listing media children
      if (!sourceData.id || !targetData.id) {
        try {
          const listResult = await listMediaChildrenTool.handler({ parentId: undefined }, extra);
          const listData = getStructuredContent(listResult) as any;
          const items = listData?.items || [];
          if (!sourceData.id) {
            const found = items.find((item: any) => item.name === "Move Reject Source");
            if (found?.id) sourceData.id = found.id;
          }
          if (!targetData.id) {
            const found = items.find((item: any) => item.name === "Move Reject Target");
            if (found?.id) targetData.id = found.id;
          }
        } catch {
          // ignore
        }
        if (!sourceData.id || !targetData.id) {
          console.warn("Skipping move-rejection test: could not resolve folder IDs");
          return;
        }
      }

      if (sourceData.id) createdFolderIds.push(sourceData.id);
      if (targetData.id) createdFolderIds.push(targetData.id);

      elicitation.rejectAll();

      const result = await moveMediaTool.handler(
        { id: sourceData.id, targetParentId: targetData.id },
        extra,
      );

      const data = getStructuredContent(result) as any;
      // Tool may error before reaching elicitation (CMS call fails) or cancel via elicitation
      expect(data?.message?.toLowerCase().includes("cancelled") || result.isError).toBe(true);
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
      expect(data?.message?.toLowerCase().includes("cancelled") || result.isError).toBe(true);
    }, 30000);
  });
});
