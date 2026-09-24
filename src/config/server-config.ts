/**
 * Server Configuration
 *
 * This module demonstrates how to extend the base Umbraco MCP config
 * with custom configuration fields specific to your MCP server.
 *
 * Custom fields support:
 * - string: Simple string values
 * - boolean: True/false flags
 * - csv: Comma-separated values parsed into arrays
 * - csv-path: Comma-separated paths, resolved to absolute paths
 */

import {
  getServerConfig,
  type ConfigFieldDefinition,
  type UmbracoServerConfig,
} from "@umbraco-cms/mcp-server-sdk";

// ============================================================================
// Custom Config Interface
// ============================================================================

/**
 * Custom configuration specific to this MCP server.
 * Define your own fields here - they will be parsed from CLI args or env vars.
 */
export interface MyServerCustomConfig {
  /** Disable MCP server chaining (useful for testing or isolated deployments) */
  disableMcpChaining?: boolean;
  /** Force the human-in-the-loop publish/unpublish/delete gate closed (CLI-only; see helpers/human-in-the-loop.ts) */
  humanInTheLoop?: boolean;
}

// ============================================================================
// Custom Field Definitions
// ============================================================================

/**
 * Define additional config fields for this server.
 * Each field automatically gets:
 * - A CLI argument (--my-experimental-features)
 * - An environment variable (MY_EXPERIMENTAL_FEATURES)
 * - Automatic parsing based on type
 */
const customFields: ConfigFieldDefinition[] = [
  {
    name: "disableMcpChaining",
    envVar: "DISABLE_MCP_CHAINING",
    cliFlag: "disable-mcp-chaining",
    type: "boolean",
  },
  {
    name: "humanInTheLoop",
    envVar: "UMBRACO_HUMAN_IN_THE_LOOP",
    cliFlag: "umbraco-human-in-the-loop",
    type: "boolean",
  },
];

// ============================================================================
// Config Loading
// ============================================================================

export interface ServerConfig {
  /** Base Umbraco MCP configuration */
  umbraco: UmbracoServerConfig;
  /** Custom configuration for this server */
  custom: MyServerCustomConfig;
}

let cachedConfig: ServerConfig | null = null;

/**
 * Load server configuration from CLI arguments and environment variables.
 *
 * @param isStdioMode - Whether the server is running in stdio mode (suppresses logging)
 * @returns Combined base and custom configuration
 *
 * @example
 * ```typescript
 * const { umbraco, custom } = loadServerConfig(true);
 *
 * // Access base Umbraco config
 * console.log(umbraco.auth.baseUrl);
 * console.log(umbraco.readonly);
 *
 * // Access custom config
 * if (custom.experimentalFeatures) {
 *   enableExperimentalFeatures();
 * }
 * ```
 */
export async function loadServerConfig(isStdioMode: boolean): Promise<ServerConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }

  const { config, custom } = await getServerConfig(isStdioMode, {
    additionalFields: customFields,
  });

  cachedConfig = {
    umbraco: config,
    custom: custom as MyServerCustomConfig,
  };

  return cachedConfig;
}

/**
 * Clear cached config (useful for testing)
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}

/**
 * Get the custom field definitions (useful for testing/documentation)
 */
export function getCustomFieldDefinitions(): ConfigFieldDefinition[] {
  return [...customFields];
}
