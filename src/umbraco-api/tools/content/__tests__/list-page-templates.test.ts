import { describe, it, expect, beforeAll, afterAll, afterEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  ContentBuilder,
  ContentTestHelper,
} from "./setup.js";
import listPageTemplatesTool from "../get/list-page-templates.js";
import {
  createTemplateFixture,
  teardownTemplateFixture,
  type TemplateFixture,
} from "./helpers/template-fixture.js";

describe("list-page-templates", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let fixture: TemplateFixture;
  const createdIds: string[] = [];

  beforeAll(async () => {
    fixture = await createTemplateFixture();
  }, 120000);

  afterEach(async () => {
    while (createdIds.length > 0) {
      const id = createdIds.pop()!;
      await ContentTestHelper.cleanupById(id);
    }
  }, 60000);

  afterAll(async () => {
    await teardownTemplateFixture(fixture);
  }, 30000);

  it("returns current, default, and allowed templates with correct flags", async () => {
    const doc = await new ContentBuilder()
      .withName("_Test List Templates Page")
      .withDocumentType(fixture.docTypeId)
      .create();
    createdIds.push(doc.getId());

    const result = await listPageTemplatesTool.handler({ id: doc.getId() }, extra);
    expect(result.isError).toBeFalsy();

    const data = getStructuredContent(result) as any;
    expect(data.id).toBe(doc.getId());

    expect(data.default).toEqual({
      id: fixture.templateAId,
      name: fixture.templateAName,
      alias: fixture.templateAAlias,
    });

    // New documents inherit the default template, so current === default here.
    expect(data.current).toEqual(data.default);

    expect(data.allowed).toHaveLength(2);
    const a = data.allowed.find((t: any) => t.id === fixture.templateAId);
    const b = data.allowed.find((t: any) => t.id === fixture.templateBId);
    expect(a).toEqual({
      id: fixture.templateAId,
      name: fixture.templateAName,
      alias: fixture.templateAAlias,
      isDefault: true,
      isCurrent: true,
    });
    expect(b).toEqual({
      id: fixture.templateBId,
      name: fixture.templateBName,
      alias: fixture.templateBAlias,
      isDefault: false,
      isCurrent: false,
    });
  }, 60000);
});
