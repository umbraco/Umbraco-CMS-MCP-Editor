/**
 * Worker lifecycle for E2E tests.
 *
 * Starts and stops the Worker using Wrangler's unstable_dev.
 */

import { unstable_dev, type Unstable_DevWorker } from "wrangler";

let worker: Unstable_DevWorker | undefined;
let workerUrl: string | undefined;

const BASE_VARS = {
  UMBRACO_BASE_URL: process.env.UMBRACO_BASE_URL ?? "https://localhost:44386",
  UMBRACO_SERVER_URL: process.env.UMBRACO_SERVER_URL ?? "http://localhost:53620",
  UMBRACO_OAUTH_CLIENT_ID: "umbraco-editor-mcp-hosted",
  COOKIE_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  ENABLE_INFO_ENDPOINT: "true",
  // These tests exercise real write flows (elicitation, publish, etc.), so open
  // the human-in-the-loop gate — the Worker sandbox only sees vars declared
  // here, not the outer test process's environment.
  UMBRACO_HUMAN_IN_THE_LOOP: "false",
};

export async function startWorker(varsOverride?: Record<string, string>): Promise<string> {
  worker = await unstable_dev("src/worker.ts", {
    config: "tests/hosted-e2e/wrangler.e2e.toml",
    port: 8787,
    experimental: { disableExperimentalWarning: true },
    vars: { ...BASE_VARS, ...varsOverride },
    logLevel: "error",
  });

  const address = worker.address;
  const port = worker.port;
  workerUrl = `http://${address}:${port}`;
  return workerUrl;
}

export async function stopWorker(): Promise<void> {
  if (worker) {
    await worker.stop();
    worker = undefined;
    workerUrl = undefined;
  }
}

export function getWorkerUrl(): string {
  if (!workerUrl) {
    throw new Error("Worker not started. Call startWorker() first.");
  }
  return workerUrl;
}
