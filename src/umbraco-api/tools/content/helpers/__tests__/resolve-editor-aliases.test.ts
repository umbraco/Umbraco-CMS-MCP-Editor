/**
 * Unit tests for resolveEditorAliases's two distinct failure messages and its
 * fail-fast behaviour when resolveDocumentTypeProperties reports a composition
 * it couldn't load (failedCompositionIds). Stubs mcpClientManager.callTool
 * following the same pattern as cms-chain.test.ts / validate-document.test.ts —
 * these paths (a data type with no resolvable editorAlias, a composition fetch
 * failure) aren't practically constructible against a real Umbraco instance
 * (see resolve-document-type-properties.test.ts's header for why).
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { resolveEditorAliases } from "../resolve-editor-aliases.js";
import { mcpClientManager } from "../../../../mcp-client.js";
import { getResultText } from "@umbraco-cms/mcp-server-sdk/testing";
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

describe("resolveEditorAliases", () => {
  let spy: ReturnType<typeof jest.spyOn>;
  let docType: DocType;
  /** dataTypeId -> editorAlias. A dataTypeId with no entry here simulates "no resolvable editor alias". */
  let editorAliasesByDataTypeId: Map<string, string>;
  let failingCompositionIds: Set<string>;

  beforeEach(() => {
    editorAliasesByDataTypeId = new Map();
    failingCompositionIds = new Set();
    spy = jest.spyOn(mcpClientManager, "callTool").mockImplementation(async (_server: unknown, toolName: unknown, args?: unknown) => {
      if (toolName === "get-document-type-by-id") {
        const id = (args as { id: string }).id;
        if (failingCompositionIds.has(id)) {
          return { isError: true, content: [{ type: "text" as const, text: JSON.stringify({ type: "Error", status: 404 }) }] };
        }
        return { isError: false, structuredContent: docType, content: [] };
      }
      if (toolName === "get-data-types-by-id-array") {
        const ids = (args as { id: string[] }).id;
        const items = ids
          .filter((id) => editorAliasesByDataTypeId.has(id))
          .map((id) => ({
            id,
            editorAlias: editorAliasesByDataTypeId.get(id) as string,
            editorUiAlias: null,
            isDeletable: true,
            name: id,
            flags: [],
          }));
        return { isError: false, structuredContent: { items }, content: [] };
      }
      throw new Error(`unexpected tool call: ${String(toolName)}`);
    });
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it("resolves a known alias to its data type's editorAlias", async () => {
    docType = makeDocType({ id: "host", properties: [makeProperty("title")] });
    editorAliasesByDataTypeId.set("dt-title", "Umbraco.TextBox");

    const result = await resolveEditorAliases("host", [{ alias: "title", value: "Hello" }]);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.values).toEqual([
      { alias: "title", value: "Hello", culture: null, segment: null, editorAlias: "Umbraco.TextBox" },
    ]);
  });

  it("reports an alias that is a property but whose data type has no resolvable editorAlias, distinctly from an unknown alias", async () => {
    docType = makeDocType({ id: "host", properties: [makeProperty("title"), makeProperty("broken")] });
    editorAliasesByDataTypeId.set("dt-title", "Umbraco.TextBox");
    // dt-broken deliberately has no entry — simulates a data type lookup miss.

    const result = await resolveEditorAliases("host", [
      { alias: "title", value: "Hello" },
      { alias: "broken", value: "World" },
      { alias: "doesNotExist", value: "irrelevant" },
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error result");
    const message = getResultText(result.errorResult as any);
    expect(message).toContain("a property on this document type, but its data type has no resolvable editor alias: broken");
    expect(message).toContain("not a property on this document type, own or inherited via composition: doesNotExist");
    // A resolvable alias isn't swept into either failure bucket.
    expect(message).not.toMatch(/\btitle\b/);
  });

  it("fails fast — without calling get-data-types-by-id-array — when an alias doesn't resolve and a composition failed to load", async () => {
    docType = makeDocType({
      id: "host",
      compositions: [{ documentType: { id: "bad" }, compositionType: "Composition" }],
    });
    failingCompositionIds.add("bad");

    const result = await resolveEditorAliases("host", [{ alias: "maybeOnBad", value: "irrelevant" }]);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error result");
    const message = getResultText(result.errorResult as any);
    expect(message).toContain("maybeOnBad");
    expect(message).toContain("bad");
    expect(message).toMatch(/may actually be valid/);
    expect(spy).not.toHaveBeenCalledWith(expect.anything(), "get-data-types-by-id-array", expect.anything());
  });

  it("does NOT fail just because a composition failed to load, when every supplied alias resolves fine", async () => {
    docType = makeDocType({
      id: "host",
      properties: [makeProperty("title")],
      compositions: [{ documentType: { id: "bad" }, compositionType: "Composition" }],
    });
    editorAliasesByDataTypeId.set("dt-title", "Umbraco.TextBox");
    failingCompositionIds.add("bad");

    const result = await resolveEditorAliases("host", [{ alias: "title", value: "Hello" }]);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.values[0].editorAlias).toBe("Umbraco.TextBox");
  });
});
