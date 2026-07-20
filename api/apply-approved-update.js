const crypto = require("crypto");
const { fetchJson, getTenantToken } = require("../lib/feishu");

const RECORD_ID = /^rec[A-Za-z0-9_-]+$/;
const TRANSIENT_STATUSES = new Set([502, 503, 504]);

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function fetchFeishu(url, options) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await fetchJson(url, options);
    } catch (error) {
      const retryable = TRANSIENT_STATUSES.has(Number(error.status));
      if (!retryable || attempt === 2) throw error;
      await wait(500 * (2 ** attempt));
    }
  }
  throw new Error("Feishu request failed after retrying");
}

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

function textValue(value, seen = new Set()) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value !== "object" || seen.has(value)) return "";
  seen.add(value);
  if (Array.isArray(value)) return value.map(item => textValue(item, seen)).filter(Boolean).join(", ");
  return textValue(value.text ?? value.name ?? value.title ?? value.label ?? value.value ?? value.link ?? value.id ?? "", seen);
}

function boolValue(value) {
  if (typeof value === "boolean") return value;
  return ["true", "yes", "1", "checked"].includes(normalize(textValue(value)));
}

function linkedIds(value, found = new Set(), seen = new Set()) {
  if (!value || seen.has(value)) return [...found];
  if (typeof value === "string") {
    if (RECORD_ID.test(value)) found.add(value);
    return [...found];
  }
  if (typeof value !== "object") return [...found];
  seen.add(value);
  if (Array.isArray(value)) value.forEach(item => linkedIds(item, found, seen));
  else {
    [value.record_id, value.recordId, value.id].forEach(item => {
      if (typeof item === "string" && RECORD_ID.test(item)) found.add(item);
    });
    Object.values(value).forEach(item => linkedIds(item, found, seen));
  }
  return [...found];
}

function attachmentTokens(value, found = new Set(), seen = new Set()) {
  if (!value || seen.has(value)) return [...found];
  if (typeof value !== "object") return [...found];
  seen.add(value);
  if (Array.isArray(value)) value.forEach(item => attachmentTokens(item, found, seen));
  else {
    [value.file_token, value.fileToken, value.token].forEach(token => {
      if (typeof token === "string" && token) found.add(token);
    });
    Object.values(value).forEach(item => attachmentTokens(item, found, seen));
  }
  return [...found];
}

