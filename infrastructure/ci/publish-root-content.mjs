#!/usr/bin/env node

/**
 * Publishes all root-level content in Umbraco.
 *
 * On unattended install with the Clean starter kit, content is created
 * as drafts. This script publishes the root tree so integration tests
 * can find and operate on published content.
 *
 * Usage:
 *   node infrastructure/ci/publish-root-content.mjs [baseUrl]
 *
 * Requires the MCP API user to already exist (run create-api-user.mjs first).
 */

const BASE_URL = process.argv[2] || "http://localhost:56472";

const CLIENT_ID = "umbraco-back-office-mcp";
const CLIENT_SECRET = "1234567890";

const TOKEN_PATH = "/umbraco/management/api/v1/security/back-office/token";
const DOCUMENT_ROOT_PATH = "/umbraco/management/api/v1/document";

async function getToken() {
  const res = await fetch(`${BASE_URL}${TOKEN_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Token request failed: HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.access_token;
}

async function listRootDocuments(token) {
  // List root-level children (no parent filter)
  const url = `${BASE_URL}${DOCUMENT_ROOT_PATH}?skip=0&take=100`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`List documents failed: HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.items || [];
}

async function publishDocument(token, id) {
  const url = `${BASE_URL}${DOCUMENT_ROOT_PATH}/${id}/publish`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      publishSchedules: [{ culture: null }],
    }),
    signal: AbortSignal.timeout(10_000),
  });

  return res.ok;
}

async function publishDocumentWithDescendants(token, id) {
  // Try publishing with descendants first
  const url = `${BASE_URL}${DOCUMENT_ROOT_PATH}/${id}/publish-with-descendants`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      includeUnpublishedDescendants: true,
      cultures: [],
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (res.ok) return true;

  // Fall back to single-page publish
  return publishDocument(token, id);
}

async function main() {
  console.log(`Publishing root content on ${BASE_URL}...`);

  const token = await getToken();
  const documents = await listRootDocuments(token);

  if (documents.length === 0) {
    console.log("No root documents found — nothing to publish");
    return;
  }

  console.log(`Found ${documents.length} root document(s)`);

  for (const doc of documents) {
    const name = doc.variants?.[0]?.name || doc.id;
    const ok = await publishDocumentWithDescendants(token, doc.id);
    console.log(`  ${ok ? "✓" : "✗"} ${name} (${doc.id})`);
  }

  console.log("Root content published");
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
