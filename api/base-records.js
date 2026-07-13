const { readSession } = require("../lib/session");

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok || (typeof body.code === "number" && body.code !== 0)) {
      const error = new Error(body.msg || `Feishu request failed (${response.status})`);
      error.status = response.status;
      error.feishuCode = body.code;
      throw error;
    }

    return body;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = async function baseRecords(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Cache-Control", "private, no-store");

  const sessionSecret = process.env.SESSION_SECRET;
  const session = sessionSecret ? readSession(req, sessionSecret) : null;

  if (!session) {
    return res.status(401).json({ error: "Feishu sign-in required" });
  }

  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  const appToken = process.env.FEISHU_BASE_APP_TOKEN;
  const tableId = process.env.FEISHU_TABLE_ID;
  const viewId = process.env.FEISHU_VIEW_ID;

  if (!appId || !appSecret || !appToken || !tableId) {
    return res.status(500).json({ error: "Base connection is not configured" });
  }

  const apiOrigin = process.env.FEISHU_API_ORIGIN || "https://open.feishu.cn";

  try {
    const tokenBody = await fetchJson(
      `${apiOrigin}/open-apis/auth/v3/tenant_access_token/internal`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ app_id: appId, app_secret: appSecret })
      }
    );

    const tenantToken = tokenBody.tenant_access_token;
    if (!tenantToken) throw new Error("Feishu did not return a tenant access token");

    const records = [];
    let pageToken = "";
    let pageCount = 0;

    do {
      const recordsUrl = new URL(
        `/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}` +
        `/tables/${encodeURIComponent(tableId)}/records`,
        apiOrigin
      );

      recordsUrl.searchParams.set("page_size", "500");
      if (viewId) recordsUrl.searchParams.set("view_id", viewId);
      if (pageToken) recordsUrl.searchParams.set("page_token", pageToken);

      const page = await fetchJson(recordsUrl, {
        headers: {
          Authorization: `Bearer ${tenantToken}`,
          "Content-Type": "application/json; charset=utf-8"
        }
      });

      records.push(...(page.data?.items || []));
      pageToken = page.data?.has_more ? (page.data.page_token || "") : "";
      pageCount += 1;
    } while (pageToken && pageCount < 20);

    res.status(200).json({
      records,
      meta: {
        count: records.length,
        signedInAs: session.name
      }
    });
  } catch (error) {
    console.error("Base request failed", {
      message: error.message,
      status: error.status,
      feishuCode: error.feishuCode
    });

    res.status(502).json({
      error: "Unable to retrieve the Feishu Base records",
      feishuCode: error.feishuCode || null
    });
  }
};
