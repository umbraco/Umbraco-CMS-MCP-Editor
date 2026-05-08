/**
 * Template Builder + Test Helper Tests
 *
 * Verifies TemplateBuilder and TemplateTestHelper round-trip via chained
 * CMS tools against a real Umbraco instance.
 */

import { describe, it, expect, afterEach } from "@jest/globals";
import { setupTestEnvironment } from "@umbraco-cms/mcp-server-sdk/testing";
import { randomUUID } from "node:crypto";
import { TemplateBuilder } from "./template-builder.js";
import { TemplateTestHelper } from "./template-test-helper.js";

describe("TemplateBuilder + TemplateTestHelper", () => {
  setupTestEnvironment();

  const createdIds: string[] = [];

  afterEach(async () => {
    while (createdIds.length > 0) {
      const id = createdIds.pop()!;
      await TemplateTestHelper.cleanupById(id);
    }
  }, 30000);

  it("creates a template and reads it back via the helper", async () => {
    const suffix = randomUUID().replace(/-/g, "").slice(0, 8);
    const name = `_Test Builder Tpl ${suffix}`;
    const alias = `testBuilderTpl${suffix}`;

    const tpl = await new TemplateBuilder()
      .withName(name)
      .withAlias(alias)
      .create();
    createdIds.push(tpl.getId());

    expect(tpl.getId()).toBeTruthy();
    expect(tpl.getName()).toBe(name);
    expect(tpl.getAlias()).toBe(alias);

    const fetched = await TemplateTestHelper.getById(tpl.getId());
    expect(fetched).not.toBeNull();
    expect(fetched!.name).toBe(name);
    expect(fetched!.alias).toBe(alias);
  }, 30000);

  it("cleanupById removes the template (subsequent fetch returns null)", async () => {
    const suffix = randomUUID().replace(/-/g, "").slice(0, 8);
    const tpl = await new TemplateBuilder()
      .withName(`_Test Cleanup Tpl ${suffix}`)
      .withAlias(`testCleanupTpl${suffix}`)
      .create();

    await TemplateTestHelper.cleanupById(tpl.getId());

    const fetched = await TemplateTestHelper.getById(tpl.getId());
    expect(fetched).toBeNull();
  }, 30000);

  it("create() throws when name or alias is not set", async () => {
    await expect(new TemplateBuilder().withAlias("alias").create()).rejects.toThrow(/name is required/);
    await expect(new TemplateBuilder().withName("name").create()).rejects.toThrow(/alias is required/);
  });
});
