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
  const isPublished = published === null || published === undefined || published === "" || published === true ||
    !["false", "no", "0", "draft", "unpublished"].includes(publishedText);
  return normalize(status) === "active" && isPublished;
}

function clipped(value, maximum = 2400) {
  const text = (typeof value === "string" ? value : textValue(value)).replace(/\r\n?/g, "\n").trim();
  return text.length > maximum ? `${text.slice(0, maximum - 1)}â€¦` : text;
}

function safeLink(url) {
  const value = String(url || "").trim();
  return /^https:\/\//i.test(value) ? value.replace(/[()\s]/g, character => encodeURIComponent(character)) : "";
}

function markdownValue(value, seen = new Set()) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  if (typeof value !== "object" || seen.has(value)) return "";
  seen.add(value);
  if (Array.isArray(value)) return value.map(item => markdownValue(item, seen)).filter(Boolean).join("\n");

  const url = safeLink(deepUrl(value));
  const label = textValue(value.text ?? value.name ?? value.title ?? value.label ?? value.content ?? "");
  if (url && label) return `[${label.replace(/[\[\]]/g, "")}](${url})`;
  if (url) return `[Open link](${url})`;
  return textValue(value);
}

function relationIds(value) {
  const ids = new Set();
  function visit(entry) {
    if (!entry) return;
    if (Array.isArray(entry)) return entry.forEach(visit);
    if (typeof entry === "string") {
      if (/^rec[A-Za-z0-9_-]+$/.test(entry)) ids.add(entry);
      return;
    }
    if (typeof entry !== "object") return;
    visit(entry.record_id);
    visit(entry.recordId);
    visit(entry.record_ids);
    visit(entry.recordIds);
    visit(entry.link_record_ids);
    if (typeof entry.id === "string" && /^rec/.test(entry.id)) visit(entry.id);
  }
  visit(value);
  return [...ids];
}

function entryTitle(record) {
  return textValue(findField(record?.fields || {}, [
    "Content Name", "Documentation Name", "Resource Name", "Documentation", "Title", "Name"
  ])) || "Untitled entry";
}

function websiteEntryUrl(appUrl, record, resource = false) {
  if (!appUrl || !record) return "";
  const fields = record.fields || {};
  const key = resource
    ? `documentation-${slugify(record.record_id || entryTitle(record))}`
    : slugify(textValue(findField(fields, ["Record Key", "Slug", "ID"])) || entryTitle(record));
  return `${appUrl}/?record=${encodeURIComponent(key)}`;
}

function markdownSection(title, value, maximum = 2400) {
  const content = clipped(markdownValue(value), maximum);
  if (!content) return null;
  return {
    tag: "div",
    text: {
      tag: "lark_md",
      content: `**${title}**\n${content}`
    }
  };
}

