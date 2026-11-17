import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "./setup.js";
import { ContentBuilder } from "../../content/__tests__/helpers/content-builder.js";
import { ContentTestHelper } from "../../content/__tests__/helpers/content-test-helper.js";
import { initContentTestState } from "../../content/__tests__/setup.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";
import { mcpClientManager } from "../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import reportSiteTreeSummaryTool, {
  _setTraversalBudgetForTests,
  _resetTraversalBudgetForTests,
} from "../get/report-site-tree-summary.js";

const TEST_PAGE_NAME = "_Test Site Tree Summary";

function findNode(nodes: any[], id: string): any {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNode(node.children ?? [], id);
    if (found) return found;
  }
  return undefined;
}

/**
 * Discover a document-type pair that can actually be nested two levels deep
 * under the root content item used by the shared test state — the demo
 * site's single-purpose "page" content type (`testDocumentTypeId`) allows no
 * children at all, so tests that need a real two-level tree (parallel
 * sibling fetch, truncation) can't just reuse it for both levels. Walks the
 * root's own allowed-children list, and for each candidate checks whether
 * *it* in turn allows some leaf type as a child. Cached per test run.
 */
let cachedNestablePair: { containerTypeId: string; leafTypeId: string } | null = null;

async function resolveNestableDocTypePair(testPageId: string): Promise<{ containerTypeId: string; leafTypeId: string }> {
  if (cachedNestablePair) return cachedNestablePair;

  const rootDocResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id: testPageId });
  const rootDoc = extractChainedResult(rootDocResult) as any;
  const rootTypeId: string | undefined = rootDoc?.documentType?.id;
  if (!rootTypeId) {
    throw new Error("resolveNestableDocTypePair: could not resolve the root content item's document type");
  }

  const allowedUnderRootResult = await mcpClientManager.callTool("cms", "get-document-type-allowed-children", {
    id: rootTypeId,
  });
  const candidates = (extractChainedResult(allowedUnderRootResult) as any)?.items ?? [];

  for (const candidate of candidates) {
    const allowedUnderCandidateResult = await mcpClientManager.callTool("cms", "get-document-type-allowed-children", {
      id: candidate.id,
    });
    const leafItems = (extractChainedResult(allowedUnderCandidateResult) as any)?.items ?? [];
    if (leafItems.length > 0) {
      cachedNestablePair = { containerTypeId: candidate.id as string, leafTypeId: leafItems[0].id as string };
      return cachedNestablePair;
    }
  }

  throw new Error(
    "resolveNestableDocTypePair: no two-level nestable document type pair found under the root content item's type — the demo site's content-type tree may have changed.",
  );
}

