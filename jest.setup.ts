// Polyfill Symbol.dispose / Symbol.asyncDispose for Node.js versions that lack it.
// The Claude Agent SDK (using `Symbol.dispose`) requires these to be present.
(Symbol as any).dispose ??= Symbol("Symbol.dispose");
(Symbol as any).asyncDispose ??= Symbol("Symbol.asyncDispose");

// Must be set before any TLS connections
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import "dotenv/config";

// UMBRACO_AUTO_CONFIRM is set in some local .env files for audit campaigns
// (see docs/audits/mcp-live-validation/) to short-circuit elicitInput. Tests
// must drive elicitation themselves, so always clear it before any test runs.
delete process.env.UMBRACO_AUTO_CONFIRM;

// The human-in-the-loop gate blocks content publish/unpublish/delete by
// default. Tests exercise real publish/unpublish/delete behavior, so open the
// gate unconditionally here; tests that verify the gate itself flip this back
// with withHumanInTheLoopBlocking (src/testing/human-in-the-loop-test-helper.ts).
process.env.UMBRACO_HUMAN_IN_THE_LOOP = "false";

import https from "node:https";
import { Agent, setGlobalDispatcher, fetch as undiciFetch, FormData as undiciFormData, Request as undiciRequest } from "undici";

// Directly configure the global HTTPS agent to accept self-signed certs
// (process.env alone isn't sufficient in Jest's VM module context)
https.globalAgent.options.rejectUnauthorized = false;

// Node.js 22's built-in fetch (internal undici) ignores NODE_TLS_REJECT_UNAUTHORIZED
// and https.globalAgent inside Jest's --experimental-vm-modules sandbox.
// Override globalThis.fetch with the npm undici's fetch which respects our dispatcher.
const agent = new Agent({ connect: { rejectUnauthorized: false } });
setGlobalDispatcher(agent);
globalThis.fetch = undiciFetch as typeof globalThis.fetch;

// When CMS runs in-process (USE_IN_PROCESS_CMS), media uploads build a web
// FormData and pass it to globalThis.fetch. Since we swap fetch for npm undici's
// fetch above, FormData must come from the SAME undici realm — otherwise
// `body instanceof FormData` fails inside npm-undici's fetch, the body is not
// serialized as multipart, and Umbraco rejects the upload with
// "$.file: The File field is required". Align FormData with the overridden fetch.
globalThis.FormData = undiciFormData as typeof globalThis.FormData;

// Guard against that realm drift ever returning silently: a FormData body must
// serialize with a multipart content-type through undici's request builder
// (the same code path undici's fetch uses internally). If globalThis.FormData
// is ever from a different realm than the overridden fetch, this produces a
// non-multipart body and uploads fail with a cryptic 400 at runtime. Fail
// loudly here instead.
{
  const probe = new FormData();
  probe.append("file", new Blob([new Uint8Array([1, 2, 3])]), "probe.bin");
  const contentType =
    new undiciRequest("https://realm-check.invalid", { method: "POST", body: probe }).headers.get(
      "content-type",
    ) ?? "";
  if (!contentType.startsWith("multipart/form-data")) {
    throw new Error(
      `jest.setup: web-fetch realm mismatch — a FormData body serialized as "${contentType}" ` +
        "instead of multipart/form-data. globalThis.FormData must come from the same source " +
        "(npm 'undici') as the overridden globalThis.fetch.",
    );
  }
}

// Enable in-process CMS — bypass MCP subprocess spawning
process.env.USE_IN_PROCESS_CMS = "true";
