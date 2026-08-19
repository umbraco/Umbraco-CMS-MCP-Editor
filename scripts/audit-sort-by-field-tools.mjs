// Audit harness for the two tools added with the @umbraco-cms/mcp-dev@18.1.1
// upgrade (#87): sort-children-by-field and sort-media-children-by-field.
// Spawns the same dist/index.js the live MCP host runs and drives it over
// JSON-RPC/stdio, so wire-layer failures (outputSchema mismatches → -32602,
// transport masking) surface here even when the handler-level integration
// tests pass.
//
// Usage: node scripts/audit-sort-by-field-tools.mjs
//
// Reads .demo-site-port for the Umbraco port; .env for credentials.
// Creates its own fixtures (a parent page with two children, a media folder
// with two children) and removes them at the end.

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
    UMBRACO_AUTO_CONFIRM: "true",
    UMBRACO_TOOL_MODES: "content,media",
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
    if (msg.id !== undefined && msg.method === "elicitation/create") {
      const props = msg?.params?.requestedSchema?.properties ?? {};
      const content = {};
      for (const [k, v] of Object.entries(props)) {
        if (v && v.default !== undefined) content[k] = v.default;
      }
      proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { action: "accept", content } }) + "\n");
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
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`Timeout waiting for ${method}`));
      }
    }, 90000);
  });
}

const callTool = (name, args) => rpc("tools/call", { name, arguments: args });

const findings = [];
function record(tool, status, summary, detail) {
  findings.push({ tool, status, summary });
  console.log(`[${status.toUpperCase()}] ${tool} — ${summary}`);
  if (detail) console.log(`        ${String(detail).replace(/\n/g, "\n        ")}`);
}

const structured = (r) => r?.result?.structuredContent ?? null;
const isError = (r) => Boolean(r?.result?.isError) || Boolean(r?.error);
const errorText = (r) => (r?.error ? JSON.stringify(r.error) : r?.result?.content?.[0]?.text ?? "(no content)");

const stamp = Date.now();
const created = { pages: [], media: [] };