describe("report-site-tree-summary", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let createdId: string | undefined;
  let publishedId: string | undefined;
  let testPageId: string;

  beforeAll(async () => {
    const state = await initContentTestState(extra);
    testPageId = state.testPageId;

    const doc = await new ContentBuilder()
      .withName(TEST_PAGE_NAME)
      .withDocumentType(state.testDocumentTypeId)
      .withParent(state.testPageId)
      .create();
    createdId = doc.getId();

    const publishedDoc = await new ContentBuilder()
      .withName("_Test Site Tree Summary Published")
      .withDocumentType(state.testDocumentTypeId)
      .withParent(state.testPageId)
      .create();
    await publishedDoc.publish();
    publishedId = publishedDoc.getId();
  }, 60000);

  afterAll(async () => {
    if (createdId) await ContentTestHelper.cleanupById(createdId);
    if (publishedId) await ContentTestHelper.cleanupById(publishedId);
  }, 30000);

  it("should return tree structure with pages", async () => {
    const result = await callTool(reportSiteTreeSummaryTool, { parentId: undefined, maxDepth: 3 }, extra);

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(Array.isArray(data.tree)).toBe(true);
    expect(data.totalPages).toBeGreaterThan(0);
    expect(typeof data.pagesPerLevel).toBe("object");
    expect(typeof data.maxDepthFound).toBe("number");
    expect(typeof data.truncated).toBe("boolean");

    if (data.tree.length > 0) {
      expect(data.tree[0]).toHaveProperty("id");
      expect(data.tree[0]).toHaveProperty("name");
      expect(data.tree[0]).toHaveProperty("depth");
      expect(data.tree[0]).toHaveProperty("childCount");
    }
  }, 30000);

  it("reports '' for a draft-only page and a real URL for a published page (regression for #233)", async () => {
    const result = await callTool(reportSiteTreeSummaryTool, { parentId: testPageId, maxDepth: 1 }, extra);

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;

    const draftNode = findNode(data.tree, createdId!);
    const publishedNode = findNode(data.tree, publishedId!);

    expect(draftNode?.url).toBe("");
    expect(typeof publishedNode?.url).toBe("string");
    expect(publishedNode?.url.length).toBeGreaterThan(0);
  }, 30000);

  describe("parallel sibling subtree fetch (#306)", () => {
    const childIds: string[] = [];
    const grandchildIds: string[] = [];

    beforeAll(async () => {
      const state = await initContentTestState(extra);
      const { containerTypeId, leafTypeId } = await resolveNestableDocTypePair(state.testPageId);

      // Three siblings directly under the shared root, each of a type that
      // allows one child of its own — giving a real two-level tree without
      // a dedicated wrapper root (the demo site's "page" type allows no
      // children at all, so it can't be nested two levels deep).
      for (const label of ["A", "B", "C"]) {
        const child = await new ContentBuilder()
          .withName(`_Test STS Concurrency ${label}`)
          .withDocumentType(containerTypeId)
          .withParent(state.testPageId)
          .create();
        childIds.push(child.getId());

        const grandchild = await new ContentBuilder()
          .withName(`_Test STS Concurrency ${label}1`)
          .withDocumentType(leafTypeId)
          .withParent(child.getId())
          .create();
        grandchildIds.push(grandchild.getId());
      }
    }, 60000);

    afterAll(async () => {
      for (const id of [...grandchildIds, ...childIds]) {
        await ContentTestHelper.cleanupById(id);
      }
    }, 30000);

    it("returns the correct tree shape when sibling subtrees are fetched in parallel", async () => {
      const result = await callTool(reportSiteTreeSummaryTool, { parentId: testPageId, maxDepth: 2 }, extra);

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;

      // All three siblings must be present, each with exactly its own child
      // nested underneath — parallel fetch must not drop, duplicate, or
      // cross-wire sibling subtrees. Asserted by ID rather than by total
      // counts, since testPageId may carry other pre-existing content.
      for (let i = 0; i < childIds.length; i++) {
        const childNode = findNode(data.tree, childIds[i]);
        expect(childNode).toBeDefined();
        expect(childNode.depth).toBe(1);
        expect(childNode.children).toHaveLength(1);
        expect(childNode.children[0].id).toBe(grandchildIds[i]);
        expect(childNode.children[0].depth).toBe(2);
      }
    }, 30000);

    it("skips URL lookups entirely when includeUrls is false", async () => {
      const result = await callTool(
        reportSiteTreeSummaryTool,
        { parentId: testPageId, maxDepth: 2, includeUrls: false },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;

      const createdChild = findNode(data.tree, childIds[0]);
      expect(createdChild).toBeDefined();
      expect(createdChild.url).toBe("");
      expect(createdChild.children[0].url).toBe("");
    }, 30000);
  });

  describe("truncation budget (#306)", () => {
    let truncationRootId: string | undefined;
    const childIds: string[] = [];

    beforeAll(async () => {
      const state = await initContentTestState(extra);
      const { containerTypeId, leafTypeId } = await resolveNestableDocTypePair(state.testPageId);

      // A dedicated, brand-new container node so it starts with *zero*
      // children — unlike testPageId, which may carry other content —
      // making the node-budget count below fully deterministic.
      const root = await new ContentBuilder()
        .withName("_Test STS Truncation Root")
        .withDocumentType(containerTypeId)
        .withParent(state.testPageId)
        .create();
      truncationRootId = root.getId();

      for (const label of ["A", "B", "C"]) {
        const child = await new ContentBuilder()
          .withName(`_Test STS Truncation ${label}`)
          .withDocumentType(leafTypeId)
          .withParent(truncationRootId)
          .create();
        childIds.push(child.getId());
      }
    }, 60000);

    afterAll(async () => {
      _resetTraversalBudgetForTests();
      for (const id of childIds) {
        await ContentTestHelper.cleanupById(id);
      }
      if (truncationRootId) await ContentTestHelper.cleanupById(truncationRootId);
    }, 30000);

    it("stops early and reports truncated: true once the node budget is hit", async () => {
      // Override the production 500-node budget so this is deterministic
      // with 3 real pages instead of requiring 500.
      _setTraversalBudgetForTests({ nodeBudget: 2 });
      try {
        const result = await callTool(
          reportSiteTreeSummaryTool,
          { parentId: truncationRootId, maxDepth: 1 },
          extra,
        );

        expect(result.isError).toBeFalsy();
        const data = getStructuredContent(result) as any;

        expect(data.truncated).toBe(true);
        expect(data.totalPages).toBe(2);
        expect(data.tree).toHaveLength(2);
      } finally {
        _resetTraversalBudgetForTests();
      }
    }, 30000);

    it("does not truncate when all nodes fit inside the budget", async () => {
      _setTraversalBudgetForTests({ nodeBudget: 500 });
      try {
        const result = await callTool(
          reportSiteTreeSummaryTool,
          { parentId: truncationRootId, maxDepth: 1 },
          extra,
        );

        expect(result.isError).toBeFalsy();
        const data = getStructuredContent(result) as any;

        expect(data.truncated).toBe(false);
        expect(data.totalPages).toBe(3);
      } finally {
        _resetTraversalBudgetForTests();
      }
    }, 30000);
  });
});
