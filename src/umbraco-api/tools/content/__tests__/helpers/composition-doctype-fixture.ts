/**
 * Composition Doctype Fixture
 *
 * Creates two throwaway document types — a "composition" building block with
 * one own property, and a "host" document type that composes it with NO
 * properties of its own — so tests can exercise a value for a property that
 * is only reachable through a composition (Umbraco-CMS-MCP-Editor#201 for
 * create-page/create-and-publish-page, #208 for create-element: each used to
 * resolve such a value's editorAlias to "" and get an opaque 400 from Umbraco).
 * Pass `isElement` to provision element types instead of document types.
 *
 * Usage:
 *   const fixture = new CompositionDoctypeFixture();
 *   const { hostDocTypeId, propertyAlias } = await fixture.create();
 *   ...
 *   await fixture.cleanup();
 */

import { randomUUID } from "node:crypto";
import { mcpClientManager } from "../../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";

export interface CompositionDoctypeFixtureResult {
  /** ID of the host document type — composes compositionDocTypeId, has no own properties */
  hostDocTypeId: string;
  /** ID of the composition building-block document type */
  compositionDocTypeId: string;
  /** Alias of the Textstring property defined on the composition (not the host) */
  propertyAlias: string;
}

export class CompositionDoctypeFixture {
  private hostId: string | null = null;
  private compositionId: string | null = null;

  /**
   * @param isElement When true, both types are provisioned as element types
   * via `create-element-type` (host gets `allowedInLibrary: true`, required
   * for create-element to succeed against it) instead of `create-document-type`,
   * so the host can be used as an elementTypeId (e.g. for create-element).
   */
  async create(isElement = false): Promise<CompositionDoctypeFixtureResult> {
    const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
    const propertyAlias = "seoTitle";

    const dataTypeResult = await mcpClientManager.callTool("cms", "find-data-type", {
      editorAlias: "Umbraco.TextBox",
    });
    if (dataTypeResult.isError) {
      throw new Error(
        `CompositionDoctypeFixture: find-data-type failed: ${JSON.stringify(extractChainedResult(dataTypeResult))}`,
      );
    }
    const dataTypeId: string | undefined = extractChainedResult(dataTypeResult)?.items?.[0]?.id;
    if (!dataTypeId) {
      throw new Error("CompositionDoctypeFixture: no Textstring (Umbraco.TextBox) data type found on this Umbraco instance");
    }

    // The composition building block — one own property. Never used directly
    // as a page/element type, only composed into the host below.
    const compositionAlias = `testComposition${suffix}`;
    const compositionTool = isElement ? "create-element-type" : "create-document-type";
    const compositionArgs: Record<string, unknown> = {
      name: `_Test Composition ${suffix}`,
      alias: compositionAlias,
      icon: "icon-settings-alt",
      compositions: [],
      properties: [{ name: "SEO Title", alias: propertyAlias, dataTypeId, group: "SEO" }],
    };
    if (isElement) {
      compositionArgs.allowedInLibrary = false;
    } else {
      compositionArgs.allowedAsRoot = false;
      compositionArgs.allowedDocumentTypes = [];
    }
    const compositionResult = await mcpClientManager.callTool("cms", compositionTool, compositionArgs);
    if (compositionResult.isError) {
      throw new Error(
        `CompositionDoctypeFixture: ${compositionTool} (composition) failed: ${JSON.stringify(extractChainedResult(compositionResult))}`,
      );
    }
    const compositionId: string | undefined = extractChainedResult(compositionResult)?.id;
    if (!compositionId) {
      throw new Error(`CompositionDoctypeFixture: ${compositionTool} (composition) did not return an id`);
    }
    this.compositionId = compositionId;

    // The host — composes the above and has no properties of its own, so any
    // editorAlias resolution for `propertyAlias` must come from the
    // composition walk, not the host's own `properties` array.
    const hostAlias = `testCompositionHost${suffix}`;
    const hostTool = isElement ? "create-element-type" : "create-document-type";
    const hostArgs: Record<string, unknown> = {
      name: `_Test Composition Host ${suffix}`,
      alias: hostAlias,
      icon: "icon-document",
      compositions: [compositionId],
      properties: [],
    };
    if (isElement) {
      hostArgs.allowedInLibrary = true;
    } else {
      hostArgs.allowedAsRoot = true;
      hostArgs.allowedDocumentTypes = [];
    }
    const hostResult = await mcpClientManager.callTool("cms", hostTool, hostArgs);
    if (hostResult.isError) {
      await this.cleanup();
      throw new Error(
        `CompositionDoctypeFixture: ${hostTool} (host) failed: ${JSON.stringify(extractChainedResult(hostResult))}`,
      );
    }
    const hostId: string | undefined = extractChainedResult(hostResult)?.id;
    if (!hostId) {
      await this.cleanup();
      throw new Error(`CompositionDoctypeFixture: ${hostTool} (host) did not return an id`);
    }
    this.hostId = hostId;

    return { hostDocTypeId: hostId, compositionDocTypeId: compositionId, propertyAlias };
  }

  /** Deletes both document types created by this fixture (host first — it depends on the composition). */
  async cleanup(): Promise<void> {
    if (this.hostId) {
      const id = this.hostId;
      this.hostId = null;
      const result = await mcpClientManager.callTool("cms", "delete-document-type", { id }).catch((err) => ({
        isError: true,
        error: err,
      }));
      if (result.isError) {
        console.warn(
          `CompositionDoctypeFixture: cleanup failed to delete host doc type ${id}: ${JSON.stringify(extractChainedResult(result) ?? result)}`,
        );
      }
    }
    if (this.compositionId) {
      const id = this.compositionId;
      this.compositionId = null;
      const result = await mcpClientManager.callTool("cms", "delete-document-type", { id }).catch((err) => ({
        isError: true,
        error: err,
      }));
      if (result.isError) {
        console.warn(
          `CompositionDoctypeFixture: cleanup failed to delete composition doc type ${id}: ${JSON.stringify(extractChainedResult(result) ?? result)}`,
        );
      }
    }
  }
}
