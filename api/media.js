const { readSession } = require("../lib/session");
const { getTenantToken } = require("../lib/feishu");

module.exports = async function media(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const sessionSecret = process.env.SESSION_SECRET;
  const session = sessionSecret ? readSession(req, sessionSecret) : null;
  if (!session) return res.status(401).json({ error: "Feishu sign-in required" });

  const fileToken = String(req.query?.file_token || "");
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(fileToken)) {
    return res.status(400).json({ error: "Invalid media token" });
  }

  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  const apiOrigin = process.env.FEISHU_API_ORIGIN || "https://open.feishu.cn";
  if (!appId || !appSecret) return res.status(500).json({ error: "Feishu media access is not configured" });

  try {
    const tenantToken = await getTenantToken({ apiOrigin, appId, appSecret });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let response;
    try {
      response = await fetch(
        `${apiOrigin}/open-apis/drive/v1/medias/${encodeURIComponent(fileToken)}/download`,
        { headers: { Authorization: `Bearer ${tenantToken}` }, signal: controller.signal }
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      console.error("Media download failed", { status: response.status, fileToken: fileToken.slice(0, 8) });
      return res.status(response.status === 404 ? 404 : 502).json({ error: "Unable to retrieve this image" });
    }

    const contentType = response.headers.get("content-type") || "application/octet-stream";
    if (!contentType.startsWith("image/")) {
      return res.status(415).json({ error: "This attachment is not an image" });
    }
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
