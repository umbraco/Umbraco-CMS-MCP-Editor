import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import uploadMediaTool from "./post/upload-media.js";
import createMediaFolderTool from "./post/create-media-folder.js";
import moveMediaTool from "./put/move-media.js";
import deleteMediaTool from "./delete/delete-media.js";
import restoreMediaTool from "./put/restore-media.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "media-management",
    displayName: "Media Management",
    description: "Upload, organise, delete, and restore media items",
  },
  tools: () => [uploadMediaTool, createMediaFolderTool, moveMediaTool, deleteMediaTool, restoreMediaTool],
};

export default collection;
