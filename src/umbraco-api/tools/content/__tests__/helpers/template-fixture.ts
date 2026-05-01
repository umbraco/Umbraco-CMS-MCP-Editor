/**
 * Templated document-type fixture — provisions a doc type with two templates
 * registered as allowedTemplates (the first one is the default), using
 * TemplateBuilder for the templates themselves.
 *
 * The doc type creation isn't a single-entity builder concern (it spans
 * multiple entities), so it stays as a fixture wrapper. Each call returns a
 * fresh, isolated fixture (random suffix per call). Always teardown in
 * afterAll/afterEach — order matters: doc type first, then templates
 * (Umbraco refuses to delete a template while it's still referenced).
 */

import { randomUUID } from "node:crypto";
import { mcpClientManager } from "../../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { TemplateBuilder } from "./template-builder.js";
import { TemplateTestHelper } from "./template-test-helper.js";

export interface TemplateFixture {
  docTypeId: string;
  templateAId: string;
  templateAName: string;
  templateAAlias: string;
  templateBId: string;
  templateBName: string;
  templateBAlias: string;
}

export async function createTemplateFixture(): Promise<TemplateFixture> {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 10);

  const templateAName = `_Test Default Tpl ${suffix}`;
  const templateAAlias = `testDefaultTpl${suffix}`;
  const templateBName = `_Test Wide Tpl ${suffix}`;
  const templateBAlias = `testWideTpl${suffix}`;

  // Serial, not parallel — concurrent create-template calls have hit SQL
  // execution-timeout on the slower GitHub Actions runner. Templates are a
  // settings-level write that touches shared schema; serialising avoids
  // contention without measurably hurting test runtime.
  const tplA = await new TemplateBuilder().withName(templateAName).withAlias(templateAAlias).create();
  const tplB = await new TemplateBuilder().withName(templateBName).withAlias(templateBAlias).create();

  const createDocTypeResult = await mcpClientManager.callTool("cms", "create-document-type", {
    name: `_Test Templated Type ${suffix}`,
    alias: `testTemplatedType${suffix}`,
    icon: "icon-document",
    allowedAsRoot: true,
    compositions: [],
    allowedDocumentTypes: [],
    properties: [],
  });
  if (createDocTypeResult.isError) {
    await TemplateTestHelper.cleanupById(tplA.getId());
    await TemplateTestHelper.cleanupById(tplB.getId());
    throw new Error(`create-document-type failed: ${JSON.stringify(extractChainedResult(createDocTypeResult))}`);
  }
  const docTypeId = extractChainedResult(createDocTypeResult).id as string;

  const fetchResult = await mcpClientManager.callTool("cms", "get-document-type-by-id", { id: docTypeId });
  if (fetchResult.isError) {
    await mcpClientManager.callTool("cms", "delete-document-type", { id: docTypeId });
    await TemplateTestHelper.cleanupById(tplA.getId());
    await TemplateTestHelper.cleanupById(tplB.getId());
    throw new Error(`get-document-type-by-id failed: ${JSON.stringify(extractChainedResult(fetchResult))}`);
  }
  const docType = extractChainedResult(fetchResult);

  const updateResult = await mcpClientManager.callTool("cms", "update-document-type", {
    id: docTypeId,
    data: {
      ...docType,
      allowedTemplates: [{ id: tplA.getId() }, { id: tplB.getId() }],
      defaultTemplate: { id: tplA.getId() },
    },
  });
  if (updateResult.isError) {
    await mcpClientManager.callTool("cms", "delete-document-type", { id: docTypeId });
    await TemplateTestHelper.cleanupById(tplA.getId());
    await TemplateTestHelper.cleanupById(tplB.getId());
    throw new Error(`update-document-type failed: ${JSON.stringify(extractChainedResult(updateResult))}`);
  }

  return {
    docTypeId,
    templateAId: tplA.getId(),
    templateAName,
    templateAAlias,
    templateBId: tplB.getId(),
    templateBName,
    templateBAlias,
  };
}

export async function teardownTemplateFixture(fixture: TemplateFixture): Promise<void> {
  try {
    await mcpClientManager.callTool("cms", "delete-document-type", { id: fixture.docTypeId });
  } catch {
    // Best-effort.
  }
  await TemplateTestHelper.cleanupById(fixture.templateAId);
  await TemplateTestHelper.cleanupById(fixture.templateBId);
}
