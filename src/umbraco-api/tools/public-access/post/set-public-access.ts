import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition, confirmAction } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the content page to restrict"),
  memberGroupNames: z.array(z.string()).describe("Names of member groups allowed to view the page. Use list-member-groups to look up existing groups."),
  loginPageId: z.string().uuid().describe("The ID of the page visitors are redirected to when login is required"),
  errorPageId: z.string().uuid().describe("The ID of the page shown when an authenticated visitor is denied access"),
  memberUserNames: z.array(z.string()).optional().describe("Optional: specific member usernames allowed to view the page (in addition to group members)"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  memberGroupNames: z.array(z.string()),
  memberUserNames: z.array(z.string()),
  loginPageId: z.string(),
  errorPageId: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "set-public-access",
  description: "Restrict a content page to members of specific groups (or specific members), redirecting unauthenticated visitors to a login page. Equivalent to the 'Public Access…' entity action in the Umbraco backoffice. Creates new rules on first call, updates them on subsequent calls. You will be asked to confirm.",
  inputSchema,
  outputSchema,
  slices: ["update"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async ({ id, memberGroupNames, loginPageId, errorPageId, memberUserNames }, extra) => {
    const memberNames = memberUserNames ?? [];

    // Check for existing rules so we know whether to POST (create) or PUT (update)
    const existingResult = await chainCms("get-document-public-access", { id });
    const hasExisting = existingResult.ok;

    const groupList = memberGroupNames.length > 0 ? memberGroupNames.join(", ") : "(no groups)";
    const action = hasExisting ? "Update" : "Set";
    const confirmMessage = `${action} public access on this page? Allowed groups: ${groupList}. Login page: ${loginPageId}. Error page: ${errorPageId}. Unauthenticated visitors will be redirected.`;

    if (!await confirmAction(extra, confirmMessage, { title: `Confirm ${action.toLowerCase()} public access`, defaultValue: false })) {
      return createToolResult({
        message: `${action} cancelled`,
        id,
        memberGroupNames,
        memberUserNames: memberNames,
        loginPageId,
        errorPageId,
      });
    }

    const data = {
      loginDocument: { id: loginPageId },
      errorDocument: { id: errorPageId },
      memberGroupNames,
      memberUserNames: memberNames,
    };
    const writeResult = hasExisting
      ? await chainCms("put-document-public-access", { id, data })
      : await chainCms("post-document-public-access", { id, data });

    if (!writeResult.ok) return writeResult.errorResult;

    // Call is void — just echo what was set
    return createToolResult({
      message: hasExisting ? "Updated public access settings" : "Set public access settings",
      id,
      memberGroupNames,
      memberUserNames: memberNames,
      loginPageId,
      errorPageId,
    });
  },
};

export default withStandardDecorators(tool);
