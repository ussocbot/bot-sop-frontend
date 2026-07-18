const { randomUUID } = require("crypto");
const { fetchJson } = require("../lib/feishu");
const { getSubmissionAccess } = require("../lib/submission-access");

const MAX_TEXT = 50000;
const RECORD_ID = /^rec[A-Za-z0-9_-]+$/;
const FILE_TOKEN = /^[A-Za-z0-9_-]+$/;

function bodyOf(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}

function text(value, max = MAX_TEXT) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function stringList(value, maxItems = 50, maxLength = 200) {
  if (!Array.isArray(value)) return [];
  return value.map(item => text(item, maxLength)).filter(Boolean).slice(0, maxItems);
}

function recordId(value) {
  const id = text(value, 100);
  return RECORD_ID.test(id) ? id : "";
}

function fileTokens(value) {
  return stringList(value, 3, 200).filter(token => FILE_TOKEN.test(token));
}

function safeUrl(value) {
  const raw = text(value, 2000);
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    return ["https:", "http:"].includes(parsed.protocol) ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function dateValue(value) {
  const raw = text(value, 100);
  if (!raw) return null;
  const parsed = Date.parse(`${raw}T12:00:00Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

function requestStamp(now = new Date()) {
  return now.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

async function createRecord(access, tableId, fields) {
  const url = new URL(
    `/open-apis/bitable/v1/apps/${encodeURIComponent(access.appToken)}` +
    `/tables/${encodeURIComponent(tableId)}/records`,
    access.apiOrigin
  );
  url.searchParams.set("user_id_type", "open_id");

  const result = await fetchJson(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access.tenantToken}`,
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify({ fields })
  });
  return result.data?.record || result.data || {};
}

