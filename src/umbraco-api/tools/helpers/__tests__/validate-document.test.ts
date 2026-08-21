/**
 * Unit tests for validate-document.ts.
 *
 * The helper relies on chainCms surfacing the inner ProblemDetails directly
 * under structuredContent (single-layer shape, post chainCms-unwrap fix). These
 * tests stub mcpClientManager.callTool with the canonical shapes and pin the
 * parser's behaviour: real property-level errors come through, the JSON-path
 * keys get resolved back to property aliases via the request payload, and
 * unparseable responses degrade to a `__document__`-keyed entry rather than
 * throwing.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { validateDocumentState } from "../validate-document.js";
import { mcpClientManager } from "../../../mcp-client.js";

const FAKE_DOC = {
  id: "00000000-0000-0000-0000-000000000001",
  documentType: { id: "00000000-0000-0000-0000-000000000002", icon: "icon-document" },
  template: { id: "00000000-0000-0000-0000-000000000003" },
  values: [
    { alias: "pageTitle", value: "", culture: null, segment: null, editorAlias: "Umbraco.TextBox" },
    { alias: "metaDescription", value: "ok", culture: null, segment: null, editorAlias: "Umbraco.TextBox" },
  ],
  variants: [
    {
      culture: null,
      segment: null,
      name: "Test Page",
      createDate: "2026-01-01T00:00:00Z",
      updateDate: "2026-01-01T00:00:00Z",
      state: "Draft" as const,
      publishDate: null,
      scheduledPublishDate: null,
      scheduledUnpublishDate: null,
      id: "00000000-0000-0000-0000-000000000004",
      flags: [],
    },
  ],
  flags: [],
  isTrashed: false,
};

describe("validateDocumentState", () => {
  let spy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    spy = jest.spyOn(mcpClientManager, "callTool");
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it("returns valid:true when validate-document succeeds", async () => {
    spy.mockImplementation(async (_server: string, toolName: string) => {
      if (toolName === "get-document-ancestors") {
        return {
          isError: false,
          structuredContent: { items: [{ id: FAKE_DOC.id, parent: null }] },
          content: [],
        };
      }
      if (toolName === "validate-document") {
        return { isError: false, structuredContent: {}, content: [] };
      }
      throw new Error(`unexpected tool call: ${toolName}`);
    });

    const result = await validateDocumentState(FAKE_DOC.id, FAKE_DOC as any);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("passes the document's real parent (not a hardcoded null) to validate-document", async () => {
    // Cms 17.6+ enforces "allowed at root" placement rules on whatever `parent`
    // is sent — a non-root document validated with parent: null now fails with
    // a generic NotAllowed, so the helper must look up the real parent first.
    const PARENT_ID = "00000000-0000-0000-0000-0000000000ff";
    let capturedParent: unknown;

    spy.mockImplementation(async (_server: string, toolName: string, args: any) => {
      if (toolName === "get-document-ancestors") {
        return {
          isError: false,
          structuredContent: { items: [{ id: FAKE_DOC.id, parent: { id: PARENT_ID } }] },
          content: [],
        };
      }
      if (toolName === "validate-document") {
        capturedParent = args.parent;
        return { isError: false, structuredContent: {}, content: [] };
      }
      throw new Error(`unexpected tool call: ${toolName}`);
    });

    await validateDocumentState(FAKE_DOC.id, FAKE_DOC as any);

    expect(capturedParent).toEqual({ id: PARENT_ID });
  });

  it("resolves JSON-path error keys back to property aliases via the request payload", async () => {
    const problemDetails = {
      type: "Error",
      title: "Validation failed",
      status: 400,
      detail: "One or more properties did not pass validation",
      // ASP.NET Core's ValidationProblemDetails shape, keyed by JSON path into the request body.
      errors: {
        "$.values[0].value": ["The Page Title is required"],
        "$.values[1].value.length": ["Must be at most 160 characters"],
      },
    };
    // Post-chainCms-unwrap: ProblemDetails sits directly under structuredContent.
    spy.mockImplementation(async (_server: string, toolName: string) => {
      if (toolName === "get-document-ancestors") {
        return {
          isError: false,
          structuredContent: { items: [{ id: FAKE_DOC.id, parent: null }] },
          content: [],
        };
      }
      if (toolName === "validate-document") {
        return {
          isError: true,
          structuredContent: problemDetails,
          content: [{ type: "text", text: JSON.stringify(problemDetails) }],
        };
      }
      throw new Error(`unexpected tool call: ${toolName}`);
    });

    const result = await validateDocumentState(FAKE_DOC.id, FAKE_DOC as any);

    expect(result.valid).toBe(false);
    // The parser maps $.values[0] back to "pageTitle" (index 0 in the values array)
    // and $.values[1].value.length back to "metaDescription.length".
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          propertyAlias: "pageTitle",
          message: "The Page Title is required",
        }),
        expect.objectContaining({
          propertyAlias: "metaDescription.length",
          message: "Must be at most 160 characters",
        }),
      ]),
    );
    // No __document__ fallback when the parser can resolve at least one alias.
    expect(result.errors.find((e) => e.propertyAlias === "__document__")).toBeUndefined();
  });

  it("falls back to __document__ when the ProblemDetails has no errors map", async () => {
    const problemDetails = {
      type: "Error",
      title: "Document not found",
      status: 404,
      detail: "The document could not be found",
    };
    spy.mockImplementation(async (_server: string, toolName: string) => {
      if (toolName === "get-document-ancestors") {
        return {
          isError: false,
          structuredContent: { items: [{ id: FAKE_DOC.id, parent: null }] },
          content: [],
        };
      }
      if (toolName === "validate-document") {
        return {
          isError: true,
          structuredContent: problemDetails,
          content: [{ type: "text", text: JSON.stringify(problemDetails) }],
        };
      }
      throw new Error(`unexpected tool call: ${toolName}`);
    });

    const result = await validateDocumentState(FAKE_DOC.id, FAKE_DOC as any);

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].propertyAlias).toBe("__document__");
    expect(result.errors[0].message).toBe("The document could not be found");
  });
});
