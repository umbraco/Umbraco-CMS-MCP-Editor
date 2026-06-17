import { describe, it, expect, afterEach } from "@jest/globals";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { setupTestEnvironment, MediaManagementTestHelper } from "./setup.js";
import { mcpServers } from "../../../../config/mcp-servers.js";

/**
 * Transport smoke test for media upload.
 *
 * The rest of the suite runs the chained CMS tools IN-PROCESS
 * (USE_IN_PROCESS_CMS) with an overridden global fetch/FormData. That path
 * diverges from how the local stdio deployment actually runs — it spawns the
 * `@umbraco-cms/mcp-dev` binary as a real subprocess that uses the runtime's
 * native fetch/FormData. A 17.4.x upload regression hid in exactly that gap:
 * the in-process path failed only because of a fetch/FormData realm mismatch
 * in the test harness, while the real subprocess upload worked fine.
 *
 * This test drives `create-media` through the REAL subprocess transport, using
 * the production spawn config (`mcpServers`), so an actual upload regression in
 * the chained CMS server can't pass unnoticed. It deliberately does NOT use the
 * in-process path. Cleanup uses the in-process helper — that's not what we're
 * exercising here.
 */

// Minimal 1x1 transparent PNG
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const NAME = "_Test Upload Media Subprocess Smoke";

describe("upload-media (real subprocess transport)", () => {
  setupTestEnvironment();

  afterEach(async () => {
    await MediaManagementTestHelper.cleanupByName(NAME);
  }, 30000);

  it("uploads a base64 image through the real CMS stdio subprocess", async () => {
    const cms = mcpServers.find((s) => s.name === "cms");
    if (!cms || !("command" in cms)) {
      throw new Error("cms subprocess chained server config must be present in mcpServers");
    }

    const transport = new StdioClientTransport({
      command: cms.command,
      args: cms.args ?? [],
      // Mirror StdioConnection.connect: merge process.env with the server's env.
      env: { ...process.env, ...(cms.env ?? {}) } as Record<string, string>,
    });
    const client = new Client({ name: "upload-media-smoke", version: "1.0.0" });
    await client.connect(transport);

    try {
      const result = (await client.callTool({
        name: "create-media",
        arguments: {
          sourceType: "base64",
          name: NAME,
          mediaTypeName: "Image",
          fileAsBase64: TINY_PNG_BASE64,
        },
      })) as {
        isError?: boolean;
        content?: Array<{ type?: string; text?: string }>;
        structuredContent?: { id?: string; name?: string };
      };

      // Success may arrive as structuredContent or as a text content item,
      // depending on the chained server's result mode. Accept either.
      const text = result.content?.find((c) => c.type === "text")?.text ?? "";
      const raw = `${text} ${JSON.stringify(result.structuredContent ?? {})}`;
      // The realm/transport class of bug surfaces as this exact server error.
      expect(raw).not.toContain("The File field is required");
      if (result.isError) {
        throw new Error(`create-media failed via subprocess: ${raw}`);
      }

      const data = result.structuredContent ?? (text ? (JSON.parse(text) as { id?: string; name?: string }) : {});
      expect(data.id).toBeTruthy();
      expect(data.name).toBe(NAME);
    } finally {
      await client.close();
    }
  }, 60000);
});
