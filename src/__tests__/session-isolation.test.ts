import { getServerOptions, type HostedMcpServerOptions } from "@umbraco-cms/mcp-hosted";
import { checkSessionIsolation } from "@umbraco-cms/mcp-hosted/testing";
import {
  allModes as cmsModes,
  allModeNames as cmsModeNames,
  allSliceNames as cmsSliceNames,
  collections as cmsCollections,
} from "@umbraco-cms/mcp-dev/collections";
import { collections, allModes, allModeNames, allSliceNames } from "../collections.js";
import { SERVER_INSTRUCTIONS } from "../server-instructions.js";
import { mcpClientManager } from "../umbraco-api/mcp-client.js";
import { registerCmsChainedServer } from "../umbraco-api/cms-chained-server.js";

// Regression test for #210 (Umbraco-MCP-Base#383/#384/#385): one Worker
// isolate hosts many sessions, so a tool must never send one session's request
// to another session's site or with another session's token. Editor tools reach
// Umbraco through mcp-dev chained in-process, so this covers a direct chained
// read, a chained tree walk and a streaming media upload, from two sessions and
// from sessions started mid-call.
//
// Server options mirror src/worker.ts (minus Cloudflare's `tracing`, which only
// exists in workerd). `init` mirrors worker.ts init(): createPerRequestServer is
// done by the check itself, then the chained CMS server is registered. If
// init() ever sets up anything else per session, mirror it here too.
const serverOptions = getServerOptions({
  name: "umbraco-cms-editor-mcp-hosted",
  version: "0.0.0-test",
  instructions: SERVER_INSTRUCTIONS,
  collections,
  modeRegistry: allModes,
  allModeNames,
  allSliceNames,
  enableConsentToolSelection: false,
  chainedServers: [{
    name: "cms",
    displayName: "umbraco-cms-mcp",
    modeRegistry: cmsModes,
    collections: cmsCollections,
    allModeNames: cmsModeNames,
    allSliceNames: cmsSliceNames,
  }],
} as HostedMcpServerOptions);

const SOURCE_HOST = "source.isolation-check.invalid";
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';
const PAGE_ID = "11111111-1111-4111-8111-111111111111";

describe("hosted session isolation (#210)", () => {
  // The test setup swaps mcpClientManager.callTool for an in-process shim
  // (src/testing/in-process-cms.ts). This test needs the real in-process
  // connection worker.ts registers, so drop the instance override for its
  // duration and put it back afterwards.
  const shimmed = Object.prototype.hasOwnProperty.call(mcpClientManager, "callTool")
    ? mcpClientManager.callTool
    : undefined;
  beforeAll(() => {
    if (shimmed) delete (mcpClientManager as { callTool?: unknown }).callTool;
  });
  afterAll(() => {
    if (shimmed) mcpClientManager.callTool = shimmed;
  });

  it("keeps every session's Umbraco requests on its own site and token", async () => {
    const report = await checkSessionIsolation(serverOptions as never, {
      init: () => registerCmsChainedServer(),
      toolCalls: [
        { name: "get-page", arguments: { id: PAGE_ID } },
        { name: "list-document-types" },
        {
          name: "upload-media",
          arguments: {
            sourceType: "url",
            name: "isolation-check",
            mediaTypeName: "Vector Graphics (SVG)",
            fileUrl: `https://${SOURCE_HOST}/image.svg`,
          },
        },
      ],
      // Realistic responses so each tool gets past its first lookup and
      // reaches the calls that matter: with the default empty results
      // upload-media would stop at the media-type search, and the check would
      // prove nothing about the upload.
      respond: (request) => {
        if (request.host === SOURCE_HOST) {
          return new Response(SVG, {
            status: 200,
            headers: { "content-type": "image/svg+xml", "content-length": String(SVG.length) },
          });
        }
        const path = new URL(request.url).pathname;
        if (path.endsWith("/item/media-type/search")) {
          return Response.json({
            items: [{ id: "c4b1efcf-a9d5-41c4-9621-e9d273b52a9c", name: "Vector Graphics (SVG)" }],
            total: 1,
          });
        }
        if (path.endsWith("/tree/document-type/root")) {
          return Response.json({
            items: [{ id: "22222222-2222-4222-8222-222222222222", name: "Page", hasChildren: false, isFolder: false, isElement: false }],
            total: 1,
          });
        }
        return undefined;
      },
    });

    expect(report.toolsWithoutRequests).toEqual([]);
    expect(report.violations).toEqual([]);
    expect(report.ok).toBe(true);
  }, 120000);
});
