/**
 * Chained CMS server TLS env (#274)
 *
 * The chained SDK refuses to start when NODE_TLS_REJECT_UNAUTHORIZED=0 is set
 * for a non-loopback base URL, so we must only set it for local Umbraco.
 */

import { describe, it, expect } from "@jest/globals";
import { chainedTlsEnv } from "../mcp-servers.js";

describe("chainedTlsEnv", () => {
  it.each([
    "https://localhost:44391",
    "http://127.0.0.1:5000",
    "https://[::1]:44391",
  ])("disables TLS verification for loopback %s", (baseUrl) => {
    expect(chainedTlsEnv(baseUrl)).toEqual({ NODE_TLS_REJECT_UNAUTHORIZED: "0" });
  });

  it.each([
    "https://example.euwest01.umbraco.io",
    "https://www.example.com",
    "not a url",
  ])("leaves TLS verification on for %s", (baseUrl) => {
    expect(chainedTlsEnv(baseUrl)).toEqual({});
  });
});
