/**
 * Server Config Integration Tests
 *
 * Tests for the extensible config system using custom fields.
 * Demonstrates how consuming packages can add their own config fields.
 *
 * Note: These tests mock getServerConfig from the toolkit since
 * the toolkit's own tests verify the core config parsing works correctly.
 * These tests verify the server-config module's interface and caching.
 */

import { jest, describe, it, expect, beforeEach } from "@jest/globals";

// Mock the toolkit's getServerConfig before importing our module
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetServerConfig = jest.fn<(...args: any[]) => any>();
jest.unstable_mockModule("@umbraco-cms/mcp-server-sdk", () => ({
  getServerConfig: mockGetServerConfig,
}));

// Import our module after setting up mocks
const { loadServerConfig, clearConfigCache, getCustomFieldDefinitions } =
  await import("../server-config.js");

describe("Server Config", () => {
  beforeEach(() => {
    // Clear config cache and reset mocks before each test
    clearConfigCache();
    mockGetServerConfig.mockReset();
  });

  describe("loadServerConfig", () => {
    it("should return combined umbraco and custom config", async () => {
      mockGetServerConfig.mockResolvedValue({
        config: {
          auth: {
            clientId: "test-client",
            clientSecret: "test-secret",
            baseUrl: "http://localhost:5000",
          },
          readonly: true,
          configSources: {
            clientId: "env",
            clientSecret: "env",
            baseUrl: "env",
            readonly: "env",
            envFile: "default",
          },
        },
        custom: {
          disableMcpChaining: true,
        },
      });

      const { umbraco, custom } = await loadServerConfig(true);

      // Verify base config
      expect(umbraco.auth.clientId).toBe("test-client");
      expect(umbraco.auth.baseUrl).toBe("http://localhost:5000");
      expect(umbraco.readonly).toBe(true);

      // Verify custom config
      expect(custom.disableMcpChaining).toBe(true);
    });

    it("should pass isStdioMode to getServerConfig", async () => {
      mockGetServerConfig.mockResolvedValue({
        config: {
          auth: { clientId: "x", clientSecret: "x", baseUrl: "x" },
          configSources: { clientId: "env", clientSecret: "env", baseUrl: "env", envFile: "default" },
        },
        custom: {},
      });

      await loadServerConfig(true);
      expect(mockGetServerConfig).toHaveBeenCalledWith(true, expect.any(Object));

      clearConfigCache();
      await loadServerConfig(false);
      expect(mockGetServerConfig).toHaveBeenCalledWith(false, expect.any(Object));
    });

    it("should pass additionalFields to getServerConfig", async () => {
      mockGetServerConfig.mockResolvedValue({
        config: {
          auth: { clientId: "x", clientSecret: "x", baseUrl: "x" },
          configSources: { clientId: "env", clientSecret: "env", baseUrl: "env", envFile: "default" },
        },
        custom: {},
      });

      await loadServerConfig(true);

      expect(mockGetServerConfig).toHaveBeenCalledWith(
        true,
        expect.objectContaining({
          additionalFields: expect.arrayContaining([
            expect.objectContaining({ name: "disableMcpChaining" }),
          ]),
        })
      );
    });

    it("should cache config after first load", async () => {
      mockGetServerConfig.mockResolvedValue({
        config: {
          auth: { clientId: "cached", clientSecret: "x", baseUrl: "x" },
          configSources: { clientId: "env", clientSecret: "env", baseUrl: "env", envFile: "default" },
        },
        custom: { disableMcpChaining: true },
      });

      // First call
      const first = await loadServerConfig(true);
      expect(mockGetServerConfig).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      const second = await loadServerConfig(true);
      expect(mockGetServerConfig).toHaveBeenCalledTimes(1);

      // Both should return same data
      expect(first.umbraco.auth.clientId).toBe("cached");
      expect(second.umbraco.auth.clientId).toBe("cached");
      expect(first.custom.disableMcpChaining).toBe(true);
      expect(second.custom.disableMcpChaining).toBe(true);
    });

    it("should reload config after clearConfigCache", async () => {
      mockGetServerConfig
        .mockResolvedValueOnce({
          config: {
            auth: { clientId: "first", clientSecret: "x", baseUrl: "x" },
            configSources: { clientId: "env", clientSecret: "env", baseUrl: "env", envFile: "default" },
          },
          custom: {},
        })
        .mockResolvedValueOnce({
          config: {
            auth: { clientId: "second", clientSecret: "x", baseUrl: "x" },
            configSources: { clientId: "env", clientSecret: "env", baseUrl: "env", envFile: "default" },
          },
          custom: {},
        });

      const first = await loadServerConfig(true);
      expect(first.umbraco.auth.clientId).toBe("first");

      clearConfigCache();

      const second = await loadServerConfig(true);
      expect(second.umbraco.auth.clientId).toBe("second");
      expect(mockGetServerConfig).toHaveBeenCalledTimes(2);
    });
  });

  describe("custom config interface", () => {
    it("should handle undefined custom values", async () => {
      mockGetServerConfig.mockResolvedValue({
        config: {
          auth: { clientId: "x", clientSecret: "x", baseUrl: "x" },
          configSources: { clientId: "env", clientSecret: "env", baseUrl: "env", envFile: "default" },
        },
        custom: {},
      });

      const { custom } = await loadServerConfig(true);

      expect(custom.disableMcpChaining).toBeUndefined();
    });
  });

  describe("getCustomFieldDefinitions", () => {
    it("should return all custom field definitions", () => {
      const fields = getCustomFieldDefinitions();

      expect(fields).toHaveLength(1);
      expect(fields.map(f => f.name)).toEqual([
        "disableMcpChaining",
      ]);
    });

    it("should return field definitions with correct types", () => {
      const fields = getCustomFieldDefinitions();

      const chaining = fields.find(f => f.name === "disableMcpChaining");
      expect(chaining?.type).toBe("boolean");
      expect(chaining?.envVar).toBe("DISABLE_MCP_CHAINING");
      expect(chaining?.cliFlag).toBe("disable-mcp-chaining");
    });

    it("should return a copy to prevent mutation", () => {
      const fields1 = getCustomFieldDefinitions();
      const fields2 = getCustomFieldDefinitions();

      expect(fields1).not.toBe(fields2);
      expect(fields1).toEqual(fields2);
    });
  });
});
