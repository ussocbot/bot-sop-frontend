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

function withExtra(url, extra) {
  if (!extra) return url;
  const parsed = new URL(url);
  if (!parsed.searchParams.has("extra")) parsed.searchParams.set("extra", extra);
  return parsed.toString();
}

async function diagnostic(response) {
  if (!response) return {};
  try {
    const body = await response.clone().json();
    return { status: response.status, code: body?.code, message: body?.msg || body?.message };
  } catch (error) {
    return { status: response.status };
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
  const extra = String(req.query?.extra || "");
  if (!/^[A-Za-z0-9_-]{6,240}$/.test(fileToken)) {
    return res.status(400).json({ error: "Invalid media token" });
  }
  if (extra.length > 12000 || /[\u0000-\u001f\u007f]/.test(extra)) {
    return res.status(400).json({ error: "Invalid media authorization" });
  }

  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  const apiOrigin = process.env.FEISHU_API_ORIGIN || "https://open.feishu.cn";
  if (!appId || !appSecret) return res.status(500).json({ error: "Feishu media access is not configured" });

  try {
    const tenantToken = await getTenantToken({ apiOrigin, appId, appSecret });
    const authorization = { Authorization: `Bearer ${tenantToken}` };
    const directUrl = withExtra(
      `${apiOrigin}/open-apis/drive/v1/medias/${encodeURIComponent(fileToken)}/download`,
      extra
    );
    let response = await fetchWithTimeout(directUrl, {
      headers: authorization,
      redirect: "follow"
    });
    const directFailure = response.ok ? null : await diagnostic(response);

    if (!response.ok) {
      const temporaryEndpoint = withExtra(
        `${apiOrigin}/open-apis/drive/v1/medias/batch_get_tmp_download_url?file_tokens=${encodeURIComponent(fileToken)}`,
        extra
      );
      const temporaryUrlResponse = await fetchWithTimeout(temporaryEndpoint, { headers: authorization });
      const temporaryFailure = temporaryUrlResponse.ok ? null : await diagnostic(temporaryUrlResponse);

      if (temporaryUrlResponse.ok) {
        const payload = await temporaryUrlResponse.json().catch(() => ({}));
        const entries = payload?.data?.tmp_download_urls || payload?.data?.tmp_download_url || [];
        const list = Array.isArray(entries) ? entries : [entries];
        const matching = list.find(entry => entry?.file_token === fileToken || entry?.fileToken === fileToken) || list[0];
        const temporaryUrl = matching?.tmp_download_url || matching?.tmpUrl || matching?.url;
        if (temporaryUrl) {
          response = await fetchWithTimeout(withExtra(temporaryUrl, extra), { redirect: "follow" });
          if (!response.ok) {
            response = await fetchWithTimeout(withExtra(temporaryUrl, extra), {
              headers: authorization,
              redirect: "follow"
            });
          }
        }
      }

      if (!response.ok) {
        const finalFailure = await diagnostic(response);
        console.error("Media download failed", {
          fileToken: fileToken.slice(0, 8),
          hasExtra: Boolean(extra),
          direct: directFailure,
          temporary: temporaryFailure,
          final: finalFailure
        });
        const permissionFailure = [directFailure?.status, temporaryFailure?.status, finalFailure?.status]
          .some(status => status === 400 || status === 401 || status === 403);
        return res.status(permissionFailure ? 403 : (response.status === 404 ? 404 : 502)).json({
          error: permissionFailure
            ? "The app cannot download this attachment. Check Feishu attachment permissions."
            : "Unable to retrieve this image"
        });
      }
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
    console.error("Media proxy failed", {
      message: error.message,
      fileToken: fileToken.slice(0, 8),
      hasExtra: Boolean(extra)
    });
    return res.status(502).json({ error: "Unable to retrieve this image" });
  }
};


