/**
 * Unit tests for resolveDocumentTypeProperties's recursive composition walk.
 *
 * A composition chain deeper than one level ("host composes A, A composes B")
 * can't be built against a real Umbraco instance — Umbraco's create-document-type
 * API rejects composing a document type that itself has compositions
 * ("Invalid composition", 400), confirmed empirically against a live instance
 * while reworking PR #207. So the recursive walk, its cycle guard, and
 * failedCompositionIds are tested here against a stubbed mcpClientManager
 * instead, following the same jest.spyOn(mcpClientManager, "callTool") pattern
 * as cms-chain.test.ts and validate-document.test.ts.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { resolveDocumentTypeProperties } from "../resolve-document-type-properties.js";
import { mcpClientManager } from "../../../../mcp-client.js";
import type { GetDocumentTypeByIdOutput } from "@umbraco-cms/mcp-dev/tool-types";

type DocType = GetDocumentTypeByIdOutput;

function makeDocType(overrides: Partial<DocType> & { id: string }): DocType {
  return {
    allowedTemplates: [],
    defaultTemplate: null,
    cleanup: { preventCleanup: false },
    allowedDocumentTypes: [],
    compositions: [],
    alias: overrides.id,
    name: overrides.id,
    icon: "icon-document",
    allowedAsRoot: false,
    variesByCulture: false,
    variesBySegment: false,
    isElement: false,
    allowedInLibrary: true,
    properties: [],
    containers: [],
    ...overrides,
  } as DocType;
}

function makeProperty(alias: string, dataTypeId = `dt-${alias}`) {
  return {
    id: `prop-${alias}`,
    sortOrder: 0,
    alias,
    name: alias,
    dataType: { id: dataTypeId },
    variesByCulture: false,
    variesBySegment: false,
    validation: { mandatory: false },
    appearance: { labelOnTop: false },
  } as DocType["properties"][number];
}

function asCallToolResult(docType: DocType) {
  return { isError: false, structuredContent: docType, content: [] };
}

function asErrorResult(detail = "The specified document type was not found") {
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify({ type: "Error", title: "Not Found", status: 404, detail }) }],
  };
}

describe("resolveDocumentTypeProperties", () => {
  let spy: ReturnType<typeof jest.spyOn>;
  let byId: Map<string, DocType>;
  let failingIds: Set<string>;

  beforeEach(() => {
    byId = new Map();
    failingIds = new Set();
    spy = jest.spyOn(mcpClientManager, "callTool").mockImplementation(async (_server: unknown, toolName: unknown, args?: unknown) => {
      if (toolName !== "get-document-type-by-id") throw new Error(`unexpected tool call: ${String(toolName)}`);
      const id = (args as { id: string }).id;
      if (failingIds.has(id)) return asErrorResult();
      const docType = byId.get(id);
      if (!docType) throw new Error(`test setup error: no doc type registered for id ${id}`);
      return asCallToolResult(docType);
    });
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it("walks a composition chain two levels deep (host -> A -> B)", async () => {
    byId.set("B", makeDocType({ id: "B", properties: [makeProperty("seoTitle")] }));
    byId.set("A", makeDocType({ id: "A", compositions: [{ documentType: { id: "B" }, compositionType: "Composition" }] }));
    byId.set("host", makeDocType({ id: "host", compositions: [{ documentType: { id: "A" }, compositionType: "Composition" }] }));

    const result = await resolveDocumentTypeProperties("host");

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.properties.map((p) => p.alias)).toContain("seoTitle");
    expect(result.failedCompositionIds).toEqual([]);
    // host, A, B each fetched exactly once.
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it("terminates and fetches each id once when compositions form a cycle", async () => {
    byId.set("A", makeDocType({ id: "A", compositions: [{ documentType: { id: "B" }, compositionType: "Composition" }] }));
    byId.set("B", makeDocType({ id: "B", compositions: [{ documentType: { id: "A" }, compositionType: "Composition" }] }));
    byId.set("host", makeDocType({ id: "host", compositions: [{ documentType: { id: "A" }, compositionType: "Composition" }] }));

    const result = await resolveDocumentTypeProperties("host");

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.failedCompositionIds).toEqual([]);
    // host, A, B — never refetched once visited, even though A and B reference each other.
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it("collects a failed composition id without failing the whole walk, and still merges sibling branches", async () => {
    byId.set("good", makeDocType({ id: "good", properties: [makeProperty("seoTitle")] }));
    byId.set(
      "host",
      makeDocType({
        id: "host",
        compositions: [
          { documentType: { id: "good" }, compositionType: "Composition" },
          { documentType: { id: "bad" }, compositionType: "Composition" },
        ],
      }),
    );
    failingIds.add("bad");

    const result = await resolveDocumentTypeProperties("host");

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.properties.map((p) => p.alias)).toContain("seoTitle");
    expect(result.failedCompositionIds).toEqual(["bad"]);
    // The real failure reason travels with the id, not just the bare id.
    expect(result.failedCompositionDetails).toEqual(["The specified document type was not found"]);
  });

  it("gives precedence to own properties, then the closer composition level, over a deeper one", async () => {
    // Diamond: host -> [A, B], A -> C, B -> C. "shared" collides at the C level
    // (both routes see the same value, so collision there is moot), but "direct"
    // collides between the host's own property and a property on A — own must win.
    byId.set("C", makeDocType({ id: "C", properties: [makeProperty("shared", "dt-from-C")] }));
    byId.set("A", makeDocType({
      id: "A",
      properties: [makeProperty("direct", "dt-from-A")],
      compositions: [{ documentType: { id: "C" }, compositionType: "Composition" }],
    }));
    byId.set("B", makeDocType({ id: "B", compositions: [{ documentType: { id: "C" }, compositionType: "Composition" }] }));
    byId.set("host", makeDocType({
      id: "host",
      properties: [makeProperty("direct", "dt-own")],
      compositions: [
        { documentType: { id: "A" }, compositionType: "Composition" },
        { documentType: { id: "B" }, compositionType: "Composition" },
      ],
    }));

    const result = await resolveDocumentTypeProperties("host");

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    const direct = result.properties.find((p) => p.alias === "direct");
    expect(direct?.dataType.id).toBe("dt-own");
    const shared = result.properties.find((p) => p.alias === "shared");
    expect(shared?.dataType.id).toBe("dt-from-C");
    // C is only fetched once even though both A and B lead to it.
    expect(spy).toHaveBeenCalledTimes(4);
  });
});
