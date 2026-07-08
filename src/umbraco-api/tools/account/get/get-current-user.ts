import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

const inputSchema = {};

const outputSchema = z.object({
  id: z.string(),
  name: z.string(),
  userName: z.string(),
  email: z.string(),
  isAdmin: z.boolean().describe("True if the user is in the built-in Administrators group; admins bypass most permission checks"),
  userGroups: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      alias: z.string().nullable(),
    })
  ).describe("Groups the user belongs to — these grant the permissions and section access shown below"),
  allowedSections: z.array(z.string()).describe("Backoffice section aliases the user can open (content, media, settings, users, etc.)"),
  languages: z.array(z.string()).describe("Language ISO codes the user can edit. Empty when hasAccessToAllLanguages is true."),
  hasAccessToAllLanguages: z.boolean(),
  hasAccessToSensitiveData: z.boolean(),
  hasDocumentRootAccess: z.boolean().describe("True when the user can edit from the content root; false when limited to documentStartNodes"),
  hasMediaRootAccess: z.boolean().describe("True when the user can edit from the media root; false when limited to mediaStartNodes"),
  documentStartNodeIds: z.array(z.string()).describe("Content node IDs the user is restricted to. Empty when hasDocumentRootAccess is true."),
  mediaStartNodeIds: z.array(z.string()).describe("Media node IDs the user is restricted to. Empty when hasMediaRootAccess is true."),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "get-current-user",
  description: "Identify which Umbraco backoffice user the MCP server is authenticated as. Returns the user's name, email, admin flag, and resolved user-group names. Use this to confirm identity when permissions behave unexpectedly — e.g. an action fails or returns different data than expected, before assuming the API is broken.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async () => {
    const userResult = await chainCms("get-user-current", {});
    if (!userResult.ok) return userResult.errorResult;
    const user = userResult.data;

    const groupIds = user.userGroupIds.map((g) => g.id);
    let userGroups: { id: string; name: string; alias: string | null }[] = [];
    if (groupIds.length > 0) {
      const groupsResult = await chainCms("get-user-group-by-id-array", { id: groupIds });
      if (groupsResult.ok) {
        userGroups = groupsResult.data.items.map((g) => ({
          id: g.id,
          name: g.name,
          alias: g.alias ?? null,
        }));
      } else {
        // Fall back to bare IDs if group lookup fails — identity is still useful.
        userGroups = groupIds.map((id) => ({ id, name: id, alias: null }));
      }
    }

    return createToolResult({
      id: user.id,
      name: user.name,
      userName: user.userName,
      email: user.email,
      isAdmin: user.isAdmin,
      userGroups,
      allowedSections: user.allowedSections,
      languages: user.languages,
      hasAccessToAllLanguages: user.hasAccessToAllLanguages,
      hasAccessToSensitiveData: user.hasAccessToSensitiveData,
      hasDocumentRootAccess: user.hasDocumentRootAccess,
      hasMediaRootAccess: user.hasMediaRootAccess,
      documentStartNodeIds: user.documentStartNodeIds.map((n) => n.id),
      mediaStartNodeIds: user.mediaStartNodeIds.map((n) => n.id),
    });
  },
};

export default withStandardDecorators(tool);