async function updateRecord(access, tableId, recordIdValue, fields) {
  const url = new URL(
    `/open-apis/bitable/v1/apps/${encodeURIComponent(access.appToken)}` +
    `/tables/${encodeURIComponent(tableId)}/records/${encodeURIComponent(recordIdValue)}`,
    access.apiOrigin
  );
  url.searchParams.set("user_id_type", "open_id");
  const result = await fetchJson(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${access.tenantToken}`,
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify({ fields })
  });
  return result.data?.record || result.data || {};
}

function submitter(openId) {
  return openId ? [{ id: openId }] : [];
}

function attachmentFields(tokens) {
  return tokens.map(fileToken => ({ file_token: fileToken }));
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
    const kind = text(body.kind, 20).toLowerCase();

    if (kind === "resource") {
      if (!access.canSubmitResources) {
        return res.status(403).json({ error: "You do not have permission to submit resources." });
      }

      const tableId = process.env.FEISHU_DOCUMENTATION_TABLE_ID || "tbljdoFsgOuHMGSO";
      const title = text(body.title, 500);
      if (!title) return res.status(400).json({ error: "Resource title is required." });

      const url = safeUrl(body.url);
      if (text(body.url) && !url) {
        return res.status(400).json({ error: "Resource URL must be a valid web address." });
      }

      const fields = {
        "Content Name": title,
        "Content Summary": text(body.summary, 5000),
        "Guidance": text(body.instruction),
        "Status": "Pending Review",
        "Published": false,
        "Submitted By": submitter(access.session.openId),
        "Submitted At": Date.now()
      };
      const category = text(body.category, 500);
      const keywords = stringList(body.keywords);
      const relatedSopId = recordId(body.relatedSopId);
      const workflowPath = text(body.workflowPath, 2000);
      const screenshots = fileTokens(body.screenshotTokens);
      if (url) fields.URL = { link: url, text: title };
      if (category) fields.Category = category;
      if (keywords.length) fields["Search Keywords"] = keywords;
      if (relatedSopId) fields.SOP = [relatedSopId];
      if (workflowPath) fields["Submission Workflow Path"] = workflowPath;
      if (screenshots.length) fields.Screenshots = attachmentFields(screenshots);

      const record = await createRecord(access, tableId, fields);
      return res.status(201).json({ ok: true, recordId: record.record_id || record.id || "" });
    }

    if (kind === "relation_suggestion") {
      if (!access.canSubmitResources) {
        return res.status(403).json({ error: "You do not have permission to suggest related items." });
      }
      const tableId = process.env.FEISHU_SOP_UPDATE_REQUESTS_TABLE_ID;
      if (!tableId) return res.status(500).json({ error: "The SOP Update Requests table is not configured." });
      const targetSopId = recordId(body.targetSopId);
      const relationKind = text(body.relationKind, 30).toLowerCase();
      if (!targetSopId) return res.status(400).json({ error: "A valid target SOP is required." });
      if (!["link", "resource", "task"].includes(relationKind)) return res.status(400).json({ error: "Select a valid suggestion type." });
      const resourceId = recordId(body.resourceId);
      const taskId = recordId(body.taskId);
      const proposedUrl = safeUrl(body.url);
      if (relationKind === "link" && !proposedUrl) return res.status(400).json({ error: "Enter a valid link URL." });
      if (relationKind === "resource" && !resourceId) return res.status(400).json({ error: "Select an existing Resource Hub entry." });
      if (relationKind === "task" && !taskId) return res.status(400).json({ error: "Select an existing SOP task." });
      const title = text(body.title, 500) || text(body.targetTitle, 500) || "Related item suggestion";
      const submissionId = randomUUID();
      const fields = {
        "Request Name": `Related Item: ${title} - ${requestStamp()} - ${submissionId.slice(0, 8)}`.slice(0, 500),
        "Submission ID": submissionId,
        "Update Type": "Related Item Suggestion",
        "Proposed Content Name": title,
        "Relation Suggestion Type": relationKind === "link" ? "New Link" : relationKind === "resource" ? "Existing Resource" : "Existing Task",
        "Suggested Existing SOP": [targetSopId],
        "Reason for Change": text(body.reason, 10000),
        "Submitted By": submitter(access.session.openId),
        "Submitted At": Date.now(),
        "Review Status": "Pending Review",
        "Apply Status": "Pending"
      };
      if (proposedUrl) fields["Proposed URL"] = { link: proposedUrl, text: title };
      if (resourceId) fields["Suggested Related Resource"] = [resourceId];
      if (taskId) fields["Suggested Linked Task"] = [taskId];
      const record = await createRecord(access, tableId, fields);
      const createdRecordId = record.record_id || record.id || "";
      if (!RECORD_ID.test(createdRecordId)) throw new Error("Feishu did not return the new request record ID");
      await updateRecord(access, tableId, createdRecordId, { "Request Record ID": createdRecordId });
      return res.status(201).json({ ok: true, recordId: createdRecordId, submissionId, title });
    }

    if (kind === "update" || kind === "sop") {
      if (!access.canSubmitUpdates) {
        return res.status(403).json({ error: "You do not have permission to submit updates." });
      }

      const tableId = process.env.FEISHU_SOP_UPDATE_REQUESTS_TABLE_ID;
      if (!tableId) {
        return res.status(500).json({ error: "The SOP Update Requests table is not configured." });
      }

      const updateTypeMap = {
        sop: "SOP Update",
        important_news: "Important News",
        macro_update: "Macro Update",
        "SOP Update": "SOP Update",
        "Important News": "Important News",
        "Macro Update": "Macro Update"
      };
      const updateType = kind === "sop" ? "SOP Update" : updateTypeMap[text(body.updateType, 100)];
      const allowedUpdateTypes = new Set(["SOP Update", "Important News", "Macro Update"]);
      if (!allowedUpdateTypes.has(updateType)) {
        return res.status(400).json({ error: "Select a valid update type." });
      }

      const submissionType = text(body.submissionType, 100);
      const allowedTypes = new Set(["New SOP", "Update Existing SOP", "Replace Existing SOP", "Correction"]);
      if (updateType === "SOP Update" && !allowedTypes.has(submissionType)) {
        return res.status(400).json({ error: "Select a valid submission type." });
      }

      const title = text(body.title, 500);
      const suggestedSopId = recordId(body.suggestedSopId);
      if (!title) return res.status(400).json({ error: "Proposed content name is required." });
      if (updateType === "SOP Update" && submissionType !== "New SOP" && !suggestedSopId) {
        return res.status(400).json({ error: "Select the existing SOP this request should update." });
      }

      const proposedUrl = safeUrl(body.url);
      if (text(body.url) && !proposedUrl) {
        return res.status(400).json({ error: "Resource Link must be a valid web address." });
      }

      const submissionId = randomUUID();
      const requestName = `${updateType}: ${title} - ${requestStamp()} - ${submissionId.slice(0, 8)}`.slice(0, 500);
      const fields = {
        "Request Name": requestName,
        "Submission ID": submissionId,
        "Update Type": updateType,
        "Workflow Path": text(body.workflowPath, 2000),
        "Proposed Request Type": text(body.workflowCategory, 500),
        "Proposed Content Name": title,
        "Proposed Content Summary": text(body.summary, 5000),
        "Proposed Guidance": text(body.instruction),
        "Proposed Closing Guidance": text(body.closingGuidance),
        "Proposed Ticket Tag Display": text(body.ticketTagDisplay, 10000),
        "Reason for Change": text(body.reason, 10000),
        "Submitted By": submitter(access.session.openId),
        "Submitted At": Date.now(),
        "Review Status": "Pending Review",
        "Apply Status": "Pending"
      };
      if (updateType === "SOP Update") fields["Submission Type"] = submissionType;
      const screenshots = fileTokens(body.screenshotTokens);
      const groupId = recordId(body.workflowGroupId);
      const publishDate = dateValue(body.publishDate);
      const requestedScreenshotAction = text(body.screenshotAction, 100);
      const allowedScreenshotActions = new Set(["Keep Existing", "Remove Existing", "Replace Existing"]);
      fields["Screenshot Action"] = screenshots.length
        ? "Replace Existing"
        : (allowedScreenshotActions.has(requestedScreenshotAction)
            ? requestedScreenshotAction
            : (updateType === "SOP Update" && submissionType !== "New SOP" ? "Keep Existing" : "Remove Existing"));
      if (suggestedSopId) fields["Suggested Existing SOP"] = [suggestedSopId];
      if (groupId) fields["Proposed Parent"] = [groupId];
      if (proposedUrl) fields["Proposed URL"] = { link: proposedUrl, text: title };
      if (publishDate) fields["Proposed Publish Date"] = publishDate;
      if (screenshots.length) fields.Screenshots = attachmentFields(screenshots);

      const record = await createRecord(access, tableId, fields);
      const createdRecordId = record.record_id || record.id || "";
      if (!RECORD_ID.test(createdRecordId)) throw new Error("Feishu did not return the new request record ID");
      await updateRecord(access, tableId, createdRecordId, { "Request Record ID": createdRecordId });
      return res.status(201).json({
        ok: true,
        recordId: createdRecordId,
        submissionId,
        updateType,
        requestName
      });
    }

    return res.status(400).json({ error: "Unknown submission type." });
  } catch (error) {
    console.error("Submission failed", error);
    const message = error.status === 401
      ? "Please sign in with Feishu before submitting."
      : error.status === 403
        ? error.message
        : "Unable to save this submission. Check the Base fields and app permissions, then try again.";
    return res.status(error.status || 500).json({ error: message });
  }
};
