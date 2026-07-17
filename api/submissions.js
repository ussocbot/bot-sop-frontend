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
        "Instruction": text(body.instruction),
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

    if (kind === "update" || kind === "sop") {
      if (!access.canSubmitUpdates) {
        return res.status(403).json({ error: "You do not have permission to submit updates." });
      }

      const tableId = process.env.FEISHU_SOP_UPDATE_REQUESTS_TABLE_ID;
      if (!tableId) {
        return res.status(500).json({ error: "The SOP Update Requests table is not configured." });
      }

      const updateType = kind === "sop" ? "SOP Update" : text(body.updateType, 100);
      const allowedUpdateTypes = new Set(["SOP Update", "Important News", "Macro Update"]);
      if (!allowedUpdateTypes.has(updateType)) {
        return res.status(400).json({ error: "Select a valid update type." });
      }

      const submissionType = text(body.submissionType, 100);
      const allowedTypes = new Set(["New SOP", "Update Existing SOP", "Correction"]);
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

      const fields = {
        "Request Name": `${updateType}: ${title}`.slice(0, 500),
        "Update Type": updateType,
        "Workflow Path": text(body.workflowPath, 2000),
        "Proposed Request Type": text(body.workflowCategory, 500),
        "Proposed Content Name": title,
        "Proposed Content Summary": text(body.summary, 5000),
        "Proposed Instructions": text(body.instruction),
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
      if (suggestedSopId) fields["Suggested Existing SOP"] = [suggestedSopId];
      if (groupId) fields["Proposed Parent"] = [groupId];
      if (proposedUrl) fields["Proposed URL"] = { link: proposedUrl, text: title };
      if (publishDate) fields["Proposed Publish Date"] = publishDate;
      if (screenshots.length) fields.Screenshots = attachmentFields(screenshots);

      const record = await createRecord(access, tableId, fields);
      return res.status(201).json({ ok: true, recordId: record.record_id || record.id || "" });
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
