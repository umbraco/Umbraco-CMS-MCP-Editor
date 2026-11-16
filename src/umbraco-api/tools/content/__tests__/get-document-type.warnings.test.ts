/**
 * Unit test for get-document-type's `warnings` field (Umbraco-CMS-MCP-Editor#200).
 *
 * resolveDocumentTypeProperties reports a composition that failed to load via
 * `failedCompositionIds`/`failedCompositionDetails` (#201), but a composition
 * fetch failure isn't practically constructible against a real Umbraco
 * instance (see resolve-document-type-properties.test.ts's header for why).
 * So, like that file and resolve-editor-aliases.test.ts, this stubs
 * mcpClientManager.callTool directly rather than running against a live CMS.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { mcpClientManager } from "../../../mcp-client.js";
import { getStructuredContent } from "@umbraco-cms/mcp-server-sdk/testing";
import getDocumentTypeTool from "../get/get-document-type.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";
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

describe("get-document-type warnings", () => {
  let spy: ReturnType<typeof jest.spyOn>;
  let byId: Map<string, DocType>;
  let failingIds: Set<string>;

  beforeEach(() => {
    byId = new Map();
    failingIds = new Set();
    spy = jest.spyOn(mcpClientManager, "callTool").mockImplementation(
      async (_server: unknown, toolName: unknown, args?: unknown) => {
        if (toolName !== "get-document-type-by-id") throw new Error(`unexpected tool call: ${String(toolName)}`);
        const id = (args as { id: string }).id;
        if (failingIds.has(id)) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: JSON.stringify({ type: "Error", title: "Not Found", status: 404, detail: "The specified document type was not found" }) }],
          };
        }
        const docType = byId.get(id);
        if (!docType) throw new Error(`test setup error: no doc type registered for id ${id}`);
        return { isError: false, structuredContent: docType, content: [] };
      },
    );
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it("adds a warning naming a composition that failed to load, without failing the read", async () => {
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

    const result = await callTool(getDocumentTypeTool, { id: "host" }, {});

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    // Still returns 200 with the properties it could resolve.
    expect(data.properties.map((p: any) => p.alias)).toContain("seoTitle");
    // ...and gains a warning identifying the composition that failed.
    expect(data.warnings).toHaveLength(1);
    expect(data.warnings[0]).toContain("bad");
    expect(data.warnings[0]).toContain("missing");
  });

  it("omits warnings entirely when no composition fails", async () => {
    byId.set("good", makeDocType({ id: "good", properties: [makeProperty("seoTitle")] }));
    byId.set(
      "host",
      makeDocType({
        id: "host",
        compositions: [{ documentType: { id: "good" }, compositionType: "Composition" }],
      }),
    );

    const result = await callTool(getDocumentTypeTool, { id: "host" }, {});

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.properties.map((p: any) => p.alias)).toContain("seoTitle");
    expect(data.warnings).toBeUndefined();
  });
});
