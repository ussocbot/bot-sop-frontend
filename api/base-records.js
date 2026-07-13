const { readSession } = require("../lib/session");
const { getTenantToken, fetchTableRecords } = require("../lib/feishu");

module.exports = async function baseRecords(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Cache-Control", "private, no-store");
  const sessionSecret = process.env.SESSION_SECRET;
  const session = sessionSecret ? readSession(req, sessionSecret) : null;
  if (!session) return res.status(401).json({ error: "Feishu sign-in required" });

  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  const appToken = process.env.FEISHU_BASE_APP_TOKEN;
  const tableId = process.env.FEISHU_TABLE_ID;
  const viewId = process.env.FEISHU_VIEW_ID;
  const documentationTableId = process.env.FEISHU_DOCUMENTATION_TABLE_ID || "tbljdoFsgOuHMGSO";
  const documentationViewId = process.env.FEISHU_DOCUMENTATION_VIEW_ID || "vewyqW3oZ3";
  const apiOrigin = process.env.FEISHU_API_ORIGIN || "https://open.feishu.cn";

  if (!appId || !appSecret || !appToken || !tableId) {
    return res.status(500).json({ error: "Base connection is not configured" });
  }

  try {
    const tenantToken = await getTenantToken({ apiOrigin, appId, appSecret });
    const [records, documentationRecords] = await Promise.all([
      fetchTableRecords({ apiOrigin, tenantToken, appToken, tableId, viewId }),
      fetchTableRecords({
        apiOrigin,
        tenantToken,
        appToken,
        tableId: documentationTableId,
        viewId: documentationViewId
      })
    ]);

    return res.status(200).json({
      records,
      documentationRecords,
      meta: {
        count: records.length,
        documentationCount: documentationRecords.length,
        signedInAs: session.name
      }
    });
  } catch (error) {
    console.error("Base request failed", {
      message: error.message,
      status: error.status,
      feishuCode: error.feishuCode
    });
    return res.status(502).json({
      error: "Unable to retrieve the Feishu Base records",
      feishuCode: error.feishuCode || null
    });
  }
};
