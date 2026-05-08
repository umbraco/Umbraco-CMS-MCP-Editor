// Provision BlockGrid + RTE-with-blocks donor content on the local demo site
// so the live audit can exercise add-blockgrid-block and add-rte-block. Talks
// to the @umbraco-cms/mcp-dev MCP server directly (the same one the editor
// MCP chains to internally) over stdio JSON-RPC.
//
// Idempotent: if the doc type / page already exist, reuses them.
//
// Usage: node scripts/provision-block-donors.mjs [--cleanup]
//   --cleanup removes the doc type + page (best-effort; data types stick around
//             because there's no chained delete-data-type call wired up here).

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const port = readFileSync(".demo-site-port", "utf8").trim();
const baseUrl = `https://localhost:${port}`;
const env = readFileSync(".env", "utf8");
const clientId = env.match(/^UMBRACO_CLIENT_ID=(.*)$/m)?.[1]?.trim() ?? "umbraco-back-office-mcp";
const clientSecret = env.match(/^UMBRACO_CLIENT_SECRET=(.*)$/m)?.[1]?.trim() ?? "1234567890";

const cleanup = process.argv.includes("--cleanup");

const proc = spawn("node", ["node_modules/@umbraco-cms/mcp-dev/dist/index.js"], {
  env: {
    ...process.env,
    UMBRACO_BASE_URL: baseUrl,
    UMBRACO_CLIENT_ID: clientId,
    UMBRACO_CLIENT_SECRET: clientSecret,
    NODE_TLS_REJECT_UNAUTHORIZED: "0",
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
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve } = pending.get(msg.id);
      pending.delete(msg.id);
      resolve(msg);
    }
  }
});
proc.stderr.on("data", (chunk) => stderrChunks.push(chunk.toString()));

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
    }, 60000);
  });
}

async function tool(name, args) {
  const r = await rpc("tools/call", { name, arguments: args });
  if (r.error) throw new Error(`${name}: ${JSON.stringify(r.error)}`);
  if (r.result?.isError) throw new Error(`${name}: ${r.result.content?.[0]?.text ?? "error"}`);
  // structuredContent is the typed payload; fall back to text content
  return r.result?.structuredContent ?? r.result;
}

async function findOrCreateDataType({ name, editorAlias, editorUiAlias, values }) {
  const found = await tool("find-data-type", { name });
  const match = found?.items?.find(d => d.name === name);
  if (match) return match.id;
  const created = await tool("create-data-type", { name, editorAlias, editorUiAlias, values });
  return created.id;
}

async function findOrCreateDocumentType({ name, alias, properties }) {
  const all = await tool("get-all-document-types", {}).catch(() => null);
  const existing = all?.items?.find(d => d.alias === alias);
  if (existing) return existing.id;
  const created = await tool("create-document-type", {
    name, alias,
    icon: "icon-document",
    allowedAsRoot: true,
    compositions: [],
    allowedDocumentTypes: [],
    properties,
  });
  return created.id;
}

async function findElementTypeByAlias(alias) {
  // No first-class find tool for element types — search by walking content type folder root.
  // Easiest path: try create-element-type and detect duplicate-alias errors.
  return null;
}

