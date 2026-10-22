import { configureDryRunMode, isDryRunEnabled } from "@umbraco-cms/mcp-server-sdk";
import { applyWorkerDryRun } from "../config/worker-dry-run.js";

// Regression test for #246: the hosted worker never activated dry-run mode.
// Stdio gets this for free via the SDK's getServerConfig() ->
// configureDryRunMode(config.dryRun === true), but @umbraco-cms/mcp-hosted's
// HostedMcpEnv / loadWorkerConfig don't read UMBRACO_DRY_RUN (unlike
// UMBRACO_READONLY, which they do), so worker.ts has to call
// applyWorkerDryRun itself. This proves that local wiring activates dry-run
// the same way stdio does, and parses the env var case-insensitively.
describe("applyWorkerDryRun (#246)", () => {
  afterEach(() => {
    configureDryRunMode(false);
  });

  it("enables dry-run for \"true\"", () => {
    applyWorkerDryRun({ UMBRACO_DRY_RUN: "true" });
    expect(isDryRunEnabled()).toBe(true);
  });

  it("enables dry-run for \"TRUE\" (case-insensitive, matching stdio's SDK parsing)", () => {
    applyWorkerDryRun({ UMBRACO_DRY_RUN: "TRUE" });
    expect(isDryRunEnabled()).toBe(true);
  });

  it("leaves dry-run off for \"false\"", () => {
    applyWorkerDryRun({ UMBRACO_DRY_RUN: "false" });
    expect(isDryRunEnabled()).toBe(false);
  });

  it("leaves dry-run off for an empty string", () => {
    applyWorkerDryRun({ UMBRACO_DRY_RUN: "" });
    expect(isDryRunEnabled()).toBe(false);
  });

  it("leaves dry-run off when unset", () => {
    applyWorkerDryRun({});
    expect(isDryRunEnabled()).toBe(false);
  });
});
