/**
 * Extract data from a chained MCP tool result.
 *
 * Chained MCP tools may return data as structured content (if they define
 * an outputSchema) or as text content (JSON string in content[0].text).
 * This helper handles both cases.
 */
export function extractChainedResult(result: any): any {
  // Prefer structured content when available
  if (result.structuredContent !== undefined) {
    return result.structuredContent;
  }

  // Fall back to parsing text content
  const textContent = result.content?.find((c: any) => c.type === "text");
  if (textContent?.text) {
    try {
      return JSON.parse(textContent.text);
    } catch {
      return textContent.text;
    }
  }

  return undefined;
}
