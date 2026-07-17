const { readSession } = require("./session");
const { getTenantToken, fetchTableRecords } = require("./feishu");

function normalize(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function findField(fields, names) {
  const entries = Object.entries(fields || {});
  for (const name of names) {
    if (fields?.[name] !== undefined) return fields[name];
    const match = entries.find(([key]) => normalize(key) === normalize(name));
    if (match) return match[1];
  }
  return null;
}

function textValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join(", ");
  if (typeof value === "object") {
    return textValue(value.text ?? value.name ?? value.label ?? value.value ?? value.id ?? "");
  }
  return "";
}

function boolValue(value) {
  if (typeof value === "boolean") return value;
  return ["true", "yes", "1", "active", "enabled"].includes(normalize(textValue(value)));
}

function collectUserIds(value) {
  const ids = new Set();
  function visit(entry) {
    if (!entry) return;
    if (Array.isArray(entry)) return entry.forEach(visit);
    if (typeof entry === "string") {
      if (/^(ou_|on_|user_|u_)/i.test(entry)) ids.add(entry);
      return;
    }
    if (typeof entry !== "object") return;
    [entry.id, entry.open_id, entry.openId, entry.user_id, entry.userId].forEach(visit);
    Object.values(entry).forEach(nested => {
      if (nested !== entry) visit(nested);
    });
  }
  visit(value);
  return [...ids];
}

async function getSubmissionAccess(req) {
  const sessionSecret = process.env.SESSION_SECRET;
  const session = sessionSecret ? readSession(req, sessionSecret) : null;
  if (!session?.openId) {
    const error = new Error("Feishu sign-in required");
    error.status = 401;
    throw error;
  }

  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  const appToken = process.env.FEISHU_BASE_APP_TOKEN;
  const tableId = process.env.FEISHU_SUBMISSION_ACCESS_TABLE_ID;
  const viewId = process.env.FEISHU_SUBMISSION_ACCESS_VIEW_ID;
  const apiOrigin = process.env.FEISHU_API_ORIGIN || "https://open.feishu.cn";

  if (!tableId) {
    return {
      configured: false,
      session,
      canSubmitResources: false,
      canSubmitUpdates: false
    };
  }
  if (!appId || !appSecret || !appToken) {
    const error = new Error("Submission access is not configured");
    error.status = 500;
    throw error;
  }

  const tenantToken = await getTenantToken({ apiOrigin, appId, appSecret });
  const records = await fetchTableRecords({ apiOrigin, tenantToken, appToken, tableId, viewId });
  const accessRecord = records.find(record => {
    const fields = record.fields || {};
    const userIds = collectUserIds(findField(fields, ["User"]));
    return boolValue(findField(fields, ["Active"])) && userIds.includes(session.openId);
  });
  const fields = accessRecord?.fields || {};

  return {
    configured: true,
    session,
    tenantToken,
    apiOrigin,
    appToken,
    canSubmitResources: Boolean(accessRecord && boolValue(findField(fields, ["Can Submit Resources"]))),
    canSubmitUpdates: Boolean(accessRecord && boolValue(findField(fields, ["Can Submit Updates", "Can Submit SOP Updates"])))
  };
}

module.exports = {
  getSubmissionAccess,
  findField,
  textValue,
  boolValue,
  collectUserIds
};
