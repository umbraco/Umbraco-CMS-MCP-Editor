import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../../mcp-client.js";

/**
 * Creates a minimal, creatable element type for tests via the CMS `create-element-type`
 * tool (element-type creation is a settings-scope operation, so it goes via the CMS
 * chain directly, not an editor tool). Includes one Textstring property so edit-element
 * can be exercised.
 *
 * IMPORTANT: use `create-element-type`, NOT `create-document-type` — the latter drops
 * the `isElement` flag (creates a non-element type), and `create-element` then rejects
 * it with `NotAllowed`. An element type with `allowedInLibrary: true` is creatable at
 * the Library root.
 */
export interface ElementTypeFixture {
  id: string;
  alias: string;
  name: string;
  /** Alias of the Textstring property on the type — use with edit-element. */
  textPropertyAlias: string;
}

export async function createElementTypeFixture(): Promise<ElementTypeFixture> {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const alias = `smokeElementType${suffix}`;
  const name = `Smoke Element Type ${suffix}`;
  const textPropertyAlias = "title";

  // Resolve a Textstring data type id for the property.
  const dtResult = await mcpClientManager.callTool("cms", "find-data-type", { editorAlias: "Umbraco.TextBox" });
  const dataTypeId: string | undefined = (extractChainedResult(dtResult) as any)?.items?.[0]?.id;
  if (!dataTypeId) throw new Error("Could not resolve a Textstring (Umbraco.TextBox) data type id");

  const result = await mcpClientManager.callTool("cms", "create-element-type", {
    name,
    alias,
    icon: "icon-plugin",
    allowedAsRoot: true,
    allowedInLibrary: true,
    properties: [{ name: "Title", alias: textPropertyAlias, dataTypeId, group: "Content" }],
  });
  if ((result as { isError?: boolean }).isError) {
    throw new Error("Failed to create element type fixture: " + JSON.stringify((result as any).structuredContent ?? result));
  }
  const id: string = (result as any).structuredContent?.id;
  if (!id) throw new Error("create-element-type returned no id: " + JSON.stringify((result as any).structuredContent));
  return { id, alias, name, textPropertyAlias };
}

export async function deleteElementTypeFixture(id: string): Promise<void> {
  await mcpClientManager.callTool("cms", "delete-document-type", { id }).catch(() => {});
}
