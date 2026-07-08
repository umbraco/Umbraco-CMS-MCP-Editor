import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

const BASE64_MAX_KIB = 10;

const fileObjectSchema = z.object({
  download_url: z.string().describe("Temporary URL the host provides to fetch the file bytes"),
  file_id: z.string().describe("Persistent file identifier from the host"),
  mime_type: z.string().optional().describe("MIME type if the host knows it"),
  file_name: z.string().optional().describe("Original file name if the host knows it"),
});

const inputSchema = {
  sourceType: z.enum(["url", "file", "base64"]).describe(
    `Media source type: 'url' for public direct-download URLs (streamed; preferred for everything not already attached to the chat), 'file' for host-injected attachments — the connector populates the 'file' object automatically when the user attached a file or you generated one in this chat, 'base64' for TINY inline payloads only — the server rejects base64 above ${BASE64_MAX_KIB} KiB decoded to stop LLM-truncated or thumbnail-preview base64 from persisting as corrupt files`,
  ),
  name: z.string().describe("The name of the media item"),
  mediaTypeName: z.string().describe("Media type: 'Image', 'Article', 'Audio', 'Video', 'SVG', 'File', or custom media type name"),
  fileUrl: z.string().url().optional().describe("[raw] Public, direct-download URL to fetch the file from (required if sourceType is 'url'). Must be reachable without authentication. Share/viewer links (e.g. drive.google.com/file/d/<id>/view, Dropbox ?dl=0, OneDrive view URLs) must be converted to their direct-download equivalent first — Google Drive: drive.google.com/uc?export=download&id=<id>. Uploads are streamed, so multi-MB files round-trip without timing out."),
  file: fileObjectSchema.optional().describe(
    "[raw] Host-injected file object (required if sourceType is 'file'). ChatGPT's connector populates this automatically when the user attached a file or you generated one in this chat — leave it for the host to fill, do not synthesise it yourself.",
  ),
  fileAsBase64: z.string().optional().describe(`Base64-encoded file data (required if sourceType is 'base64'). HARD LIMIT: decoded payload must be ≤${BASE64_MAX_KIB} KiB; the server rejects anything larger because LLMs reliably truncate big base64 strings or substitute thumbnail previews, both producing corrupt files. Use sourceType='url' or 'file' for everything bigger.`),
  parentId: z.string().uuid().optional().describe("Parent folder ID (defaults to root)"),
};

const outputSchema = z.object({
  message: z.string(),
  name: z.string(),
  id: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "upload-media",
  description: `Upload any media file to Umbraco (images, documents, audio, video, SVG, or custom types).

  Pick the sourceType that matches where the file lives:
  - If the file is attached to this chat or you just generated it → sourceType="file" (the host fills in the file reference automatically).
  - If you have a public direct-download URL → sourceType="url".
  - For tiny inline payloads (≤${BASE64_MAX_KIB} KiB decoded) → sourceType="base64".

  Media Types:
  - Image: jpg, png, gif, webp, etc. (supports cropping)
  - Article: pdf, docx, doc (documents)
  - Audio: mp3, wav, etc.
  - Video: mp4, webm, etc.
  - SVG: svg files only
  - File: any other file type
  - Custom: any custom media type created in Umbraco

  Use create-media-folder first if you need to organise the upload into a specific folder, then pass that folder's id as parentId.`,
  inputSchema,
  outputSchema,
  slices: ["create"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  _meta: { "openai/fileParams": ["file"] },
  handler: async (args) => {
    const result = await chainCms("create-media", args);
    if (!result.ok) return result.errorResult;
    return createToolResult(result.data);
  },
};

export default withStandardDecorators(tool);
