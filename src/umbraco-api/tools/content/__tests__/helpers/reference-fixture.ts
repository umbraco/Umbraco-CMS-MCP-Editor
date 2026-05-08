/**
 * Reference test fixture — provisions throwaway data types and a document type that
 * registers references against Umbraco's referenced-by index.
 *
 * Built-in content-picker / media-picker data types on the demo site often ship
 * with filter config that silently drops values pointing at document types they
 * don't allow. This fixture creates its own fresh ContentPicker + MediaPicker3
 * data types so any document/media can be wired up.
 *
 * Usage:
 *   const fixture = await ensureReferenceFixture();  // in beforeAll
 *   await teardownReferenceFixture();                 // in afterAll
 */

import { randomUUID } from "node:crypto";
import { mcpClientManager } from "../../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";

export interface ReferenceFixture {
  /** Document type with `refPage` (ContentPicker) + `refMedia` (MediaPicker3) properties, allowedAsRoot. */
  docTypeId: string;
  /** Build the value an Umbraco.ContentPicker stores for a document reference (just the target id). */
  buildContentPickerValue(targetId: string): string;
  /** Build the structured value a MediaPicker3 stores for a media reference. */
  buildMediaPickerValue(mediaId: string): unknown;
}

interface CachedFixture extends ReferenceFixture {
  contentPickerDataTypeId: string;
  mediaPickerDataTypeId: string;
}

let cached: CachedFixture | null = null;

async function createDataType(name: string, editorAlias: string, editorUiAlias: string): Promise<string> {
  const result = await mcpClientManager.callTool("cms", "create-data-type", {
    name,
    editorAlias,
    editorUiAlias,
    values: [],
  });
  if (result.isError) {
    throw new Error(`create-data-type(${editorAlias}) failed: ${JSON.stringify(extractChainedResult(result))}`);
  }
  return extractChainedResult(result).id as string;
}

async function createRefDocType(contentPickerDataTypeId: string, mediaPickerDataTypeId: string): Promise<string> {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
  const result = await mcpClientManager.callTool("cms", "create-document-type", {
    name: `_Test Reference Type ${suffix}`,
    alias: `testReferenceType${suffix}`,
    icon: "icon-link",
    allowedAsRoot: true,
    properties: [
      { name: "Ref Page", alias: "refPage", dataTypeId: contentPickerDataTypeId, tab: "General" },
      { name: "Ref Media", alias: "refMedia", dataTypeId: mediaPickerDataTypeId, tab: "General" },
    ],
  });
  if (result.isError) {
    throw new Error(`create-document-type failed: ${JSON.stringify(extractChainedResult(result))}`);
  }
  return extractChainedResult(result).id as string;
}

export async function ensureReferenceFixture(): Promise<ReferenceFixture> {
  if (cached) return cached;

  const [contentPickerDataTypeId, mediaPickerDataTypeId] = await Promise.all([
    createDataType(
      `_Test Content Picker ${randomUUID().slice(0, 8)}`,
      "Umbraco.ContentPicker",
      "Umb.PropertyEditorUi.DocumentPicker",
    ),
    createDataType(
      `_Test Media Picker ${randomUUID().slice(0, 8)}`,
      "Umbraco.MediaPicker3",
      "Umb.PropertyEditorUi.MediaPicker",
    ),
  ]);

  const docTypeId = await createRefDocType(contentPickerDataTypeId, mediaPickerDataTypeId);

  cached = {
    docTypeId,
    contentPickerDataTypeId,
    mediaPickerDataTypeId,
    buildContentPickerValue: (targetId) => targetId,
    buildMediaPickerValue: (mediaId) => [
      { key: randomUUID(), mediaKey: mediaId, mediaTypeAlias: "Image", crops: [], focalPoint: null },
    ],
  };
  return cached;
}

export async function teardownReferenceFixture(): Promise<void> {
  if (!cached) return;
  const { docTypeId, contentPickerDataTypeId, mediaPickerDataTypeId } = cached;

  // Delete doc type first (data types can't be deleted while in use).
  try {
    await mcpClientManager.callTool("cms", "delete-document-type", { id: docTypeId });
  } catch {
    // Best-effort.
  }
  for (const id of [contentPickerDataTypeId, mediaPickerDataTypeId]) {
    try {
      await mcpClientManager.callTool("cms", "delete-data-type", { id });
    } catch {
      // Best-effort.
    }
  }
  cached = null;
}
