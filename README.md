# umbraco-mcp-editor-cms

MCP server template for Umbraco add-ons using the @umbraco-cms/mcp-server-sdk.

## Getting Started

### Node Prerequisites

- **Node.js 22+** is required. Check your version with `node --version`.

### 1. Install Dependencies

```bash
npm install
```

On first clone, run `npm run umbraco:bootstrap` to create `demo-site/` from `demo-site-template/`. Then start the CMS with `npm run start:umbraco`.

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your Umbraco connection details:

```bash
cp .env.example .env
```

### 3. Generate API Client (Optional)

If you have an OpenAPI spec for your add-on:

1. Update `orval.config.ts` to point to your spec
2. Run the generator:

```bash
npm run generate
```

### 4. Build and Test

```bash
# Build the server
npm run build

# Run tests
npm test

# Test with MCP Inspector
npm run inspect
```

## Project Structure

```
├── src/
│   ├── api/
│   │   ├── client.ts           # Axios client configuration
│   │   └── generated/          # Orval-generated API code
│   ├── tools/
│   │   └── example/            # Example tool collection
│   │       ├── get/
│   │       ├── post/
│   │       └── index.ts
│   └── index.ts                # Server entry point
├── scripts/
│   └── tunnels.sh              # Cloudflare tunnels for remote MCP client testing
├── umbraco/
│   └── McpOAuthComposer.cs     # OAuth client registration (copy into your Umbraco project)
├── __tests__/
│   └── example/                # Example tests
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── jest.config.ts
├── orval.config.ts
└── .env.example
```

## Adding Your Own Tools

1. Create a new folder under `src/tools/` for your tool collection
2. Create tool files following the example pattern:
   - `get/` for GET operations
   - `post/` for POST operations
   - `put/` for PUT operations
   - `delete/` for DELETE operations
3. Create an `index.ts` that exports the collection
4. Register the collection in `src/index.ts`

### Tool Pattern Example

```typescript
import { z } from "zod";
import {
  withStandardDecorators,
  executeGetApiCall,
  CAPTURE_RAW_HTTP_RESPONSE,
  ToolDefinition,
} from "@umbraco-cms/mcp-server-sdk";

const inputSchema = {
  id: z.string().uuid(),
};

const myTool: ToolDefinition<typeof inputSchema> = {
  name: "my-tool",
  description: "Does something useful",
  inputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ id }) => {
    return executeGetApiCall((client) =>
      client.getMyItem(id, CAPTURE_RAW_HTTP_RESPONSE)
    );
  },
};

export default withStandardDecorators(myTool);
```

## Testing

Tests use Jest with the MCP toolkit's testing helpers:

```typescript
import {
  setupTestEnvironment,
  createSnapshotResult,
  createMockRequestHandlerExtra,
} from "@umbraco-cms/mcp-server-sdk/testing";

describe("my-tool", () => {
  setupTestEnvironment();

  it("should do something", async () => {
    const result = await myTool.handler({ id: "..." }, createMockRequestHandlerExtra());
    expect(createSnapshotResult(result)).toMatchSnapshot();
  });
});
```

## Hosted Worker (Cloudflare)

`src/worker.ts` is the entry point for the hosted Cloudflare Worker deployment. It wires `umbracoCloudSiteRouting` unconditionally; the library decides per request whether to engage multi-tenant routing by reading `siteRouting.enabled?(env)`.

The Cloud preset gates engagement on a single env var:

```toml
# wrangler.toml
[vars]
UMBRACO_CLOUD_ROUTING_ENABLED = "true"  # multi-tenant: /at/{alias}/ + per-request URLs
```

- Set `UMBRACO_CLOUD_ROUTING_ENABLED = "true"` in `wrangler.toml [vars]` to flip the Worker into multi-tenant Cloud mode — no source edit required.
- Leave it unset (or set to anything else) for single-tenant deployments that honor `UMBRACO_BASE_URL`.

Each Cloud project served by a multi-tenant Worker must register an OpenIddict client with id `umbraco-cms-editor-mcp-hosted` (the per-MCP-type identity baked into `worker.ts`).

## Publishing

1. Update `package.json` with your package name and details
2. Build: `npm run build`
3. Publish: `npm publish`

## License

MIT
