// Audit harness for #38's new tools (add-blocklist-block, add-blockgrid-block,
// add-rte-block) and the paired edit-block change. Spawns the same dist/index.js
// the live MCP host runs, drives it over JSON-RPC/stdio, asserts each tool's
// response shape and side-effect end-to-end. The whole point: catch wire-layer
// failures (schema mismatches, transport masking) that pure-handler tests miss.
//
// Usage: node scripts/audit-block-tools.mjs
//
// Reads .demo-site-port for the Umbraco port; .env for credentials.

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const port = readFileSync(".demo-site-port", "utf8").trim();
const baseUrl = `https://localhost:${port}`;
const env = readFileSync(".env", "utf8");
const clientId = env.match(/^UMBRACO_CLIENT_ID=(.*)$/m)?.[1]?.trim() ?? "umbraco-back-office-mcp";
const clientSecret = env.match(/^UMBRACO_CLIENT_SECRET=(.*)$/m)?.[1]?.trim() ?? "1234567890";

console.log(`Auditing through dist/index.js → ${baseUrl}`);

const proc = spawn("node", ["dist/index.js"], {
  env: {
    ...process.env,
    UMBRACO_BASE_URL: baseUrl,
    UMBRACO_CLIENT_ID: clientId,
    UMBRACO_CLIENT_SECRET: clientSecret,
    NODE_TLS_REJECT_UNAUTHORIZED: "0",
    UMBRACO_AUTO_CONFIRM: "true", // so destructive ops don't elicit
  },
  stdio: ["pipe", "pipe", "pipe"],
});

let buffer = "";
const pending = new Map();
let nextId = 1;
const stderrChunks = [];

proc.stdout.on("data", (chunk) => {
  buffer += chunk.toString();
  let nl;
  while ((nl = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    // Server-initiated elicitInput — auto-accept with schema defaults so
    // confirmStep('Add a new block...') doesn't block the audit.
    if (msg.id !== undefined && msg.method === "elicitation/create") {
      const props = msg?.params?.requestedSchema?.properties ?? {};
      const content = {};
      for (const [k, v] of Object.entries(props)) {
        if (v && v.default !== undefined) content[k] = v.default;
      }
      const reply = { jsonrpc: "2.0", id: msg.id, result: { action: "accept", content } };
      proc.stdin.write(JSON.stringify(reply) + "\n");
      continue;
    }
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve } = pending.get(msg.id);
      pending.delete(msg.id);
      resolve(msg);
    }
  }
});
proc.stderr.on("data", (chunk) => stderrChunks.push(chunk.toString()));
proc.on("exit", (code) => {
  if (code !== 0 && code !== null) {
    console.error(`MCP subprocess exited with ${code}`);
    console.error(stderrChunks.join(""));
  }
});

function rpc(method, params) {
  const id = nextId++;
  const req = { jsonrpc: "2.0", id, method, params };
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    proc.stdin.write(JSON.stringify(req) + "\n");
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`Timeout waiting for ${method}`));
      }
    }, 60000);
  });
}

async function callTool(name, args) {
  const result = await rpc("tools/call", { name, arguments: args });
  return result;
}

async function callCmsTool(name, args) {
  const result = await rpc("tools/call", { name: `cms-${name}`, arguments: args });
  return result;
}

const findings = [];
function record(tool, status, summary, detail) {
  findings.push({ tool, status, summary, detail });
  const symbol = status === "pass" ? "PASS" : status === "fail" ? "FAIL" : status === "warn" ? "WARN" : "INFO";
  console.log(`[${symbol}] ${tool} — ${summary}`);
  if (detail) console.log(`        ${detail.replace(/\n/g, "\n        ")}`);
}

function structured(callResult) {
  return callResult?.result?.structuredContent ?? null;
}
function isError(callResult) {
  return Boolean(callResult?.result?.isError) || Boolean(callResult?.error);
}
function errorText(callResult) {
  if (callResult?.error) return JSON.stringify(callResult.error);
  return callResult?.result?.content?.[0]?.text ?? "(no content)";
}

