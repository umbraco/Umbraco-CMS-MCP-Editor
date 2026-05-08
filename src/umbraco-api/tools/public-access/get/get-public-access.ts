import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the content page to read public access settings for"),
};

const outputSchema = z.object({
  hasRestrictions: z.boolean().describe("True if the page has public access rules configured"),
  memberGroups: z.array(z.object({
    id: z.string(),
    name: z.string(),
  })).describe("Member groups allowed to view the page"),
  memberUserNames: z.array(z.string()).describe("Specific member usernames allowed to view the page"),
  loginPageId: z.string().nullable().describe("The ID of the page visitors are redirected to when they need to log in"),
  errorPageId: z.string().nullable().describe("The ID of the page shown when an authenticated visitor is denied access"),
  message: z.string().describe("Human-readable summary of the access rules"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "get-public-access",
  description: "Read the public access (member-group restriction) settings for a content page. Returns the member groups, members, login page, and error page configured via the 'Public Access…' entity action. If the page has no restrictions, returns hasRestrictions: false.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ id }) => {
    const result = await chainCms("get-document-public-access", { id });

    if (!result.ok) {
      // No restrictions configured returns 404 from the CMS — treat as "no rules"
      return createToolResult({
        hasRestrictions: false,
        memberGroups: [],
        memberUserNames: [],
        loginPageId: null,
        errorPageId: null,
        message: "No public access restrictions are configured for this page.",
      });
    }

    const groups = (result.data.groups ?? []).map((g) => ({ id: g.id, name: g.name }));
    const memberUserNames = result.data.members
      .map((m) => m.variants?.[0]?.name ?? "")
      .filter((n) => n.length > 0);
    const loginPageId = result.data.loginDocument?.id ?? null;
    const errorPageId = result.data.errorDocument?.id ?? null;

    const summaryParts: string[] = [];
    if (groups.length > 0) summaryParts.push(`groups: ${groups.map((g: { name: string }) => g.name).join(", ")}`);
    if (memberUserNames.length > 0) summaryParts.push(`members: ${memberUserNames.join(", ")}`);
    const message = summaryParts.length > 0
      ? `Public access restricted to ${summaryParts.join("; ")}.`
      : "Public access settings are present but grant access to no member groups or members.";

    return createToolResult({
      hasRestrictions: true,
      memberGroups: groups,
      memberUserNames,
      loginPageId,
      errorPageId,
      message,
    });
  },
};

export default withStandardDecorators(tool);