try {
  const init = await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: { elicitation: {} },
    clientInfo: { name: "audit-sort-by-field", version: "0.0.1" },
  });
  if (init.error) throw new Error(`initialize failed: ${JSON.stringify(init.error)}`);
  await rpc("notifications/initialized", {}).catch(() => {});

  // Both tools must actually be exposed on the wire.
  const tools = await rpc("tools/list", {});
  const names = (tools?.result?.tools ?? []).map((t) => t.name);
  for (const t of ["sort-children-by-field", "sort-media-children-by-field"]) {
    record(t, names.includes(t) ? "pass" : "fail", names.includes(t) ? "exposed in tools/list" : "MISSING from tools/list");
  }

  // ---- content ----------------------------------------------------------
  const roots = await callTool("list-children", {});
  if (isError(roots)) throw new Error(`list-children failed: ${errorText(roots)}`);
  const rootItems = structured(roots)?.items ?? [];
  if (!rootItems.length) throw new Error("No root pages on this Umbraco instance");
  const parentId = rootItems[0].id;

  // Derive a usable document type from an existing child of the root — the
  // document-type list also contains element/composition types that Umbraco
  // refuses to create documents from.
  const existing = await callTool("list-children", { parentId, take: 100 });
  const existingItems = structured(existing)?.items ?? [];
  if (!existingItems.length) throw new Error("Root page has no children to derive a document type from");
  const samplePage = await callTool("get-page", { id: existingItems[0].id });
  if (isError(samplePage)) throw new Error(`get-page failed: ${errorText(samplePage)}`);
  const docTypeId = structured(samplePage)?.documentType?.id ?? structured(samplePage)?.contentTypeId;
  if (!docTypeId) throw new Error(`Could not derive a document type: ${JSON.stringify(structured(samplePage)).slice(0, 400)}`);

  // Create Zulu first so the natural sortOrder is the reverse of A-Z.
  for (const name of [`_Audit Zulu ${stamp}`, `_Audit Alpha ${stamp}`]) {
    const res = await callTool("create-page", { name, documentTypeId: docTypeId, parentId });
    if (isError(res)) throw new Error(`create-page ${name} failed: ${errorText(res)}`);
    created.pages.push({ id: structured(res).id, name });
  }
  const [zulu, alpha] = created.pages;

  const asc = await callTool("sort-children-by-field", { parentId, field: "Name", direction: "Ascending" });
  if (isError(asc)) {
    record("sort-children-by-field", "fail", "Ascending call errored", errorText(asc));
  } else {
    const d = structured(asc);
    const after = await callTool("list-children", { parentId, take: 100 });
    const order = (structured(after)?.items ?? []).map((i) => i.id).filter((id) => id === alpha.id || id === zulu.id);
    const ok = order[0] === alpha.id && order[1] === zulu.id;
    record("sort-children-by-field", ok ? "pass" : "fail",
      `Ascending → ${d.message}`,
      `post-state order: ${JSON.stringify(order)} (expected [alpha, zulu] = ${JSON.stringify([alpha.id, zulu.id])})`);
  }

  const desc = await callTool("sort-children-by-field", { parentId, field: "Name", direction: "Descending" });
  if (isError(desc)) {
    record("sort-children-by-field", "fail", "Descending call errored", errorText(desc));
  } else {
    const after = await callTool("list-children", { parentId, take: 100 });
    const order = (structured(after)?.items ?? []).map((i) => i.id).filter((id) => id === alpha.id || id === zulu.id);
    const ok = order[0] === zulu.id && order[1] === alpha.id;
    record("sort-children-by-field", ok ? "pass" : "fail", "Descending reverses the order",
      `post-state order: ${JSON.stringify(order)}`);
  }

  const noDirection = await callTool("sort-children-by-field", { parentId, field: "Name" });
  if (isError(noDirection)) {
    record("sort-children-by-field", "fail", "omitted direction errored", errorText(noDirection));
  } else {
    const d = structured(noDirection);
    const after = await callTool("list-children", { parentId, take: 100 });
    const order = (structured(after)?.items ?? []).map((i) => i.id).filter((id) => id === alpha.id || id === zulu.id);
    const ok = d.direction === "Ascending" && order[0] === alpha.id;
    record("sort-children-by-field", ok ? "pass" : "fail",
      `omitted direction defaults to ${d.direction}`, `post-state order: ${JSON.stringify(order)}`);
  }

  // ---- media ------------------------------------------------------------
  const folder = await callTool("create-media-folder", { name: `_Audit Sort Folder ${stamp}` });
  if (isError(folder)) throw new Error(`create-media-folder failed: ${errorText(folder)}`);
  const folderId = structured(folder).id;
  created.media.push(folderId);

  const mediaIds = [];
  for (const name of [`_Audit Media Zulu ${stamp}`, `_Audit Media Alpha ${stamp}`]) {
    const res = await callTool("create-media-folder", { name, parentId: folderId });
    if (isError(res)) throw new Error(`create-media-folder ${name} failed: ${errorText(res)}`);
    mediaIds.push(structured(res).id);
  }
  const [mZulu, mAlpha] = mediaIds;

  const mAsc = await callTool("sort-media-children-by-field", { parentId: folderId, field: "Name", direction: "Ascending" });
  if (isError(mAsc)) {
    record("sort-media-children-by-field", "fail", "Ascending call errored", errorText(mAsc));
  } else {
    const d = structured(mAsc);
    const after = await callTool("list-media-children", { parentId: folderId, take: 100 });
    const order = (structured(after)?.items ?? []).map((i) => i.id);
    const ok = order[0] === mAlpha && order[1] === mZulu;
    record("sort-media-children-by-field", ok ? "pass" : "fail",
      `Ascending → ${d.message}`, `post-state order: ${JSON.stringify(order)}`);
  }

  const mDesc = await callTool("sort-media-children-by-field", { parentId: folderId, field: "Name", direction: "Descending" });
  if (isError(mDesc)) {
    record("sort-media-children-by-field", "fail", "Descending call errored", errorText(mDesc));
  } else {
    const after = await callTool("list-media-children", { parentId: folderId, take: 100 });
    const order = (structured(after)?.items ?? []).map((i) => i.id);
    const ok = order[0] === mZulu && order[1] === mAlpha;
    record("sort-media-children-by-field", ok ? "pass" : "fail", "Descending reverses the order",
      `post-state order: ${JSON.stringify(order)}`);
  }
} catch (err) {
  record("harness", "fail", err.message);
} finally {
  // ---- cleanup ----------------------------------------------------------
  for (const p of created.pages) {
    await callTool("delete-page", { id: p.id }).catch(() => {});
    await callTool("permanent-delete-recycle-bin-item", { id: p.id, type: "content" }).catch(() => {});
  }
  for (const id of created.media.slice().reverse()) {
    await callTool("delete-media", { id }).catch(() => {});
    await callTool("permanent-delete-recycle-bin-item", { id, type: "media" }).catch(() => {});
  }
  console.log("\n=== SUMMARY ===");
  for (const f of findings) console.log(`${f.status.toUpperCase().padEnd(5)} ${f.tool} — ${f.summary}`);
  const failed = findings.filter((f) => f.status === "fail").length;
  proc.stdin.end();
  proc.kill();
  process.exit(failed ? 1 : 0);
}