try {
  const init = await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "provision-block-donors", version: "0.0.1" },
  });
  if (init.error) throw new Error(`initialize failed: ${JSON.stringify(init.error)}`);
  await rpc("notifications/initialized", {}).catch(() => {});

  const PAGE_NAME = "_Audit block donor page";
  const DOC_TYPE_ALIAS = "_auditBlockHost";
  const DOC_TYPE_NAME = "_Audit block host";
  const ELEMENT_TYPE_ALIAS = "_auditBlockElement";
  const ELEMENT_TYPE_NAME = "_Audit block element";
  const TEXTBOX_ALIAS_NAME = "_Audit textbox";
  const BLOCKGRID_NAME = "_Audit blockgrid";
  const RTE_NAME = "_Audit rte with blocks";

  if (cleanup) {
    // Best-effort cleanup. Only removes the donor page + the doc type that holds it.
    // Element / data types are left in place because deleting them risks dangling refs.
    const root = await tool("get-document-root", { cursor: undefined });
    const page = root?.items?.find(p => p.name === PAGE_NAME || p.variants?.[0]?.name === PAGE_NAME);
    if (page) {
      await tool("move-document-to-recycle-bin", { id: page.id });
      await tool("delete-document-recycle-bin-item", { id: page.id }).catch(() => {});
      console.log(`Removed donor page ${page.id}`);
    } else {
      console.log("No donor page found — already clean");
    }
    proc.kill();
    process.exit(0);
  }

  console.log(`Provisioning donors against ${baseUrl}`);

  // 1 — TextBox datatype
  const textboxId = await findOrCreateDataType({
    name: TEXTBOX_ALIAS_NAME,
    editorAlias: "Umbraco.TextBox",
    editorUiAlias: "Umb.PropertyEditorUi.TextBox",
    values: [{ alias: "maxChars", value: 200 }],
  });
  console.log(`TextBox datatype: ${textboxId}`);

  // 2 — Element type (one TextBox property "title")
  // create-element-type errors on duplicate alias. Try-create, fall back to
  // get-all-document-types (element types share the same listing in this build).
  let elementTypeId;
  try {
    const created = await tool("create-element-type", {
      name: ELEMENT_TYPE_NAME,
      alias: ELEMENT_TYPE_ALIAS,
      icon: "icon-block",
      compositions: [],
      properties: [{ name: "Title", alias: "title", dataTypeId: textboxId, group: "Content" }],
    });
    elementTypeId = created.id;
    console.log(`Element type created: ${elementTypeId}`);
  } catch (err) {
    // Try to find existing
    const all = await tool("get-all-document-types", {}).catch(() => null);
    const found = all?.items?.find(d => d.alias === ELEMENT_TYPE_ALIAS);
    if (!found) throw err;
    elementTypeId = found.id;
    console.log(`Element type existing: ${elementTypeId}`);
  }

  // 3 — BlockGrid datatype using the element type
  const blockGridDtId = await findOrCreateDataType({
    name: BLOCKGRID_NAME,
    editorAlias: "Umbraco.BlockGrid",
    editorUiAlias: "Umb.PropertyEditorUi.BlockGrid",
    values: [
      { alias: "gridColumns", value: 12 },
      { alias: "blocks", value: [{
        contentElementTypeKey: elementTypeId,
        allowAtRoot: true,
        allowInAreas: true,
        columnSpanOptions: [{ columnSpan: 12 }],
        rowMinSpan: 1,
        rowMaxSpan: 1,
      }] },
    ],
  });
  console.log(`BlockGrid datatype: ${blockGridDtId}`);

  // 4 — RTE (Tiptap) datatype with blocks
  const rteDtId = await findOrCreateDataType({
    name: RTE_NAME,
    editorAlias: "Umbraco.RichText",
    editorUiAlias: "Umb.PropertyEditorUi.Tiptap",
    values: [
      { alias: "extensions", value: [
        "Umb.Tiptap.RichTextEssentials",
        "Umb.Tiptap.Block",
      ] },
      { alias: "blocks", value: [{ contentElementTypeKey: elementTypeId }] },
    ],
  });
  console.log(`RTE datatype: ${rteDtId}`);

  // 5 — Doc type with both properties, allowed at root
  const docTypeId = await findOrCreateDocumentType({
    name: DOC_TYPE_NAME,
    alias: DOC_TYPE_ALIAS,
    properties: [
      { name: "Page grid", alias: "pageGrid", dataTypeId: blockGridDtId, group: "Content" },
      { name: "Body", alias: "body", dataTypeId: rteDtId, group: "Content" },
    ],
  });
  console.log(`Doc type: ${docTypeId}`);

  // 6 — Create page seeded with one BlockGrid block + one RTE block
  const all = await tool("get-document-root", { cursor: undefined });
  const existing = all?.items?.find(p =>
    p.name === PAGE_NAME || p.variants?.[0]?.name === PAGE_NAME);

  if (existing) {
    console.log(`Donor page already exists: ${existing.id}`);
    proc.kill();
    process.exit(0);
  }

  const gridBlockKey = randomUUID();
  const rteBlockKey = randomUUID();

  const blockGridValue = {
    contentData: [{
      key: gridBlockKey,
      contentTypeKey: elementTypeId,
      values: [{ editorAlias: "Umbraco.TextBox", culture: null, segment: null, alias: "title", value: "_seeded grid block title" }],
    }],
    settingsData: [],
    layout: { "Umbraco.BlockGrid": [{ contentKey: gridBlockKey, columnSpan: 12, rowSpan: 1, areas: [] }] },
    expose: [{ contentKey: gridBlockKey, culture: null, segment: null }],
  };

  const rteValue = {
    markup: `<p>seeded paragraph</p><umb-rte-block data-content-key="${rteBlockKey}"></umb-rte-block>`,
    blocks: {
      contentData: [{
        key: rteBlockKey,
        contentTypeKey: elementTypeId,
        values: [{ editorAlias: "Umbraco.TextBox", culture: null, segment: null, alias: "title", value: "_seeded rte block title" }],
      }],
      settingsData: [],
      layout: { "Umbraco.RichText": [{ contentKey: rteBlockKey }] },
      expose: [{ contentKey: rteBlockKey, culture: null, segment: null }],
    },
  };

  const created = await tool("create-document", {
    documentTypeId: docTypeId,
    name: PAGE_NAME,
    values: [
      { editorAlias: "Umbraco.BlockGrid", culture: null, segment: null, alias: "pageGrid", value: blockGridValue },
      { editorAlias: "Umbraco.RichText", culture: null, segment: null, alias: "body", value: rteValue },
    ],
  });
  console.log(`Donor page created: ${created.id} (BlockGrid block ${gridBlockKey}, RTE block ${rteBlockKey})`);
} catch (err) {
  console.error(`Provisioning failed: ${err.message}`);
  console.error(stderrChunks.join(""));
  process.exitCode = 1;
} finally {
  proc.kill();
}
