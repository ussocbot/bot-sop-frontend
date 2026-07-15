const { readSession } = require("../lib/session");
const { getTenantToken } = require("../lib/feishu");

function imageTypeFromRequest(req, upstreamType) {
  if (String(upstreamType || "").toLowerCase().startsWith("image/")) return upstreamType;
  const supplied = String(req.query?.mime_type || "").toLowerCase();
  if (/^image\/[a-z0-9.+-]+$/.test(supplied)) return supplied;
  const name = String(req.query?.name || "").toLowerCase();
  const types = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".svg": "image/svg+xml"
  };
  return Object.entries(types).find(([extension]) => name.endsWith(extension))?.[1] || "";
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = async function media(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Cache-Control", "private, no-store");
  const sessionSecret = process.env.SESSION_SECRET;
  const session = sessionSecret ? readSession(req, sessionSecret) : null;
  if (!session) return res.status(401).json({ error: "Feishu sign-in required" });

  const fileToken = String(req.query?.file_token || "");
  if (!/^[A-Za-z0-9_-]{6,240}$/.test(fileToken)) {
    return res.status(400).json({ error: "Invalid media token" });
  }

  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  const apiOrigin = process.env.FEISHU_API_ORIGIN || "https://open.feishu.cn";
  if (!appId || !appSecret) return res.status(500).json({ error: "Feishu media access is not configured" });

  try {
    const tenantToken = await getTenantToken({ apiOrigin, appId, appSecret });
    const authorization = { Authorization: `Bearer ${tenantToken}` };
    let response = await fetchWithTimeout(
      `${apiOrigin}/open-apis/drive/v1/medias/${encodeURIComponent(fileToken)}/download`,
      { headers: authorization, redirect: "follow" }
    );

    if (!response.ok) {
      const temporaryUrlResponse = await fetchWithTimeout(
        `${apiOrigin}/open-apis/drive/v1/medias/batch_get_tmp_download_url?file_tokens=${encodeURIComponent(fileToken)}`,
        { headers: authorization }
      );
      if (temporaryUrlResponse.ok) {
        const payload = await temporaryUrlResponse.json().catch(() => ({}));
        const entries = payload?.data?.tmp_download_urls || payload?.data?.tmp_download_url || [];
        const temporaryUrl = (Array.isArray(entries) ? entries : [entries])
          .find(entry => entry?.file_token === fileToken || entry?.fileToken === fileToken)?.tmp_download_url ||
          (Array.isArray(entries) ? entries : [entries])[0]?.tmp_download_url;
        if (temporaryUrl) response = await fetchWithTimeout(temporaryUrl, { redirect: "follow" });
      }
    }

    if (!response.ok) {
      console.error("Media download failed", { status: response.status, fileToken: fileToken.slice(0, 8) });
      return res.status(response.status === 404 ? 404 : 502).json({ error: "Unable to retrieve this image" });
    }

    const contentType = imageTypeFromRequest(req, response.headers.get("content-type"));
    if (!contentType) return res.status(415).json({ error: "This attachment is not a supported image" });

    const data = Buffer.from(await response.arrayBuffer());
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", String(data.length));
    res.setHeader("Cache-Control", "private, max-age=300");
    res.setHeader("Content-Disposition", "inline");
    return res.status(200).send(data);
  } catch (error) {
    console.error("Media proxy failed", { message: error.message });
    return res.status(502).json({ error: "Unable to retrieve this image" });
  }
};
