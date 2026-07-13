async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
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

async function getTenantToken({ apiOrigin, appId, appSecret }) {
  const tokenBody = await fetchJson(
    `${apiOrigin}/open-apis/auth/v3/tenant_access_token/internal`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret })
    }
  );
  if (!tokenBody.tenant_access_token) throw new Error("Feishu did not return a tenant access token");
  return tokenBody.tenant_access_token;
}

async function fetchTableRecords({ apiOrigin, tenantToken, appToken, tableId, viewId }) {
  const records = [];
  let pageToken = "";
  let pageCount = 0;

  do {
    const url = new URL(
      `/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}` +
      `/tables/${encodeURIComponent(tableId)}/records`,
      apiOrigin
    );
    url.searchParams.set("page_size", "500");
    if (viewId) url.searchParams.set("view_id", viewId);
    if (pageToken) url.searchParams.set("page_token", pageToken);

    const page = await fetchJson(url, {
      headers: {
        Authorization: `Bearer ${tenantToken}`,
        "Content-Type": "application/json; charset=utf-8"
      }
    });
    records.push(...(page.data?.items || []));
    pageToken = page.data?.has_more ? (page.data.page_token || "") : "";
    pageCount += 1;
  } while (pageToken && pageCount < 20);

  return records;
}

module.exports = { fetchJson, getTenantToken, fetchTableRecords };