try {
  // Initialize
  const init = await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: { elicitation: {} },
    clientInfo: { name: "audit-block-tools", version: "0.0.1" },
  });
  if (init.error) throw new Error(`initialize failed: ${JSON.stringify(init.error)}`);
  await rpc("notifications/initialized", {}).catch(() => {});

  // Discover a BlockList donor: list root pages → walk children, find one that
  // inspect-blocks reports as having an Umbraco.BlockList property with blocks.
  const listRoot = await callTool("list-children", {});
  if (isError(listRoot)) throw new Error(`list-children failed: ${errorText(listRoot)}`);
  const rootItems = structured(listRoot)?.items ?? [];
  if (!rootItems.length) throw new Error("No root pages on this Umbraco instance");
  const homeId = rootItems[0].id;
  record("list-children (sanity)", "pass", `found ${rootItems.length} root page(s); homepage id=${homeId}`);

  let donor = null;
  const candidates = [];
  for (const root of rootItems) {
    candidates.push({ id: root.id });
    const childrenResult = await callTool("list-children", { parentId: root.id });
    for (const child of structured(childrenResult)?.items?.slice(0, 20) ?? []) {
      candidates.push({ id: child.id });
    }
  }

  for (const cand of candidates) {
    const ins = await callTool("inspect-blocks", { id: cand.id });
    if (isError(ins)) continue;
    const props = structured(ins)?.blockProperties ?? [];
    const blockListProp = props.find(p => p.editorAlias === "Umbraco.BlockList" && p.blocks?.length);
    if (!blockListProp) continue;
    const block = blockListProp.blocks.find(b => Array.isArray(b.properties) && b.properties.some(p => typeof p.value === "string"));
    if (!block) continue;
    const stringProp = block.properties.find(p => typeof p.value === "string");
    donor = {
      pageId: cand.id,
      propertyAlias: blockListProp.propertyAlias,
      contentTypeKey: block.contentTypeKey,
      blockPropertyAlias: stringProp.alias,
      seededBlockKey: block.contentKey,
    };
    break;
  }
  if (!donor) {
    record("donor discovery", "fail", "no BlockList donor found — cannot audit add-blocklist-block live");
  } else {
    record("donor discovery", "pass", `pageId=${donor.pageId} property=${donor.propertyAlias} blockKey=${donor.seededBlockKey}`);

    // ── add-blocklist-block: append ───────────────────────────────────────
    const appendResult = await callTool("add-blocklist-block", {
      id: donor.pageId,
      propertyAlias: donor.propertyAlias,
      contentTypeKey: donor.contentTypeKey,
      values: [{ alias: donor.blockPropertyAlias, value: "_audit appended block" }],
    });
    if (isError(appendResult)) {
      record("add-blocklist-block (append)", "fail", "tool returned error", errorText(appendResult));
    } else {
      const appendedKey = structured(appendResult)?.contentKey;
      const verifyAppend = await callTool("inspect-blocks", { id: donor.pageId, propertyAlias: donor.propertyAlias });
      const appendBlocks = structured(verifyAppend)?.blockProperties?.[0]?.blocks ?? [];
      const found = appendBlocks.some(b => b.contentKey === appendedKey);
      if (!appendedKey) record("add-blocklist-block (append)", "fail", "no contentKey in response", JSON.stringify(structured(appendResult)));
      else if (!found) record("add-blocklist-block (append)", "fail", `appended key ${appendedKey} not visible via inspect-blocks`);
      else record("add-blocklist-block (append)", "pass", `appended ${appendedKey}; visible in post-state`);

      // ── add-blocklist-block: prepend ────────────────────────────────────
      const prependResult = await callTool("add-blocklist-block", {
        id: donor.pageId,
        propertyAlias: donor.propertyAlias,
        contentTypeKey: donor.contentTypeKey,
        values: [{ alias: donor.blockPropertyAlias, value: "_audit prepended block" }],
        position: { mode: "prepend" },
      });
      if (isError(prependResult)) {
        record("add-blocklist-block (prepend)", "fail", "tool returned error", errorText(prependResult));
      } else {
        const prependedKey = structured(prependResult)?.contentKey;
        record("add-blocklist-block (prepend)", "pass", `prepended ${prependedKey} (response shape OK)`);
      }

      // ── add-blocklist-block: before/after anchor ────────────────────────
      const beforeResult = await callTool("add-blocklist-block", {
        id: donor.pageId,
        propertyAlias: donor.propertyAlias,
        contentTypeKey: donor.contentTypeKey,
        values: [{ alias: donor.blockPropertyAlias, value: "_audit before-anchor" }],
        position: { mode: "before", anchorContentKey: donor.seededBlockKey },
      });
      if (isError(beforeResult)) record("add-blocklist-block (before-anchor)", "fail", "tool returned error", errorText(beforeResult));
      else record("add-blocklist-block (before-anchor)", "pass", `inserted ${structured(beforeResult)?.contentKey}`);

      const afterResult = await callTool("add-blocklist-block", {
        id: donor.pageId,
        propertyAlias: donor.propertyAlias,
        contentTypeKey: donor.contentTypeKey,
        values: [{ alias: donor.blockPropertyAlias, value: "_audit after-anchor" }],
        position: { mode: "after", anchorContentKey: donor.seededBlockKey },
      });
      if (isError(afterResult)) record("add-blocklist-block (after-anchor)", "fail", "tool returned error", errorText(afterResult));
      else record("add-blocklist-block (after-anchor)", "pass", `inserted ${structured(afterResult)?.contentKey}`);

      // ── add-blocklist-block: invalid input rejection ────────────────────
      const badAnchor = await callTool("add-blocklist-block", {
        id: donor.pageId,
        propertyAlias: donor.propertyAlias,
        contentTypeKey: donor.contentTypeKey,
        values: [{ alias: donor.blockPropertyAlias, value: "_audit no-anchor" }],
        position: { mode: "before" },
      });
      if (!isError(badAnchor)) record("add-blocklist-block (rejects bad input)", "fail", "expected error for missing anchorContentKey, got success");
      else record("add-blocklist-block (rejects bad input)", "pass", "errored as expected on missing anchorContentKey");

      // ── edit-block on the appended block, blockType: content (existing path) ─
      const editContent = await callTool("edit-block", {
        id: donor.pageId,
        propertyAlias: donor.propertyAlias,
        contentKey: appendedKey,
        values: [{ alias: donor.blockPropertyAlias, value: "_audit edited content" }],
      });
      if (isError(editContent)) record("edit-block (default blockType)", "fail", "tool returned error", errorText(editContent));
      else record("edit-block (default blockType)", "pass", `updated ${appendedKey}`);
    }

    // ── BlockGrid donor probe (graceful skip if absent) ─────────────────────
    let gridDonor = null;
    for (const cand of candidates) {
      const ins = await callTool("inspect-blocks", { id: cand.id });
      if (isError(ins)) continue;
      const props = structured(ins)?.blockProperties ?? [];
      const gridProp = props.find(p => p.editorAlias === "Umbraco.BlockGrid" && p.blocks?.length);
      if (!gridProp) continue;
      const block = gridProp.blocks.find(b => Array.isArray(b.properties) && b.properties.some(p => typeof p.value === "string"));
      if (!block) continue;
      const stringProp = block.properties.find(p => typeof p.value === "string");
      gridDonor = {
        pageId: cand.id,
        propertyAlias: gridProp.propertyAlias,
        contentTypeKey: block.contentTypeKey,
        blockPropertyAlias: stringProp.alias,
      };
      break;
    }
    if (!gridDonor) {
      record("add-blockgrid-block", "info", "no BlockGrid donor on this Umbraco instance — skipped");
    } else {
      const gridResult = await callTool("add-blockgrid-block", {
        id: gridDonor.pageId,
        propertyAlias: gridDonor.propertyAlias,
        contentTypeKey: gridDonor.contentTypeKey,
        values: [{ alias: gridDonor.blockPropertyAlias, value: "_audit grid block" }],
      });
      if (isError(gridResult)) record("add-blockgrid-block (append)", "fail", "tool returned error", errorText(gridResult));
      else record("add-blockgrid-block (append)", "pass", `inserted ${structured(gridResult)?.contentKey}`);
    }

    // ── RTE donor probe ─────────────────────────────────────────────────────
    let rteDonor = null;
    for (const cand of candidates) {
      const ins = await callTool("inspect-blocks", { id: cand.id });
      if (isError(ins)) continue;
      const props = structured(ins)?.blockProperties ?? [];
      const rteProp = props.find(p => p.editorAlias === "Umbraco.RichText" && p.blocks?.length);
      if (!rteProp) continue;
      const block = rteProp.blocks.find(b => Array.isArray(b.properties) && b.properties.some(p => typeof p.value === "string"));
      if (!block) continue;
      const stringProp = block.properties.find(p => typeof p.value === "string");
      rteDonor = {
        pageId: cand.id,
        propertyAlias: rteProp.propertyAlias,
        contentTypeKey: block.contentTypeKey,
        blockPropertyAlias: stringProp.alias,
      };
      break;
    }
    if (!rteDonor) {
      record("add-rte-block", "info", "no RichText-with-blocks donor on this Umbraco instance — skipped");
    } else {
      const rteResult = await callTool("add-rte-block", {
        id: rteDonor.pageId,
        propertyAlias: rteDonor.propertyAlias,
        contentTypeKey: rteDonor.contentTypeKey,
        values: [{ alias: rteDonor.blockPropertyAlias, value: "_audit rte block" }],
      });
      if (isError(rteResult)) record("add-rte-block (append)", "fail", "tool returned error", errorText(rteResult));
      else record("add-rte-block (append)", "pass", `inserted ${structured(rteResult)?.contentKey}`);
    }
  }
} catch (err) {
  console.error("Audit harness errored:", err.message);
  process.exitCode = 1;
} finally {
  console.log("\nSummary:");
  const pass = findings.filter(f => f.status === "pass").length;
  const fail = findings.filter(f => f.status === "fail").length;
  const warn = findings.filter(f => f.status === "warn").length;
  const info = findings.filter(f => f.status === "info").length;
  console.log(`  ${pass} pass · ${fail} fail · ${warn} warn · ${info} info`);
  proc.kill();
}
