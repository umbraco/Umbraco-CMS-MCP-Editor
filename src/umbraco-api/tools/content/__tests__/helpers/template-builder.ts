/**
 * Template Builder — fluent API for creating test templates via chained CMS tools.
 *
 * Usage:
 *   const tpl = await new TemplateBuilder()
 *     .withName("Wide Layout")
 *     .withAlias("wideLayout")
 *     .create();
 *   const id = tpl.getId();
 *
 * Templates are an Umbraco "settings" concept and don't live under a parent
 * tree node — TemplateBuilder is intentionally simpler than ContentBuilder.
 */

import { mcpClientManager } from "../../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";

const DEFAULT_CONTENT = "@inherits Umbraco.Cms.Web.Common.Views.UmbracoViewPage";

export class TemplateBuilder {
  private name: string | null = null;
  private alias: string | null = null;
  private content: string = DEFAULT_CONTENT;
  private createdId: string | null = null;

  withName(name: string): TemplateBuilder {
    this.name = name;
    return this;
  }

  withAlias(alias: string): TemplateBuilder {
    this.alias = alias;
    return this;
  }

  withContent(content: string): TemplateBuilder {
    this.content = content;
    return this;
  }

  /** Create the template via chained CMS tool. */
  async create(): Promise<TemplateBuilder> {
    if (!this.name) throw new Error("Template name is required. Call withName() first.");
    if (!this.alias) throw new Error("Template alias is required. Call withAlias() first.");

    const result = await mcpClientManager.callTool("cms", "create-template", {
      name: this.name,
      alias: this.alias,
      content: this.content,
    });
    if (result.isError) {
      throw new Error(`Failed to create template: ${JSON.stringify(extractChainedResult(result))}`);
    }
    this.createdId = extractChainedResult(result).id as string;
    return this;
  }

  getId(): string {
    if (!this.createdId) throw new Error("No template has been created yet");
    return this.createdId;
  }

  getName(): string {
    if (!this.name) throw new Error("No template name set");
    return this.name;
  }

  getAlias(): string {
    if (!this.alias) throw new Error("No template alias set");
    return this.alias;
  }
}