function deepUrl(value, seen = new Set()) {
  if (!value) return "";
  if (typeof value === "string") return value.match(/https?:\/\/[^\s<>\"]+/i)?.[0]?.replace(/[),.;!?]+$/, "") || "";
  if (typeof value !== "object" || seen.has(value)) return "";
  seen.add(value);
  for (const nested of Object.values(value)) {
    const found = deepUrl(nested, seen);
    if (found) return found;
  }
  return "";
}

function dateNumber(value, fallback = Date.now()) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = textValue(value);
  if (/^\d{10,13}$/.test(raw)) return raw.length === 10 ? Number(raw) * 1000 : Number(raw);
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function slug(value) {
  return String(value || "content").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "content";
}

function bodyOf(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}

function providedSecret(req, body) {
  const authorization = String(req.headers?.authorization || "");
  if (/^Bearer\s+/i.test(authorization)) return authorization.replace(/^Bearer\s+/i, "").trim();
  return String(req.headers?.["x-update-secret"] || req.query?.secret || body.secret || "");
}

function secretMatches(provided, expected) {
  if (!provided || !expected) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function getRecord(config, tableId, recordId) {
  const url = new URL(
    `/open-apis/bitable/v1/apps/${encodeURIComponent(config.appToken)}` +
    `/tables/${encodeURIComponent(tableId)}/records/${encodeURIComponent(recordId)}`,
    config.apiOrigin
  );
  url.searchParams.set("user_id_type", "open_id");
  const result = await fetchFeishu(url, { headers: { Authorization: `Bearer ${config.tenantToken}` } });
  return result.data?.record || result.data || null;
}

async function writeRecord(config, tableId, fields, recordId = "") {
  const suffix = recordId ? `/records/${encodeURIComponent(recordId)}` : "/records";
  const url = new URL(
    `/open-apis/bitable/v1/apps/${encodeURIComponent(config.appToken)}` +
    `/tables/${encodeURIComponent(tableId)}${suffix}`,
    config.apiOrigin
  );
  url.searchParams.set("user_id_type", "open_id");
  const result = await fetchFeishu(url, {
    method: recordId ? "PUT" : "POST",
    headers: {
      Authorization: `Bearer ${config.tenantToken}`,
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify({ fields })
  });
  return result.data?.record || result.data || {};
}

function proposedContent(fields) {
  const title = textValue(findField(fields, ["Proposed Content Name"]));
  const screenshots = attachmentTokens(findField(fields, ["Screenshots"]));
  const screenshotAction = textValue(findField(fields, ["Screenshot Action"])) || "Keep Existing";
  const liveFields = {
    "Content Name": title,
    "Content Summary": textValue(findField(fields, ["Proposed Content Summary"])),
    "Guidance": textValue(findField(fields, ["Proposed Guidance", "Proposed Instructions"])),
    "Closing Guidance": textValue(findField(fields, ["Proposed Closing Guidance"])),
    "Ticket Tag Display": textValue(findField(fields, ["Proposed Ticket Tag Display"])),
    "Update Date": Date.now()
  };
  if (screenshotAction === "Remove Existing") liveFields.Screenshots = [];
  if (screenshotAction === "Replace Existing" && screenshots.length) {
    liveFields.Screenshots = screenshots.map(fileToken => ({ file_token: fileToken }));
  }
  return { title, liveFields };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = bodyOf(req);
  const expectedSecret = process.env.UPDATE_APPLY_SECRET;
  if (!secretMatches(providedSecret(req, body), expectedSecret)) {
    return res.status(401).json({ error: "Invalid automation secret" });
  }

  const requestRecordId = String(body.recordId || body.record_id || "").trim();
  if (!RECORD_ID.test(requestRecordId)) return res.status(400).json({ error: "A valid request record ID is required" });

  const requestTableId = process.env.FEISHU_SOP_UPDATE_REQUESTS_TABLE_ID;
  const liveTableId = process.env.FEISHU_TABLE_ID;
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  const appToken = process.env.FEISHU_BASE_APP_TOKEN;
  const apiOrigin = process.env.FEISHU_API_ORIGIN || "https://open.feishu.cn";
  if (!expectedSecret || !requestTableId || !liveTableId || !appId || !appSecret || !appToken) {
    return res.status(500).json({ error: "Approved-update automation is not configured" });
  }

  const config = { apiOrigin, appToken, tenantToken: "" };
  try {
    config.tenantToken = await getTenantToken({ apiOrigin, appId, appSecret });
    const requestRecord = await getRecord(config, requestTableId, requestRecordId);
    if (!requestRecord) return res.status(404).json({ error: "Update request not found" });
    const fields = requestRecord.fields || {};
    if (normalize(textValue(findField(fields, ["Review Status"]))) !== "approved") {
      return res.status(409).json({ error: "This request is not approved" });
    }
    const currentApplyStatus = normalize(textValue(findField(fields, ["Apply Status"])));
    if (currentApplyStatus === "applied") {
      return res.status(200).json({ ok: true, alreadyApplied: true, recordId: linkedIds(findField(fields, ["Applied Record"]))[0] || "" });
    }
    if (currentApplyStatus === "applying") {
      return res.status(409).json({ error: "This request is already being applied" });
    }

    await writeRecord(config, requestTableId, { "Apply Status": "Applying", "Apply Error": "" }, requestRecordId);

    const updateType = textValue(findField(fields, ["Update Type"])) || "SOP Update";
    const submissionType = textValue(findField(fields, ["Submission Type"]));
    const sendNotification = boolValue(findField(fields, ["Send Notification"]));
    const { title, liveFields } = proposedContent(fields);
    if (!title) throw new Error("Proposed Content Name is blank");

    let liveRecord;
    if (updateType === "SOP Update") {
      const targetId = linkedIds(findField(fields, ["Verified Replacement Target"]))[0] ||
        linkedIds(findField(fields, ["Suggested Existing SOP"]))[0] || "";
      if (submissionType === "New SOP") {
        const category = textValue(findField(fields, ["Proposed Request Type"]));
        if (!category) throw new Error("A Left Nav category is required for a new SOP");
        const appearsIn = sendNotification ? [category, "SOP Updates"] : [category];
        Object.assign(liveFields, {
          "Record Key": `content-${slug(title)}-${Date.now().toString(36)}`,
          "Display Type": "Content",
          "Appears In": appearsIn,
          "Status": "Active",
          "Published": true
        });
        liveRecord = await writeRecord(config, liveTableId, liveFields);
      } else {
        if (!targetId) throw new Error("No verified or suggested SOP target was selected");
        if (sendNotification) {
          const currentTarget = await getRecord(config, liveTableId, targetId);
          const appearsIn = textValue(findField(currentTarget?.fields || {}, ["Appears In"])).split(",").map(value => value.trim()).filter(Boolean);
          liveFields["Appears In"] = [...new Set([...appearsIn, "SOP Updates"])];
        }
        liveRecord = await writeRecord(config, liveTableId, liveFields, targetId);
      }
    } else if (updateType === "Related Item Suggestion") {
      const targetId = linkedIds(findField(fields, ["Verified Replacement Target"]))[0] || linkedIds(findField(fields, ["Suggested Existing SOP"]))[0] || "";
      if (!targetId) throw new Error("No target SOP was selected for this suggestion");
      const relationType = textValue(findField(fields, ["Relation Suggestion Type"]));
      const currentTarget = await getRecord(config, liveTableId, targetId);
      const currentFields = currentTarget?.fields || {};
      if (relationType === "Existing Resource") {
        const resourceId = linkedIds(findField(fields, ["Suggested Related Resource"]))[0] || "";
        if (!resourceId) throw new Error("No Resource Hub entry was selected");
        const existing = linkedIds(findField(currentFields, ["Related Resources"]));
        await writeRecord(config, liveTableId, { "Related Resources": [...new Set([...existing, resourceId])] }, targetId);
      } else if (relationType === "Existing Task") {
        const taskId = linkedIds(findField(fields, ["Suggested Linked Task"]))[0] || "";
        if (!taskId) throw new Error("No linked SOP task was selected");
        const existing = linkedIds(findField(currentFields, ["Linked Tasks"]));
        await writeRecord(config, liveTableId, { "Linked Tasks": [...new Set([...existing, taskId])] }, targetId);
      } else if (relationType === "New Link") {
        const documentationTableId = process.env.FEISHU_DOCUMENTATION_TABLE_ID || "tbljdoFsgOuHMGSO";
        const proposedUrl = deepUrl(findField(fields, ["Proposed URL"]));
        if (!proposedUrl) throw new Error("The suggested link URL is blank or invalid");
        await writeRecord(config, documentationTableId, {
          "Content Name": title,
          "Content Summary": textValue(findField(fields, ["Reason for Change"])),
          "URL": { link: proposedUrl, text: title },
          "SOP": [targetId],
          "Status": "Active",
          "Published": true
        });
      } else {
        throw new Error(`Unsupported relation suggestion type: ${relationType || "blank"}`);
      }
      liveRecord = { record_id: targetId };
    } else if (["Important News", "Macro Update"].includes(updateType)) {
      const proposedUrl = deepUrl(findField(fields, ["Proposed URL"]));
      const isNews = updateType === "Important News";
      Object.assign(liveFields, {
        "Record Key": `${isNews ? "news" : "macro-update"}-${slug(title)}-${Date.now().toString(36)}`,
        "Display Type": isNews ? "Important News" : "Macro Updates",
        "Publish Date": dateNumber(findField(fields, ["Proposed Publish Date"])),
        "Status": "Active",
        "Published": isNews
      });
      if (proposedUrl) liveFields.URL = { link: proposedUrl, text: title };
      liveRecord = await writeRecord(config, liveTableId, liveFields);
    } else {
      throw new Error(`Unsupported Update Type: ${updateType}`);
    }

    const liveRecordId = liveRecord.record_id || liveRecord.id || "";
    if (!RECORD_ID.test(liveRecordId)) throw new Error("Feishu did not return the applied record ID");
    await writeRecord(config, requestTableId, {
      "Apply Status": "Applied",
      "Applied At": Date.now(),
      "Applied Record": [liveRecordId],
      "Apply Error": ""
    }, requestRecordId);
    return res.status(200).json({ ok: true, recordId: liveRecordId });
  } catch (error) {
    console.error("Approved update application failed", error);
    if (config.tenantToken && requestTableId && RECORD_ID.test(requestRecordId)) {
      await writeRecord(config, requestTableId, {
        "Apply Status": "Failed",
        "Apply Error": String(error.message || error).slice(0, 5000)
      }, requestRecordId).catch(markError => console.error("Unable to mark apply failure", markError));
    }
    return res.status(error.status || 500).json({ error: String(error.message || "Unable to apply approved update") });
  }
};
