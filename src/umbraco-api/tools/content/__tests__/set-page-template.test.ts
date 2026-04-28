import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  createElicitation,
  expectElicitationCancel,
  ContentBuilder,
  ContentTestHelper,
  extractChainedResult,
} from "./setup.js";
import { mcpClientManager } from "../../../mcp-client.js";
import setPageTemplateTool from "../put/set-page-template.js";
import {
  createTemplateFixture,
  teardownTemplateFixture,
  type TemplateFixture,
} from "./helpers/template-fixture.js";

const NON_EXISTENT_TEMPLATE_ID = "11111111-2222-3333-4444-555555555555";

const elicitation = createElicitation();

async function getCurrentTemplateId(pageId: string): Promise<string | null> {
  const result = await mcpClientManager.callTool("cms", "get-document-by-id", { id: pageId });
  if (result.isError) throw new Error("Failed to fetch page");
  const doc = extractChainedResult(result);
  return doc.template?.id ?? null;
}

describe("set-page-template", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let fixture: TemplateFixture;
  const createdIds: string[] = [];

  beforeAll(async () => {
    fixture = await createTemplateFixture();
  }, 120000);

  beforeEach(() => {
    elicitation.reset();
  });

  afterEach(async () => {
    while (createdIds.length > 0) {
      const id = createdIds.pop()!;
      await ContentTestHelper.cleanupById(id);
    }
  }, 60000);

  afterAll(async () => {
    elicitation.cleanup();
    await teardownTemplateFixture(fixture);
  }, 30000);

  it("switches the page template to another allowed template", async () => {
    const doc = await new ContentBuilder()
      .withName("_Test Switch Template Page")
      .withDocumentType(fixture.docTypeId)
      .create();
    createdIds.push(doc.getId());

    expect(await getCurrentTemplateId(doc.getId())).toBe(fixture.templateAId);

    const result = await setPageTemplateTool.handler(
      { id: doc.getId(), templateId: fixture.templateBId },
      extra,
    );
    expect(result.isError).toBeFalsy();

    const data = getStructuredContent(result) as any;
    expect(data.id).toBe(doc.getId());
    expect(data.oldTemplate).toEqual({
      id: fixture.templateAId,
      name: fixture.templateAName,
      alias: fixture.templateAAlias,
    });
    expect(data.newTemplate).toEqual({
      id: fixture.templateBId,
      name: fixture.templateBName,
      alias: fixture.templateBAlias,
    });
    expect(data.publishStatus).toBeDefined();
    expect(Array.isArray(data.publishStatus.variants)).toBe(true);

    expect(await getCurrentTemplateId(doc.getId())).toBe(fixture.templateBId);
  }, 60000);

  it("clears the template back to the document type default when templateId is null", async () => {
    const doc = await new ContentBuilder()
      .withName("_Test Clear Template Page")
      .withDocumentType(fixture.docTypeId)
      .create();
    createdIds.push(doc.getId());

    // Move it off the default first so clearing is observable.
    const switchResult = await setPageTemplateTool.handler(
      { id: doc.getId(), templateId: fixture.templateBId },
      extra,
    );
    expect(switchResult.isError).toBeFalsy();
    expect(await getCurrentTemplateId(doc.getId())).toBe(fixture.templateBId);

    const clearResult = await setPageTemplateTool.handler(
      { id: doc.getId(), templateId: null },
      extra,
    );
    expect(clearResult.isError).toBeFalsy();

    const data = getStructuredContent(clearResult) as any;
    expect(data.oldTemplate?.id).toBe(fixture.templateBId);
    expect(data.newTemplate).toBeNull();

    // Clearing sets template to null on the document; the document type's
    // default applies at render time but isn't written back to the document.
    expect(await getCurrentTemplateId(doc.getId())).toBeNull();
  }, 60000);

  it("rejects an unknown templateId and points the caller at list-page-templates", async () => {
    const doc = await new ContentBuilder()
      .withName("_Test Reject Template Page")
      .withDocumentType(fixture.docTypeId)
      .create();
    createdIds.push(doc.getId());

    const before = await getCurrentTemplateId(doc.getId());

    const result = await setPageTemplateTool.handler(
      { id: doc.getId(), templateId: NON_EXISTENT_TEMPLATE_ID },
      extra,
    );
    expect(result.isError).toBe(true);

    const errorText = JSON.stringify(result);
    expect(errorText).toContain("not in allowedTemplates");
    expect(errorText).toContain("list-page-templates");

    expect(await getCurrentTemplateId(doc.getId())).toBe(before);
  }, 60000);

  it("cancels the change when the user declines confirmation", async () => {
    const doc = await new ContentBuilder()
      .withName("_Test Cancel Template Page")
      .withDocumentType(fixture.docTypeId)
      .create();
    createdIds.push(doc.getId());

    elicitation.rejectAll();
    await expectElicitationCancel(() =>
      setPageTemplateTool.handler({ id: doc.getId(), templateId: fixture.templateBId }, extra),
    );

    expect(await getCurrentTemplateId(doc.getId())).toBe(fixture.templateAId);
  }, 60000);

});
