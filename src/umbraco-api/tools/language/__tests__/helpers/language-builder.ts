/**
 * Language Builder — fluent API for creating test languages via chained CMS tools.
 *
 * Usage:
 *   const lang = await new LanguageBuilder()
 *     .withIsoCode("nb-NO")
 *     .withName("Norwegian Bokmål")
 *     .create();
 */

import { mcpClientManager } from "../../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";

export class LanguageBuilder {
  private isoCode: string | null = null;
  private name: string | null = null;
  private isDefault = false;
  private isMandatory = false;
  private fallbackIsoCode: string | null = null;
  private created = false;

  withIsoCode(isoCode: string): LanguageBuilder {
    this.isoCode = isoCode;
    return this;
  }

  withName(name: string): LanguageBuilder {
    this.name = name;
    return this;
  }

  withFallback(isoCode: string): LanguageBuilder {
    this.fallbackIsoCode = isoCode;
    return this;
  }

  /** Create the language via chained CMS tool */
  async create(): Promise<LanguageBuilder> {
    if (!this.isoCode) {
      throw new Error("Language must have an ISO code. Call withIsoCode() first.");
    }

    const args: Record<string, unknown> = {
      isoCode: this.isoCode,
      name: this.name ?? this.isoCode,
      isDefault: this.isDefault,
      isMandatory: this.isMandatory,
    };
    if (this.fallbackIsoCode) args.fallbackIsoCode = this.fallbackIsoCode;

    const result = await mcpClientManager.callTool("cms", "create-language", args);
    if (result.isError) {
      const errorData = extractChainedResult(result);
      throw new Error(`Failed to create language: ${JSON.stringify(errorData)}`);
    }

    this.created = true;
    return this;
  }

  /** Get the ISO code */
  getIsoCode(): string {
    if (!this.isoCode) {
      throw new Error("No ISO code set");
    }
    return this.isoCode;
  }

  /** Delete the created language */
  async delete(): Promise<void> {
    if (!this.isoCode || !this.created) {
      throw new Error("No language has been created yet. Cannot delete.");
    }
    await mcpClientManager.callTool("cms", "delete-language", { isoCode: this.isoCode });
  }
}
