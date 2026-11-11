/**
 * Shared HostedMcpServerOptions for the Cloudflare Worker and the Azure Node host.
 *
 * Azure calls this with no extras and stays single-tenant.
 * The Worker passes Cloud `/at/{alias}/` routing and telemetry through `extras`.
 */

import type {
  ChainedServerConsentConfig,
  HostedMcpServerOptions,
} from "@umbraco-cms/mcp-hosted";
import { collections, allModes, allModeNames, allSliceNames } from "../collections.js";
import { SERVER_INSTRUCTIONS } from "../server-instructions.js";
import {
  getLoadedCmsCollections,
} from "../umbraco-api/cms-collections-loader.js";
import packageJson from "../../package.json" with { type: "json" };

const cmsChainedServer: ChainedServerConsentConfig = {
  name: "cms",
  displayName: "umbraco-cms-mcp",
  get modeRegistry() {
    return getLoadedCmsCollections().allModes;
  },
  get collections() {
    return getLoadedCmsCollections().collections;
  },
  get allModeNames() {
    return getLoadedCmsCollections().allModeNames;
  },
  get allSliceNames() {
    return getLoadedCmsCollections().allSliceNames;
  },
};

export function createEditorHostedOptions(
  extras?: Partial<HostedMcpServerOptions>,
): HostedMcpServerOptions {
  return {
    name: "umbraco-cms-editor-mcp-hosted",
    version: packageJson.version,
    // This package's major tracks the Umbraco major it targets (18.x on
    // dev/main, 17.x on v17/*). Tags every span with umbraco.mcp.umbraco_major
    // and enables the hosted version check, which folds a mismatch warning into
    // the request's instructions (never blocks). `env.UMBRACO_EXPECTED_MAJOR`
    // overrides it per deployment.
    expectedUmbracoMajor: packageJson.version.split(".")[0],
    instructions: SERVER_INSTRUCTIONS,
    collections,
    modeRegistry: allModes,
    allModeNames,
    allSliceNames,
    enableConsentToolSelection: false,
    authOptions: { showReauthButton: true },
    chainedServers: [cmsChainedServer],
    ...extras,
  };
}
