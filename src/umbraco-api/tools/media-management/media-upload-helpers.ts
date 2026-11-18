/**
 * Rewrites known cloud-share URL shapes into their direct-download equivalent
 * before a URL is handed to the chained `create-media` tool.
 *
 * This server never fetches `fileUrl` itself — the chained CMS tool does the
 * actual HTTP request. So this is a pure string transform with no network
 * calls: it only recognises a handful of Google Drive share/view/uc URL
 * shapes and rewrites them to the modern `drive.usercontent.google.com`
 * download endpoint. Anything it doesn't recognise (including other hosts
 * such as Dropbox or OneDrive) passes through unchanged.
 */

const GOOGLE_DRIVE_HOSTNAME = "drive.google.com";

export function normalizeFileUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return rawUrl;
  }

  if (url.hostname !== GOOGLE_DRIVE_HOSTNAME) return rawUrl;

  // https://drive.google.com/file/d/<id>/view?usp=sharing
  // pathname segments come back percent-encoded (unlike searchParams.get,
  // which decodes automatically) — decode here so both branches feed
  // buildDriveDownloadUrl a raw id and it can encode it exactly once.
  const fileMatch = url.pathname.match(/^\/file\/d\/([^/]+)/);
  if (fileMatch) return buildDriveDownloadUrl(decodeURIComponent(fileMatch[1]));

  // https://drive.google.com/open?id=<id>
  // https://drive.google.com/uc?id=<id>
  if (url.pathname === "/open" || url.pathname === "/uc") {
    const id = url.searchParams.get("id");
    if (id) return buildDriveDownloadUrl(id);
  }

  return rawUrl;
}

function buildDriveDownloadUrl(id: string): string {
  return `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download`;
}
