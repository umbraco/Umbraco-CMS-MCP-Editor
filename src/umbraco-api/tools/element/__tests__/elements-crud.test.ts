import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { jest } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "@umbraco-cms/mcp-server-sdk/testing";
import { setupEditorElicitation } from "../../../../testing/setup-elicitation.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";
import { mcpClientManager } from "../../../mcp-client.js";
import { createElementTypeFixture, deleteElementTypeFixture } from "./helpers/element-type-fixture.js";
import getElementTool from "../get/get-element.js";
import createElementTool from "../post/create-element.js";
import editElementTool from "../put/edit-element.js";
import publishElementTool from "../post/publish-element.js";
import unpublishElementTool from "../post/unpublish-element.js";
import deleteElementTool from "../delete/delete-element.js";

/**
 * Full element lifecycle against a self-owned element type (created via
 * create-element-type, so it is a real element type with allowedInLibrary:true and
 * is therefore creatable). Exercises create -> get -> publish -> unpublish -> delete
 * through the editor tools, then removes the fixture type.
 */
describe("element CRUD lifecycle", () => {
  setupTestEnvironment();
  const elicitation = setupEditorElicitation(jest.fn as any);
  const extra = createMockRequestHandlerExtra();

  let typeId = "";
  let textPropertyAlias = "";

  beforeAll(async () => {
    const fixture = await createElementTypeFixture();
    typeId = fixture.id;
    textPropertyAlias = fixture.textPropertyAlias;
  }, 60000);

  afterAll(async () => {
    if (typeId) await deleteElementTypeFixture(typeId);
    elicitation.cleanup();
  }, 30000);

  it("create -> get -> publish -> unpublish -> delete", async () => {
    const name = `_crud-element-${Date.now()}`;
    let createdId = "";
    try {
      // create (at the Library root — the fixture type is allowedInLibrary)
      const createResult = await callTool(createElementTool, { name, elementTypeId: typeId }, extra);
      expect(createResult.isError).toBeFalsy();
      const created = getStructuredContent(createResult) as any;
      createdId = created.id;
      expect(createdId.length).toBeGreaterThan(0);
      expect(created.name).toBe(name);

      // get
      const getResult = await callTool(getElementTool, { id: createdId }, extra);
      expect(getResult.isError).toBeFalsy();
      const got = getStructuredContent(getResult) as any;
      expect(got.id).toBe(createdId);
      expect(got.elementType.id).toBe(typeId);

      // edit a property value
      const editResult = await callTool(editElementTool, { id: createdId, values: [{ alias: textPropertyAlias, value: "Hello from edit-element" }] }, extra);
      expect(editResult.isError).toBeFalsy();
      expect((getStructuredContent(editResult) as any).updatedFields).toContain(textPropertyAlias);
      const afterEdit = getStructuredContent(await callTool(getElementTool, { id: createdId }, extra)) as any;
      expect(afterEdit.values.find((v: any) => v.alias === textPropertyAlias)?.value).toBe("Hello from edit-element");

      // publish
      const publishResult = await callTool(publishElementTool, { id: createdId }, extra);
      expect(publishResult.isError).toBeFalsy();
      expect((getStructuredContent(publishResult) as any).id).toBe(createdId);

      // unpublish (confirmAction auto-accepted by the elicitation mock)
      const unpublishResult = await callTool(unpublishElementTool, { id: createdId }, extra);
      expect(unpublishResult.isError).toBeFalsy();
      expect((getStructuredContent(unpublishResult) as any).message).toMatch(/draft only/i);

      // delete -> recycle bin (confirmAction auto-accepted)
      const deleteResult = await callTool(deleteElementTool, { id: createdId }, extra);
      expect(deleteResult.isError).toBeFalsy();
      expect((getStructuredContent(deleteResult) as any).message).toMatch(/recycle bin/i);
      createdId = "";
    } finally {
      if (createdId) {
        await mcpClientManager.callTool("cms", "move-element-to-recycle-bin", { id: createdId }).catch(() => {});
      }
    }
  }, 90000);
});
