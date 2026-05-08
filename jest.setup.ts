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

import https from "node:https";
import { Agent, setGlobalDispatcher, fetch as undiciFetch } from "undici";

// Directly configure the global HTTPS agent to accept self-signed certs
// (process.env alone isn't sufficient in Jest's VM module context)
https.globalAgent.options.rejectUnauthorized = false;

// Node.js 22's built-in fetch (internal undici) ignores NODE_TLS_REJECT_UNAUTHORIZED
// and https.globalAgent inside Jest's --experimental-vm-modules sandbox.
// Override globalThis.fetch with the npm undici's fetch which respects our dispatcher.
const agent = new Agent({ connect: { rejectUnauthorized: false } });
setGlobalDispatcher(agent);
globalThis.fetch = undiciFetch as typeof globalThis.fetch;

// Enable in-process CMS — bypass MCP subprocess spawning
process.env.USE_IN_PROCESS_CMS = "true";
