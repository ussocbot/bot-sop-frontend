const { fetchJson } = require("../lib/feishu");
const { getSubmissionAccess } = require("../lib/submission-access");

const MAX_BYTES = 3 * 1024 * 1024;
const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp"
]);

function bodyOf(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}

function safeName(value) {
  const name = String(value || "screenshot").replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 120);
  return name || "screenshot";
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const access = await getSubmissionAccess(req);
    const body = bodyOf(req);
    const kind = String(body.kind || "").toLowerCase();
    const allowed = kind === "resource"
      ? access.canSubmitResources
      : ["sop", "update"].includes(kind)
        ? access.canSubmitUpdates
        : kind === "review"
          ? access.canReviewUpdates
          : false;
    if (!allowed) return res.status(403).json({ error: "You do not have permission to upload this file." });

    const mimeType = String(body.mimeType || "").toLowerCase();
    if (!IMAGE_TYPES.has(mimeType)) {
      return res.status(400).json({ error: "Please upload a PNG, JPG, GIF, WEBP, or BMP image." });
    }

    const encoded = String(body.data || "").replace(/^data:[^;]+;base64,/, "");
    if (!encoded || !/^[A-Za-z0-9+/=\r\n]+$/.test(encoded)) {
      return res.status(400).json({ error: "The selected image could not be read." });
    }
    const bytes = Buffer.from(encoded, "base64");
    if (!bytes.length || bytes.length > MAX_BYTES) {
      return res.status(413).json({ error: "Each screenshot must be 3 MB or smaller." });
    }

    const form = new FormData();
    form.append("file_name", safeName(body.name));
    form.append("parent_type", "bitable_file");
    form.append("parent_node", access.appToken);
    form.append("size", String(bytes.length));
    form.append("file", new Blob([bytes], { type: mimeType }), safeName(body.name));

    const result = await fetchJson(`${access.apiOrigin}/open-apis/drive/v1/medias/upload_all`, {
      method: "POST",
      headers: { Authorization: `Bearer ${access.tenantToken}` },
      body: form
    });
    const fileToken = result.data?.file_token;
    if (!fileToken) throw new Error("Feishu did not return an attachment token");
    return res.status(200).json({ fileToken });
  } catch (error) {
    console.error("Submission screenshot upload failed", error);
    return res.status(error.status || 500).json({
      error: error.status === 401
        ? "Please sign in with Feishu before uploading."
        : "Unable to upload this screenshot. Check the app's file upload permission and try again."
    });
  }
};
