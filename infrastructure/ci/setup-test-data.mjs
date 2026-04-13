#!/usr/bin/env node

/**
 * Creates test fixtures in Umbraco for integration tests.
 *
 * Sets up data that tests need but can't create through the MCP chain
 * (due to missing fields, API mismatches, or CMS MCP limitations).
 *
 * Usage:
 *   node infrastructure/ci/setup-test-data.mjs [baseUrl]
 *
 * Requires the MCP API user to already exist (run create-api-user.mjs first).
 */

const BASE_URL = process.argv[2] || "http://localhost:56472";

const CLIENT_ID = "umbraco-back-office-mcp";
const CLIENT_SECRET = "1234567890";

const TOKEN_PATH = "/umbraco/management/api/v1/security/back-office/token";
const LANGUAGE_PATH = "/umbraco/management/api/v1/language";
const MEMBER_GROUP_PATH = "/umbraco/management/api/v1/member-group";

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

async function createLanguage(token, isoCode, name) {
  // Check if it already exists
  const checkRes = await fetch(`${BASE_URL}${LANGUAGE_PATH}/${isoCode}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (checkRes.ok) {
    console.log(`  ✓ Language ${isoCode} already exists`);
    return true;
  }

  const res = await fetch(`${BASE_URL}${LANGUAGE_PATH}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name,
      isoCode,
      isDefault: false,
      isMandatory: false,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (res.ok || res.status === 201) {
    console.log(`  ✓ Created language ${isoCode} (${name})`);
    return true;
  }

  console.log(`  ✗ Failed to create language ${isoCode}: HTTP ${res.status}`);
  return false;
}

async function createMemberGroup(token, name) {
  // Check if it already exists
  const listRes = await fetch(`${BASE_URL}${MEMBER_GROUP_PATH}?skip=0&take=100`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (listRes.ok) {
    const listData = await listRes.json();
    const existing = listData.items?.find(g => g.name === name);
    if (existing) {
      console.log(`  ✓ Member group "${name}" already exists`);
      return true;
    }
  }

  const res = await fetch(`${BASE_URL}${MEMBER_GROUP_PATH}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name }),
    signal: AbortSignal.timeout(10_000),
  });

  if (res.ok || res.status === 201) {
    console.log(`  ✓ Created member group "${name}"`);
    return true;
  }

  console.log(`  ✗ Failed to create member group "${name}": HTTP ${res.status}`);
  return false;
}

async function main() {
  console.log(`Setting up test data on ${BASE_URL}...`);

  const token = await getToken();

  // Create a second language for translation tests
  await createLanguage(token, "nb-NO", "Norwegian Bokmål");

  // Create a member group for member tests
  await createMemberGroup(token, "Test Integration Group");

  console.log("Test data setup complete");
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