function divider() {
  return { tag: "hr" };
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
  const sopTableId = process.env.FEISHU_TABLE_ID;
  const sopViewId = process.env.FEISHU_VIEW_ID;
  const documentationTableId = process.env.FEISHU_DOCUMENTATION_TABLE_ID || "tbljdoFsgOuHMGSO";
  const documentationViewId = process.env.FEISHU_DOCUMENTATION_VIEW_ID || "vewyqW3oZ3";
  const isResource = recordType === "Resource";
  const tableId = isResource ? documentationTableId : sopTableId;
  const viewId = isResource ? documentationViewId : sopViewId;

  if (!appId || !appSecret || !appToken || !tableId) {
    return res.status(500).json({ error: "Send to Me is not configured" });
  }

  try {
    const tenantToken = await getTenantToken({ apiOrigin, appId, appSecret });
    const [sourceRecords, sopRecords, documentationRecords] = await Promise.all([
      fetchTableRecords({ apiOrigin, tenantToken, appToken, tableId, viewId }),
      isResource && sopTableId
        ? fetchTableRecords({ apiOrigin, tenantToken, appToken, tableId: sopTableId, viewId: sopViewId })
        : Promise.resolve([]),
      !isResource && documentationTableId
        ? fetchTableRecords({ apiOrigin, tenantToken, appToken, tableId: documentationTableId, viewId: documentationViewId })
        : Promise.resolve([])
    ]);
    const record = sourceRecords.find(item => item.record_id === recordId);
    if (!record || !isVisible(record.fields || {})) return res.status(404).json({ error: "This entry is unavailable" });

    const fields = record.fields || {};
    const title = clipped(findField(fields, ["Content Name", "Title", "Name"]), 180) || "BOT SOP Guidance";
    const summary = findField(fields, ["Content Summary", "Summary", "Description"]);
    const instruction = findField(fields, ["Instruction", "Content", "Guidance"]);
    const closingGuidance = findField(fields, ["Closing Guidance"]);
    const ticketTagDisplay = findField(fields, ["Ticket Tag Display"]);
    const resourceUrl = safeLink(deepUrl(findField(fields, ["URL", "Link", "Resource URL"])));
    const appUrl = String(process.env.APP_URL || "").replace(/\/$/, "");
    const websiteUrl = websiteEntryUrl(appUrl, record, isResource);

    const activeSopRecords = (isResource ? sopRecords : sourceRecords).filter(item => isVisible(item.fields || {}));
    const activeDocumentationRecords = (isResource ? sourceRecords : documentationRecords).filter(item => isVisible(item.fields || {}));
    const sopById = new Map(activeSopRecords.map(item => [item.record_id, item]));
    const documentationById = new Map(activeDocumentationRecords.map(item => [item.record_id, item]));

    const relatedResources = relationIds(findField(fields, ["Related Resources"]))
      .map(id => documentationById.get(id))
      .filter(Boolean)
      .map(item => ({
        title: entryTitle(item),
        url: safeLink(deepUrl(findField(item.fields || {}, ["URL", "Link", "Resource URL"]))) || websiteEntryUrl(appUrl, item, true)
      }))
      .filter(item => item.url);

    const linkedTasks = relationIds(findField(fields, ["Linked Tasks"]))
      .map(id => sopById.get(id))
      .filter(Boolean)
      .map(item => ({ title: entryTitle(item), url: websiteEntryUrl(appUrl, item, false) }))
      .filter(item => item.url);

    const relatedLinks = [...relatedResources, ...linkedTasks];
    const elements = [
      markdownSection("Summary", summary, 1000),
      markdownSection("Instructions", instruction),
      markdownSection("Closing Guidance", closingGuidance, 1400),
      markdownSection("Ticket Tags", ticketTagDisplay, 800)
    ].filter(Boolean);

    if (relatedLinks.length) {
      if (elements.length) elements.push(divider());
      elements.push({
        tag: "div",
        text: {
          tag: "lark_md",
          content: `**Related Resources & Tasks**\n${relatedLinks
            .slice(0, 20)
            .map(item => `â€¢ [${item.title.replace(/[\[\]]/g, "")}](${safeLink(item.url)})`)
            .join("\n")}`
        }
      });
    }

    const actions = [];
    if (resourceUrl) {
      actions.push({
        tag: "button",
        text: { tag: "plain_text", content: "Open Resource" },
        type: "default",
        url: resourceUrl
      });
    }
    if (websiteUrl) {
      actions.push({
        tag: "button",
        text: { tag: "plain_text", content: "Open in BOT SOP" },
        type: "primary",
        url: websiteUrl
      });
    }
    if (actions.length) elements.push({ tag: "action", actions });
    if (!elements.length) {
      elements.push({
        tag: "div",
        text: { tag: "lark_md", content: "Open this entry in BOT SOP to review its guidance." }
      });
    }

    const card = {
      config: { wide_screen_mode: true, enable_forward: true },
      header: {
        template: "blue",
        title: { tag: "plain_text", content: title },
        subtitle: { tag: "plain_text", content: isResource ? "BOT SOP Resource" : "BOT SOP Guidance" }
      },
      elements
    };

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
          msg_type: "interactive",
          content: JSON.stringify(card),
          uuid: randomUUID()
        })
      }
    );

    return res.status(200).json({ ok: true, messageId: response.data?.message_id || "" });
  } catch (error) {
    console.error("Send to Me failed", {
      message: error.message,
      status: error.status,
      feishuCode: error.feishuCode
    });
    if (error.feishuCode === 99991663 || error.status === 403) {
      return res.status(403).json({ error: "The app needs permission to send Feishu messages" });
    }
    return res.status(502).json({ error: "Unable to send this entry to Feishu" });
  }
};


