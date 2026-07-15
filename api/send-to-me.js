const { randomUUID } = require("crypto");
const { readSession } = require("../lib/session");
const { fetchJson, getTenantToken, fetchTableRecords } = require("../lib/feishu");

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
  return textValue(
    value.text ?? value.name ?? value.title ?? value.label ?? value.value ?? value.content ?? value.id ?? "",
    seen
  );
}

function deepUrl(value, seen = new Set()) {
  if (!value) return "";
  if (typeof value === "string") return value.match(/https?:\/\/[^\s<>"]+/i)?.[0]?.replace(/[),.;!?]+$/, "") || "";
  if (typeof value !== "object" || seen.has(value)) return "";
  seen.add(value);
  for (const nested of Object.values(value)) {
    const found = deepUrl(nested, seen);
    if (found) return found;
  }
  return "";
}

function slugify(value) {
  return String(value || "record").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "record";
}

function isVisible(fields) {
  const status = textValue(findField(fields, ["Status"]));
  const published = findField(fields, ["Published"]);
  const publishedText = normalize(textValue(published));
  const isPublished = published === null || published === undefined || published === "" || published === true || !["false", "no", "0", "draft", "unpublished"].includes(publishedText);
  return normalize(status) === "active" && isPublished;
}

function clipped(value, maximum = 2200) {
  const text = textValue(value).replace(/\s+/g, " ").trim();
  return text.length > maximum ? `${text.slice(0, maximum - 1)}…` : text;
}

function textRow(label, value) {
  const text = clipped(value);
  if (!text) return null;
  return [
    { tag: "text", text: `${label}: `, style: ["bold"] },
    { tag: "text", text }
  ];
}

module.exports = async function sendToMe(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Cache-Control", "private, no-store");
  const sessionSecret = process.env.SESSION_SECRET;
  const session = sessionSecret ? readSession(req, sessionSecret) : null;
  if (!session?.openId) return res.status(401).json({ error: "Feishu sign-in required" });

  const recordId = String(req.body?.recordId || "");
  const recordType = String(req.body?.recordType || "SOP");
  if (!/^rec[A-Za-z0-9_-]{3,220}$/.test(recordId)) return res.status(400).json({ error: "Invalid record" });
  if (!new Set(["SOP", "Resource"]).has(recordType)) return res.status(400).json({ error: "Invalid record type" });

  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  const appToken = process.env.FEISHU_BASE_APP_TOKEN;
  const apiOrigin = process.env.FEISHU_API_ORIGIN || "https://open.feishu.cn";
  const isResource = recordType === "Resource";
  const tableId = isResource
    ? (process.env.FEISHU_DOCUMENTATION_TABLE_ID || "tbljdoFsgOuHMGSO")
    : process.env.FEISHU_TABLE_ID;
  const viewId = isResource
    ? (process.env.FEISHU_DOCUMENTATION_VIEW_ID || "vewyqW3oZ3")
    : process.env.FEISHU_VIEW_ID;

  if (!appId || !appSecret || !appToken || !tableId) {
    return res.status(500).json({ error: "Send to Me is not configured" });
  }

  try {
    const tenantToken = await getTenantToken({ apiOrigin, appId, appSecret });
    const records = await fetchTableRecords({ apiOrigin, tenantToken, appToken, tableId, viewId });
    const record = records.find(item => item.record_id === recordId);
    if (!record || !isVisible(record.fields || {})) return res.status(404).json({ error: "This entry is unavailable" });

    const fields = record.fields || {};
    const title = clipped(findField(fields, ["Content Name", "Title", "Name"]), 180) || "BOT SOP Guidance";
    const summary = findField(fields, ["Content Summary", "Summary", "Description"]);
    const instruction = findField(fields, ["Instruction", "Content", "Guidance"]);
    const closingGuidance = findField(fields, ["Closing Guidance"]);
    const ticketTagDisplay = findField(fields, ["Ticket Tag Display"]);
    const relatedResources = findField(fields, ["Related Resources"]);
    const linkedTasks = findField(fields, ["Linked Tasks"]);
    const resourceUrl = deepUrl(findField(fields, ["URL", "Link", "Resource URL"]));
    const recordKey = textValue(findField(fields, ["Record Key", "Slug"])) || slugify(title);
    const appUrl = String(process.env.APP_URL || "").replace(/\/$/, "");
    const websiteUrl = appUrl ? `${appUrl}/?record=${encodeURIComponent(slugify(recordKey))}` : "";

    const rows = [
      textRow("Summary", summary),
      textRow("Instructions", instruction),
      textRow("Closing Guidance", closingGuidance),
      textRow("Ticket Tags", ticketTagDisplay),
      textRow("Related Resources", relatedResources),
      textRow("Related Tasks", linkedTasks)
    ].filter(Boolean);
    if (resourceUrl) rows.push([{ tag: "a", text: "Open Resource", href: resourceUrl }]);
    if (websiteUrl) rows.push([{ tag: "a", text: "Open in BOT SOP", href: websiteUrl }]);
    if (!rows.length) rows.push([{ tag: "text", text: "Open this entry in BOT SOP to review its guidance." }]);

    const content = JSON.stringify({ en_us: { title, content: rows } });
    const response = await fetchJson(
      `${apiOrigin}/open-apis/im/v1/messages?receive_id_type=open_id`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tenantToken}`,
          "Content-Type": "application/json; charset=utf-8"
        },
        body: JSON.stringify({
          receive_id: session.openId,
          msg_type: "post",
          content,
          uuid: randomUUID()
        })
      }
    );

    return res.status(200).json({ ok: true, messageId: response.data?.message_id || "" });
  } catch (error) {
    console.error("Send to Me failed", { message: error.message, status: error.status, feishuCode: error.feishuCode });
    if (error.feishuCode === 99991663 || error.status === 403) {
      return res.status(403).json({ error: "The app needs permission to send Feishu messages" });
    }
    return res.status(502).json({ error: "Unable to send this entry to Feishu" });
  }
};
