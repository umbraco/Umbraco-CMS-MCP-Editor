import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  createElicitation,
  expectElicitationCancel,
} from "./setup.js";
import deleteRedirectTool from "../delete/delete-redirect.js";
import listRedirectsTool from "../get/list-redirects.js";
import { ContentBuilder } from "../../content/__tests__/helpers/content-builder.js";
import { ContentTestHelper } from "../../content/__tests__/helpers/content-test-helper.js";
import { mcpClientManager } from "../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";

/** Check if a document is fully published (all variants published). */
function isPublished(doc: any): boolean {
  const variants = doc?.variants ?? [];
  return variants.length > 0 && variants.every((v: any) => v.state === "Published");
}

/** Publish the document if it's currently draft. */
async function ensurePublished(id: string): Promise<void> {
  const doc = await mcpClientManager.callTool("cms", "get-document-by-id", { id });
  if (doc.isError) return;
  const data = extractChainedResult(doc);
  if (isPublished(data)) return;

  await mcpClientManager.callTool("cms", "publish-document", {
    id,
    data: { publishSchedules: [{ culture: null }] },
  });
}

/** Find a root page and a document type allowed beneath it. Publishes the root if needed. */
async function findParentAndChildDocumentType(): Promise<{ parentId: string; documentTypeId: string } | null> {
  const rootResult = await mcpClientManager.callTool("cms", "get-document-root", {
    cursor: btoa(JSON.stringify({ s: 0, t: 20 })),
  });
  if (rootResult.isError) return null;
  const roots = extractChainedResult(rootResult)?.items ?? [];
  if (!roots.length) return null;

  const root = roots[0];
  await ensurePublished(root.id);

  const rootDoc = await mcpClientManager.callTool("cms", "get-document-by-id", { id: root.id });
  if (rootDoc.isError) return null;
  const rootDocData = extractChainedResult(rootDoc);

  // Prefer a child's document type (guaranteed allowed beneath this parent)
  const childrenResult = await mcpClientManager.callTool("cms", "get-document-children", {
    parentId: root.id,
    cursor: btoa(JSON.stringify({ s: 0, t: 5 })),
  });
  if (!childrenResult.isError) {
    const children = extractChainedResult(childrenResult)?.items ?? [];
    if (children.length > 0) {
      const childDoc = await mcpClientManager.callTool("cms", "get-document-by-id", { id: children[0].id });
      if (!childDoc.isError) {
        const doc = extractChainedResult(childDoc);
        if (doc?.documentType?.id) {
          return { parentId: root.id, documentTypeId: doc.documentType.id };
        }
      }
    }
  }

  // Fallback: use the root's own doc type (only works if doc type allows itself as a child)
  if (rootDocData?.documentType?.id) {
    return { parentId: root.id, documentTypeId: rootDocData.documentType.id };
  }

  return null;
}

const elicitation = createElicitation();

describe("delete-redirect", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  // Unique token so the generated redirect is easy to find via `filter`
  const uniqueToken = `testdelredir${Date.now().toString(36)}`;
  const ORIGINAL_NAME = uniqueToken;
  const RENAMED_NAME = `${uniqueToken}renamed`;

  let docId: string | null = null;
  let targetRedirectId: string | null = null;

  beforeAll(async () => {
    const parentAndType = await findParentAndChildDocumentType();
    if (!parentAndType) {
      throw new Error("Could not discover a parent page and document type for redirect test setup");
    }

    const builder = await new ContentBuilder()
      .withName(ORIGINAL_NAME)
      .withParent(parentAndType.parentId)
      .withDocumentType(parentAndType.documentTypeId)
      .create();
    docId = builder.getId();
    await builder.publish();

    // Rename and re-publish — Umbraco auto-creates a redirect from old URL to new URL
    await builder.updateName(RENAMED_NAME);
    await builder.publish();

    // Give Umbraco a moment to register the redirect
    await new Promise(r => setTimeout(r, 2000));

    const listResult = await listRedirectsTool.handler({ filter: uniqueToken }, extra);
    const items = (getStructuredContent(listResult) as any)?.items ?? [];
    const match = items.find((r: any) => r.originalUrl?.toLowerCase().includes(uniqueToken));
    if (!match) {
      throw new Error(
        `Expected an auto-generated redirect matching token "${uniqueToken}" after rename; ` +
        `list-redirects returned ${items.length} items. ` +
        `Redirect URL tracking may be disabled, or the document never had a published URL.`,
      );
    }
    targetRedirectId = match.id;
  }, 90000);

  afterAll(async () => {
    // Best-effort cleanup: redirect first (in case happy-path test failed), then the document
    if (targetRedirectId) {
      try {
        await mcpClientManager.callTool("cms", "delete-redirect", { id: targetRedirectId });
      } catch { /* best-effort */ }
    }
    if (docId) {
      try { await ContentTestHelper.cleanupById(docId); } catch { /* best-effort */ }
    }
    elicitation.cleanup();
  }, 60000);

  beforeEach(() => { elicitation.reset(); });

  it("should cancel delete-redirect when elicitation is rejected", async () => {
    const targetId = targetRedirectId ?? "00000000-0000-0000-0000-000000000001";

    elicitation.rejectAll();
    await expectElicitationCancel(() =>
      deleteRedirectTool.handler({ id: targetId }, extra),
    );
  }, 30000);

  it("should delete an existing redirect and remove it from the list", async () => {
    if (!targetRedirectId) throw new Error("Redirect was not set up");

    const result = await deleteRedirectTool.handler({ id: targetRedirectId }, extra);
    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.message).toContain("Deleted");
    expect(data.id).toBe(targetRedirectId);
    expect(data.originalUrl).not.toBe("Unknown");
    expect(data.originalUrl.length).toBeGreaterThan(0);
    expect(data.message).not.toContain('"Unknown"');

    // Verify it's gone — list by the same filter should not return it
    const listResult = await listRedirectsTool.handler({ filter: uniqueToken }, extra);
    const items = (getStructuredContent(listResult) as any)?.items ?? [];
    expect(items.find((r: any) => r.id === targetRedirectId)).toBeUndefined();

    // Clear so afterAll doesn't try to delete again
    targetRedirectId = null;
  }, 30000);
});
