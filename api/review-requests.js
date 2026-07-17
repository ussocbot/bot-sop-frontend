const { fetchJson, fetchTableRecords } = require("../lib/feishu");
const { getSubmissionAccess, findField, textValue } = require("../lib/submission-access");

const RECORD_ID = /^rec[A-Za-z0-9_-]+$/;
const FILE_TOKEN = /^[A-Za-z0-9_-]+$/;
const REVIEW_ACTIONS = new Set(["save", "approve", "needs_changes", "reject"]);

function bodyOf(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function limitedText(value, max = 50000) {
  return String(value == null ? "" : value).trim().slice(0, max);
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

function attachmentList(value) {
  const items = Array.isArray(value) ? value : (value ? [value] : []);
  return items.map(item => {
    if (!item || typeof item !== "object") return null;
    const fileToken = limitedText(item.file_token ?? item.fileToken ?? item.token, 200);
    if (!FILE_TOKEN.test(fileToken)) return null;
    return {
      fileToken,
      name: limitedText(item.name ?? item.file_name ?? item.fileName ?? "Screenshot", 300),
      mimeType: limitedText(item.type ?? item.mime_type ?? item.mimeType, 100)
    };
  }).filter(Boolean);
}

function timestampValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = textValue(value);
  if (/^\d{10,13}$/.test(raw)) return raw.length === 10 ? Number(raw) * 1000 : Number(raw);
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateInputValue(value) {
  const timestamp = timestampValue(value);
  return timestamp ? new Date(timestamp).toISOString().slice(0, 10) : "";
}

function deepUrl(value, seen = new Set()) {
  if (!value) return "";
  if (typeof value === "string") return value.match(/https?:\/\/[^\s<>"]+/i)?.[0]?.replace(/[),.;!?]+$/, "") || "";
  if (typeof value !== "object" || seen.has(value)) return "";
  seen.add(value);
  for (const nested of Object.values(value)) {
    const result = deepUrl(nested, seen);
    if (result) return result;
  }
  return "";
}

function safeUrl(value) {
  const raw = limitedText(value, 2000);
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    return ["https:", "http:"].includes(parsed.protocol) ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function mapRequest(record) {
  const fields = record.fields || {};
  return {
    recordId: record.record_id || "",
    requestRecordId: textValue(findField(fields, ["Request Record ID"])),
    requestName: textValue(findField(fields, ["Request Name"])),
    submissionId: textValue(findField(fields, ["Submission ID"])),
    updateType: textValue(findField(fields, ["Update Type"])) || "SOP Update",
    submissionType: textValue(findField(fields, ["Submission Type"])),
    workflowPath: textValue(findField(fields, ["Workflow Path"])),
    proposedRequestType: textValue(findField(fields, ["Proposed Request Type"])),
    proposedParentId: linkedIds(findField(fields, ["Proposed Parent"]))[0] || "",
    suggestedTargetId: linkedIds(findField(fields, ["Suggested Existing SOP"]))[0] || "",
    verifiedTargetId: linkedIds(findField(fields, ["Verified Replacement Target"]))[0] || "",
    title: textValue(findField(fields, ["Proposed Content Name"])),
    summary: textValue(findField(fields, ["Proposed Content Summary"])),
    instruction: textValue(findField(fields, ["Proposed Instructions"])),
    closingGuidance: textValue(findField(fields, ["Proposed Closing Guidance"])),
    ticketTagDisplay: textValue(findField(fields, ["Proposed Ticket Tag Display"])),
    reason: textValue(findField(fields, ["Reason for Change"])),
    url: deepUrl(findField(fields, ["Proposed URL"])),
    publishDate: dateInputValue(findField(fields, ["Proposed Publish Date"])),
    screenshots: attachmentList(findField(fields, ["Screenshots"])),
    screenshotAction: textValue(findField(fields, ["Screenshot Action"])) || "Keep Existing",
    reviewStatus: textValue(findField(fields, ["Review Status"])) || "Pending Review",
    applyStatus: textValue(findField(fields, ["Apply Status"])) || "Pending",
    reviewNotes: textValue(findField(fields, ["Review Notes"])),
    applyError: textValue(findField(fields, ["Apply Error"])),
    submittedBy: textValue(findField(fields, ["Submitted By"])),
    submittedAt: timestampValue(findField(fields, ["Submitted At"])),
    reviewedBy: textValue(findField(fields, ["Reviewed By"])),
    reviewedAt: timestampValue(findField(fields, ["Reviewed At"]))
  };
}

async function updateRecord(access, tableId, recordId, fields) {
  const url = new URL(
    `/open-apis/bitable/v1/apps/${encodeURIComponent(access.appToken)}` +
    `/tables/${encodeURIComponent(tableId)}/records/${encodeURIComponent(recordId)}`,
    access.apiOrigin
  );
  url.searchParams.set("user_id_type", "open_id");
  return fetchJson(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${access.tenantToken}`,
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify({ fields })
  });
}

function reviewFields(body, openId) {
  const values = body.values || {};
  const title = limitedText(values.title, 500);
  if (!title) {
    const error = new Error("Proposed Content Name is required.");
    error.status = 400;
    throw error;
  }

  const updateType = limitedText(values.updateType, 100);
  const submissionType = limitedText(values.submissionType, 100);
  const targetId = limitedText(values.verifiedTargetId, 100);
  const parentId = limitedText(values.proposedParentId, 100);
  const screenshotAction = limitedText(values.screenshotAction, 100) || "Keep Existing";
  if (!["Keep Existing", "Remove Existing", "Replace Existing"].includes(screenshotAction)) {
    const error = new Error("Select a valid screenshot action.");
    error.status = 400;
    throw error;
  }
  if (updateType === "SOP Update" && submissionType !== "New SOP" && !RECORD_ID.test(targetId)) {
    const error = new Error("Select the verified SOP record to replace.");
    error.status = 400;
    throw error;
  }

  const fields = {
    "Proposed Content Name": title,
    "Proposed Content Summary": limitedText(values.summary, 5000),
    "Proposed Instructions": limitedText(values.instruction),
    "Proposed Closing Guidance": limitedText(values.closingGuidance),
    "Proposed Ticket Tag Display": limitedText(values.ticketTagDisplay, 10000),
    "Reason for Change": limitedText(values.reason, 10000),
    "Review Notes": limitedText(values.reviewNotes, 10000),
    "Screenshot Action": screenshotAction
  };

  if (updateType === "SOP Update") {
    fields["Submission Type"] = submissionType;
    fields["Proposed Request Type"] = limitedText(values.proposedRequestType, 500);
    fields["Proposed Parent"] = RECORD_ID.test(parentId) ? [parentId] : [];
    fields["Verified Replacement Target"] = RECORD_ID.test(targetId) ? [targetId] : [];
  }

  if (updateType !== "SOP Update") {
    const proposedUrl = safeUrl(values.url);
    fields["Proposed URL"] = proposedUrl ? { link: proposedUrl, text: title } : null;
    const publishDate = limitedText(values.publishDate, 100);
    fields["Proposed Publish Date"] = publishDate ? Date.parse(`${publishDate}T12:00:00Z`) : null;
  }

  const screenshotTokens = Array.isArray(values.screenshotTokens)
    ? values.screenshotTokens.map(token => limitedText(token, 200)).filter(token => FILE_TOKEN.test(token)).slice(0, 3)
    : [];
  if (screenshotAction === "Remove Existing") fields.Screenshots = [];
  if (screenshotAction === "Replace Existing") {
    if (!screenshotTokens.length) {
      const error = new Error("Upload at least one screenshot or choose Keep/Remove Existing.");
      error.status = 400;
      throw error;
    }
    fields.Screenshots = screenshotTokens.map(fileToken => ({ file_token: fileToken }));
  }

  const action = limitedText(body.action, 50);
  if (["needs_changes", "reject"].includes(action) && !limitedText(values.reviewNotes, 10000)) {
    const error = new Error("Reviewer notes are required when requesting changes or rejecting.");
    error.status = 400;
    throw error;
  }
  if (action !== "save") {
    fields["Reviewed By"] = [{ id: openId }];
    fields["Reviewed At"] = Date.now();
  }
  if (action === "approve") {
    fields["Review Status"] = "Approved";
    fields["Apply Status"] = "Pending";
    fields["Apply Error"] = "";
  }
  if (action === "needs_changes") {
    fields["Review Status"] = "Needs Changes";
    fields["Apply Status"] = "Pending";
  }
  if (action === "reject") {
    fields["Review Status"] = "Rejected";
    fields["Apply Status"] = "Pending";
  }
  return fields;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!["GET", "PATCH"].includes(req.method)) {
    res.setHeader("Allow", "GET, PATCH");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const access = await getSubmissionAccess(req);
    if (!access.canReviewUpdates) {
      return res.status(403).json({ error: "You do not have permission to review updates." });
    }
    const tableId = process.env.FEISHU_SOP_UPDATE_REQUESTS_TABLE_ID;
    if (!tableId) return res.status(500).json({ error: "The SOP Update Requests table is not configured." });

    if (req.method === "GET") {
      const records = await fetchTableRecords({
        apiOrigin: access.apiOrigin,
        tenantToken: access.tenantToken,
        appToken: access.appToken,
        tableId
      });
      const requests = records.map(mapRequest).sort((a, b) => b.submittedAt - a.submittedAt);
      return res.status(200).json({ requests });
    }

    const body = bodyOf(req);
    const action = limitedText(body.action, 50);
    const requestRecordId = limitedText(body.recordId, 100);
    if (!REVIEW_ACTIONS.has(action)) return res.status(400).json({ error: "Select a valid review action." });
    if (!RECORD_ID.test(requestRecordId)) return res.status(400).json({ error: "A valid request record ID is required." });

    const records = await fetchTableRecords({
      apiOrigin: access.apiOrigin,
      tenantToken: access.tenantToken,
      appToken: access.appToken,
      tableId
    });
    const currentRecord = records.find(record => record.record_id === requestRecordId);
    if (!currentRecord) return res.status(404).json({ error: "The update request could not be found." });
    const currentApplyStatus = normalize(textValue(findField(currentRecord.fields || {}, ["Apply Status"])));
    if (["applying", "applied"].includes(currentApplyStatus)) {
      return res.status(409).json({ error: "This request is already being applied or has been applied." });
    }

    const fields = reviewFields(body, access.session.openId);
    await updateRecord(access, tableId, requestRecordId, fields);
    return res.status(200).json({ ok: true, action, recordId: requestRecordId });
  } catch (error) {
    console.error("Review request failed", error);
    const message = error.status === 401
      ? "Please sign in with Feishu before reviewing updates."
      : error.status === 403
        ? error.message
        : error.message || "Unable to update this review request.";
    return res.status(error.status || 500).json({ error: message });
  }
};
