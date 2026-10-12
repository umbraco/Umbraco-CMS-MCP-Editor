import { runWithRequestContext, UMBRACO_VERSION_CONTEXT_KEY } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../umbraco-api/mcp-client.js";
import { registerCmsChainedServer } from "../umbraco-api/cms-chained-server.js";

// Regression test for #197 / #210 on the v17 line. mcp-dev only registers its
// atomic create-and-publish-document / update-and-publish-document on Umbraco
// 17.6+. On hosted, the chained in-process CMS server (registered exactly as
// worker.ts init() does) must see each request's own Umbraco version, so a 17.6
// site gets the atomic tools and a 17.5 site doesn't, in the same isolate.
const ATOMIC = ["create-and-publish-document", "update-and-publish-document"] as const;

describe("chained CMS tools follow the request's Umbraco version (#197)", () => {
  // The test setup replaces methods on the mcpClientManager instance with an
  // in-process shim (src/testing/in-process-cms.ts). This test needs the real
  // in-process connection worker.ts registers, so remove every instance
  // override for its duration and put them back afterwards.
  const shimmed = new Map<string, unknown>();
  beforeAll(() => {
    for (const key of ["callTool", "listTools"] as const) {
      if (Object.prototype.hasOwnProperty.call(mcpClientManager, key)) {
        shimmed.set(key, (mcpClientManager as unknown as Record<string, unknown>)[key]);
        delete (mcpClientManager as unknown as Record<string, unknown>)[key];
      }
    }
    registerCmsChainedServer();
  });
  afterAll(() => {
    for (const [key, fn] of shimmed) (mcpClientManager as unknown as Record<string, unknown>)[key] = fn;
  });

  const listedFor = (version: string) =>
    runWithRequestContext({ [UMBRACO_VERSION_CONTEXT_KEY]: version }, async () => {
      const { tools } = await mcpClientManager.listTools("cms");
      return tools.map((t) => t.name);
    });

  it("lists the atomic tools for a 17.6 request", async () => {
    const names = await listedFor("17.6.0");
    for (const tool of ATOMIC) expect(names).toContain(tool);
  });

  it("omits them for a 17.5 request in the same isolate", async () => {
    const names = await listedFor("17.5.3");
    for (const tool of ATOMIC) expect(names).not.toContain(tool);
  });
});
