/**
 * Umbraco-major version guard (#247)
 *
 * CI's demo site always matches, so the mismatch path is covered here with a
 * fake /server/information client rather than through the integration stack.
 */

import { describe, it, expect, afterEach } from "@jest/globals";
import {
  runStartupVersionCheck,
  clearVersionCheckMessage,
  withPreExecutionCheck,
  PARENT_CHECKED_MAJOR_ENV,
  type McpServerConfig,
} from "@umbraco-cms/mcp-server-sdk";
import packageJson from "../../../package.json" with { type: "json" };
import { UMBRACO_TARGET_MAJOR, getExpectedUmbracoMajor, withParentCheckedMajor } from "../version-guard.js";

const BASE_URL = "https://localhost:44391";

const stdioServer = (env?: Record<string, string>): McpServerConfig => ({
  name: "cms",
  command: "node",
  args: ["mcp-dev.js"],
  env,
});

// A minimal decorated tool: withPreExecutionCheck is what every editor tool
// composes via withStandardDecorators.
const tool = withPreExecutionCheck({
  name: "probe",
  description: "probe",
  inputSchema: {},
  handler: async () => ({ content: [{ type: "text" as const, text: "ran" }] }),
} as any);
const callTool = () => (tool.handler as any)({}, {});
const textOf = (result: any) => result.content?.[0]?.text as string;

const startWithInstance = (version: string) =>
  runStartupVersionCheck({
    generatedUmbracoMajor: UMBRACO_TARGET_MAJOR,
    mcpVersion: packageJson.version,
    client: { getServerInformation: async () => ({ version }) },
  });

describe("getExpectedUmbracoMajor", () => {
  it("defaults to this package's major", () => {
    expect(UMBRACO_TARGET_MAJOR).toBe(packageJson.version.split(".")[0]);
    expect(getExpectedUmbracoMajor()).toBe(UMBRACO_TARGET_MAJOR);
  });

  it.each(["", "   ", null, undefined])("falls back when the override is %p", (override) => {
    expect(getExpectedUmbracoMajor(override)).toBe(UMBRACO_TARGET_MAJOR);
  });

  it("uses a non-blank override", () => {
    expect(getExpectedUmbracoMajor(" 99 ")).toBe("99");
  });
});

describe("stdio startup guard", () => {
  afterEach(() => clearVersionCheckMessage());

  it("blocks the first tool call once on a mismatch, then lets a retry through", async () => {
    const message = await startWithInstance(`${Number(UMBRACO_TARGET_MAJOR) - 1}.0.0`);
    expect(message).toEqual(expect.any(String));

    const first = await callTool();
    expect(first.isError).toBe(true);
    expect(textOf(first)).not.toBe("ran");

    expect(textOf(await callTool())).toBe("ran");
  });

  it("blocks nothing and adds no message on a match", async () => {
    expect(await startWithInstance(`${UMBRACO_TARGET_MAJOR}.3.0`)).toBeNull();
    expect(textOf(await callTool())).toBe("ran");
  });

  it("warns without blocking when the CMS is unreachable", async () => {
    const message = await runStartupVersionCheck({
      generatedUmbracoMajor: UMBRACO_TARGET_MAJOR,
      mcpVersion: packageJson.version,
      client: { getServerInformation: async () => { throw new Error("ECONNREFUSED"); } },
    });
    expect(message).toEqual(expect.any(String));
    expect(textOf(await callTool())).toBe("ran");
  });
});

describe("withParentCheckedMajor", () => {
  it("tells a chained server on the same instance which major was checked", () => {
    const out = withParentCheckedMajor(stdioServer({ UMBRACO_BASE_URL: `${BASE_URL}/` }), "18", BASE_URL);
    expect((out as any).env).toEqual({ UMBRACO_BASE_URL: `${BASE_URL}/`, [PARENT_CHECKED_MAJOR_ENV]: "18" });
  });

  it("leaves a chained server on a different instance alone", () => {
    const server = stdioServer({ UMBRACO_BASE_URL: "https://other.example.com" });
    expect(withParentCheckedMajor(server, "18", BASE_URL)).toBe(server);
  });

  it("leaves a chained server with no base URL alone", () => {
    const server = stdioServer();
    expect(withParentCheckedMajor(server, "18", BASE_URL)).toBe(server);
  });

  it("does not mutate the original config", () => {
    const server = stdioServer({ UMBRACO_BASE_URL: BASE_URL });
    withParentCheckedMajor(server, "18", BASE_URL);
    expect((server as any).env).toEqual({ UMBRACO_BASE_URL: BASE_URL });
  });
});
