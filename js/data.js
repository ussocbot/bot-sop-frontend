window.navigationItems = [];

(function configureBaseData() {
  "use strict";

  const DISPLAY_TYPES = {
    "request type": "Request Type",
    "process group": "Process Group",
    process: "Process",
    section: "Section",
    checklist: "Checklist",
    "checklist step": "Checklist Step",
    callout: "Callout",
    tool: "Tool",
    link: "Link",
    news: "News",
    "sop update": "SOP Update",
    warning: "Warning"
  };

  const BASE_SECTIONS = {
    "request types": "Request Types",
    "process content": "Process Content",
    "bot expectations": "BOT Expectations",
    "best practices": "Best Practices",
    "wrap up": "Wrap Up",
    "ban operators and reasons": "Ban Operators and Reasons",
    "oos routing": "OOS Routing",
    "bot tools": "BOT Tools",
    "opus links": "OPUS Links",
    "qa links": "QA Links",
    "important news": "Important News",
    "sop updates": "SOP Updates",
    "policy reminders": "Policy Reminders"
  };

  const REQUEST_TYPE_ORDER = [
    "Video / Photo Post",
    "Account",
    "Live",
    "Comment",
    "Direct Message",
    "Live Comment",
    "User Profile",
    "Circumvention / Recidivism",
    "Response Wrap-Up",
    "OOS Routing",
    "Audio",
    "E-Commerce"
  ];

  const REQUEST_TYPE_ALIASES = {
    "video/photo post": "Video / Photo Post",
    "video / photo post": "Video / Photo Post",
    account: "Account",
    live: "Live",
    comment: "Comment",
    "direct message": "Direct Message",
    dm: "Direct Message",
    "live comment": "Live Comment",
    "user profile": "User Profile",
    "circumvention/recidivism": "Circumvention / Recidivism",
    "circumvention / recidivism": "Circumvention / Recidivism",
    "response wrap-up": "Response Wrap-Up",
    "response wrap up": "Response Wrap-Up",
    "oos routing": "OOS Routing",
    audio: "Audio",
    ecommerce: "E-Commerce",
    "e-commerce": "E-Commerce"
  };

  const SECTION_CONTRACT = {
    "Request Type|Request Types": "left request navigation",
    "Process Group|Process Content": "center submenu",
    "Process|Process Content": "center process content",
    "Section|BOT Expectations": "BOT Expectations homepage section",
    "Section|Best Practices": "Best Practices homepage section",
    "Checklist|Wrap Up": "Wrap Up homepage section",
    "Checklist Step|Wrap Up": "nested Wrap Up step",
    "Section|Ban Operators and Reasons": "Ban Operators and Reasons homepage section",
    "Callout|OOS Routing": "left OOS Routing card",
    "Tool|BOT Tools": "right BOT Tools card",
    "Link|OPUS Links": "right OPUS Links card",
    "Link|QA Links": "right QA Links card",
    "News|Important News": "right Important News card",
    "SOP Update|SOP Updates": "right SOP Updates card",
    "Warning|Policy Reminders": "bottom-wide policy reminder"
  };

  function normalizeKey(value) {
    return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function findField(fields, names) {
    const entries = Object.entries(fields || {});
    for (const name of names) {
      if (fields?.[name] !== undefined) return fields[name];
      const match = entries.find(([key]) => normalizeKey(key) === normalizeKey(name));
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
      return textValue(
        value.text ?? value.name ?? value.label ?? value.value ?? value.link ?? value.url ?? value.id ?? value.record_id ?? ""
      );
    }
    return "";
  }

  function listValue(value) {
    if (Array.isArray(value)) return value.map(textValue).filter(Boolean);
    const text = textValue(value);
    return text ? text.split(/[,\n]/).map(item => item.trim()).filter(Boolean) : [];
  }

  function urlValue(value) {
    if (!value) return "";
    return deepUrl(value) || textValue(value);
  }

  function deepUrl(value, seen = new Set()) {
    if (!value) return "";
    if (typeof value === "string") {
      const normalized = value.replace(/\\\//g, "/");
      const match = normalized.match(/https?:\/\/[^\s<>"]+/i);
      return match ? match[0].replace(/[),.;!?]+$/, "") : "";
    }
    if (typeof value !== "object" || seen.has(value)) return "";
    seen.add(value);
    if (Array.isArray(value)) {
      for (const entry of value) {
        const found = deepUrl(entry, seen);
        if (found) return found;
      }
      return "";
    }
    for (const key of ["url", "href", "link", "web_url", "webUrl", "redirect_url", "redirectUrl"]) {
      const found = deepUrl(value[key], seen);
      if (found) return found;
    }
    for (const key of ["mention_doc", "mentionDoc", "document", "doc", "mention", "content"]) {
      const found = deepUrl(value[key], seen);
      if (found) return found;
    }
    for (const nested of Object.values(value)) {
      const found = deepUrl(nested, seen);
      if (found) return found;
    }
    return "";
  }

  function richTextValue(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (Array.isArray(value)) return value.map(richTextValue).join("");
    if (typeof value !== "object") return "";

    const mention = value.mention_doc ?? value.mentionDoc ?? value.document ?? value.doc ?? value.mention ?? null;
    let text = richTextValue(
      value.text ?? value.name ?? value.title ?? value.label ??
      mention?.text ?? mention?.name ?? mention?.title ?? value.value ?? value.content?.text ?? ""
    );
    const link = deepUrl(value);
    const style = value.style || value.text_style || value.textStyle || {};
    if (style.bold || value.bold) text = `**${text}**`;
    if (style.italic || value.italic) text = `*${text}*`;
    if (link && /^https?:\/\//i.test(link)) return `[${text || link}](${link})`;
    return text;
  }

  function relationNames(value) {
    if (!value) return [];
    if (!Array.isArray(value)) return listValue(value);
    return value.map(item => textValue(item)).filter(Boolean);
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

  function attachmentList(value) {
    const entries = Array.isArray(value) ? value : (value ? [value] : []);
    return entries.map(entry => {
      if (!entry || typeof entry !== "object") return null;
      const fileToken = textValue(entry.file_token ?? entry.fileToken ?? entry.token);
      const name = textValue(entry.name ?? entry.file_name ?? entry.fileName) || "Guidance image";
      const mimeType = textValue(entry.type ?? entry.mime_type ?? entry.mimeType);
      const looksLikeImage = mimeType.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);
      const directUrl = deepUrl(entry.tmp_url ?? entry.tmpUrl ?? entry.download_url ?? entry.downloadUrl ?? entry.url);
      const rawExtra = entry.extra ?? entry.download_extra ?? entry.downloadExtra;
      let extra = typeof rawExtra === "string"
        ? rawExtra.trim()
        : (rawExtra && typeof rawExtra === "object" ? JSON.stringify(rawExtra) : textValue(rawExtra));
      if (!extra && directUrl) {
        try {
          extra = new URL(directUrl, window.location.origin).searchParams.get("extra") || "";
        } catch (error) {
          extra = "";
        }
      }
      if ((!fileToken && !directUrl) || !looksLikeImage) return null;
      const query = new URLSearchParams();
      if (fileToken) query.set("file_token", fileToken);
      if (name) query.set("name", name);
      if (mimeType) query.set("mime_type", mimeType);
      if (extra) query.set("extra", extra);
      return {
        fileToken,
        name,
        mimeType,
        extra,
        src: fileToken ? `/api/media?${query.toString()}` : directUrl
      };
    }).filter(Boolean);
  }

  function boolValue(value, fallback = true) {
    if (value === null || value === undefined || value === "") return fallback;
    if (typeof value === "boolean") return value;
    return !["false", "no", "0", "draft", "unpublished"].includes(normalizeKey(textValue(value)));
  }

  function numberValue(value, fallback) {
    const parsed = Number(textValue(value));
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function slugify(value) {
    return textValue(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "record";
  }

  function shortDescription(value) {
    const text = textValue(value).replace(/\s+/g, " ");
    return text.length > 170 ? `${text.slice(0, 167)}...` : text;
  }

  function canonical(value, dictionary, fallback) {
    return dictionary[normalizeKey(value)] || fallback || textValue(value);
  }

  function canonicalRequestType(value) {
    const supplied = textValue(value).replace(/\s+/g, " ");
    return REQUEST_TYPE_ALIASES[normalizeKey(supplied)] || supplied;
  }

  function requestTypeOrder(title) {
    const index = REQUEST_TYPE_ORDER.indexOf(title);
    return index === -1 ? 1000 : index + 1;
  }

  function stableHash(value) {
    let hash = 0;
    for (const character of String(value || "record")) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
    return Math.abs(hash);
  }

  function getIcon(record) {
    if (record.iconKey) return record.iconKey;
    const pools = {
      "Request Type": ["folder", "layers", "inbox", "layout-grid"],
      "Process Group": ["folders", "library", "layers", "blocks"],
      Process: ["file-text", "clipboard-list", "book-open", "scroll-text", "lightbulb"],
      Section: ["info", "book-open", "lightbulb", "circle-help", "compass"],
      Checklist: ["circle-check-big", "list-checks", "clipboard-check", "badge-check"],
      "Checklist Step": ["list-checks", "check-check", "clipboard-check", "circle-check"],
      Callout: ["route", "signpost", "compass", "flag", "shield-alert"],
      Tool: ["wrench", "settings", "hammer", "badge-help"],
      Link: ["link", "external-link", "bookmark", "book-marked"],
      News: ["megaphone", "newspaper", "bell", "radio"],
      "SOP Update": ["file-clock", "refresh-cw", "history", "calendar-clock"],
      Warning: ["shield-alert", "triangle-alert", "badge-alert", "circle-alert"]
    };
    const choices = pools[record.displayType] || pools.Process;
    return choices[stableHash(record.recordId || record.recordKey || record.title) % choices.length];
  }

  function mapRecord(record, index, usedIds) {
    const fields = record.fields || {};
    const title = textValue(findField(fields, ["Content Name", "Title", "Name"])) || `Record ${index + 1}`;
    const recordKey = textValue(findField(fields, ["Record Key", "Slug", "ID"])) || slugify(title);
    let id = slugify(recordKey);
    if (usedIds.has(id)) id = `${id}-${String(record.record_id || index).slice(-6)}`;
    usedIds.add(id);

    const instruction = richTextValue(findField(fields, ["Instruction", "Content", "Guidance"]));
    const displayType = canonical(
      findField(fields, ["Display Type"]),
      DISPLAY_TYPES,
      ""
    );
    const baseSection = canonical(
      findField(fields, ["Base Section"]),
      BASE_SECTIONS,
      ""
    );
    const rawScreenshotGuidance = findField(fields, ["Screenshot Guidance"]);
    const rawScreenshots = findField(fields, ["Screenshots", "Attachments"]);
    const rawRelatedResources = findField(fields, ["Related Resources"]);
    const rawLinkedTasks = findField(fields, ["Linked Tasks"]);
    const guidanceAttachments = attachmentList(rawScreenshotGuidance);

    const featuredIn = listValue(findField(fields, [
      "Featured In", "Feature In", "Featured Placement", "Feature Placement"
    ]));
    if (boolValue(findField(fields, [
      "Featured in Important News", "Feature in Important News", "Featured Important News"
    ]), false)) featuredIn.push("Important News");
    if (boolValue(findField(fields, [
      "Featured in SOP Updates", "Feature in SOP Updates", "Featured SOP Updates"
    ]), false)) featuredIn.push("SOP Updates");

    const item = {
      id,
      recordId: record.record_id || "",
      recordKey,
      title,
      displayType,
      baseSection,
      iconKey: textValue(findField(fields, ["Icon Key", "Icon"])),
      summary: textValue(findField(fields, ["Content Summary", "Summary", "Description"])),
      instruction,
      appearsIn: listValue(findField(fields, ["Appears In"])).map(canonicalRequestType),
      parents: relationNames(findField(fields, ["Parent"])),
      parentIds: relationIds(findField(fields, ["Parent"])),
      sortOrder: numberValue(findField(fields, ["Sort Order"]), index + 1),
      priority: numberValue(findField(fields, ["Priority"]), 0),
      status: textValue(findField(fields, ["Status"])),
      published: boolValue(findField(fields, ["Published"]), true),
      url: deepUrl(findField(fields, ["URL", "Link"])) || urlValue(findField(fields, ["URL", "Link"])),
      ctaLabel: textValue(findField(fields, ["CTA Label"])) || "Open Resource",
      badge: textValue(findField(fields, ["Badge"])),
      publishDate: textValue(findField(fields, ["Publish Date", "Published Date", "Date Published"])),
      featuredIn: [...new Set(featuredIn)],
      featureSummary: textValue(findField(fields, ["Feature Summary"])),
      expirationDate: textValue(findField(fields, ["Expiration Date"])),
      lastUpdated: textValue(findField(fields, ["Last Updated"])) || "Not available",
      screenshotGuidance: guidanceAttachments.length ? "" : textValue(rawScreenshotGuidance),
      screenshots: [...attachmentList(rawScreenshots), ...guidanceAttachments],
      relatedResourceIds: relationIds(rawRelatedResources),
      linkedTaskIds: relationIds(rawLinkedTasks),
      unresolvedRelatedResources: relationNames(rawRelatedResources).filter(name => !/^rec/.test(name)),
      unresolvedLinkedTasks: relationNames(rawLinkedTasks).filter(name => !/^rec/.test(name)),
      relatedResources: [],
      linkedTasks: [],
      ticketTags: listValue(findField(fields, ["Ticket Tags"])),
      keywords: listValue(findField(fields, ["Search Keywords", "Keywords", "Tags"])),
      category: textValue(findField(fields, ["Category", "Content Type", "Topic"])),
      ticketTagDisplay: textValue(findField(fields, ["Ticket Tag Display"])),
      closingGuidance: richTextValue(findField(fields, ["Closing Guidance"])),
      workflow: textValue(findField(fields, ["Workflow"])) || "BOT"
    };

    item.description = item.summary;
    item.icon = getIcon(item);
    item.contractKey = `${item.displayType}|${item.baseSection}`;
    item.destination = SECTION_CONTRACT[item.contractKey] || "Unmapped";
    item.mappingValid = Boolean(SECTION_CONTRACT[item.contractKey]);
    item.resourceCount = item.relatedResourceIds.length || item.unresolvedRelatedResources.length;
    return item;
  }

  function mapDocumentationRecord(record, index) {
    const fields = record.fields || {};
    const title = textValue(findField(fields, [
      "Content Name", "Documentation Name", "Resource Name", "Documentation", "Title", "Name"
    ])) || `Documentation ${index + 1}`;
    const summary = textValue(findField(fields, ["Content Summary", "Summary", "Description"]));
    const rawScreenshotGuidance = findField(fields, ["Screenshot Guidance"]);
    const guidanceAttachments = attachmentList(rawScreenshotGuidance);
    const item = {
      id: `documentation-${slugify(record.record_id || title)}`,
      recordId: record.record_id || "",
      recordKey: textValue(findField(fields, ["Record Key", "Slug"])) || `documentation-${slugify(title)}`,
      title,
      summary,
      description: summary,
      instruction: richTextValue(findField(fields, ["Instruction", "Content", "Guidance", "Details"])),
      url: deepUrl(findField(fields, ["URL", "Link", "Resource URL"])) || urlValue(findField(fields, ["URL", "Link", "Resource URL"])),
      ctaLabel: textValue(findField(fields, ["CTA Label"])) || "Open Resource",
      iconKey: textValue(findField(fields, ["Icon Key", "Icon"])),
      badge: textValue(findField(fields, ["Badge"])),
      websitePlacements: listValue(findField(fields, ["Website Placement", "Website Placements"])),
      sortOrder: numberValue(findField(fields, ["Sort Order"]), index + 1),
      priority: numberValue(findField(fields, ["Priority"]), 0),
      published: boolValue(findField(fields, ["Published"]), true),
      status: textValue(findField(fields, ["Status"])),
      lastUpdated: textValue(findField(fields, ["Last Updated", "Updated"])) || "Not available",
      publishDate: textValue(findField(fields, ["Publish Date", "Published Date", "Date Published"])),
      appearsIn: [],
      parents: [],
      parentIds: [],
      ticketTags: listValue(findField(fields, ["Search Keywords", "Keywords", "Tags"])),
      keywords: listValue(findField(fields, ["Search Keywords", "Keywords", "Tags"])),
      category: textValue(findField(fields, ["Category", "Content Type", "Topic"])),
      displayType: "Link",
      sourceType: "Documentation",
      sopRecordIds: relationIds(findField(fields, ["SOP"])),
      screenshotGuidance: guidanceAttachments.length ? "" : textValue(rawScreenshotGuidance),
      screenshots: [...attachmentList(findField(fields, ["Screenshots", "Attachments"])), ...guidanceAttachments],
      relatedResources: [],
      linkedTasks: [],
      closingGuidance: ""
    };
    item.icon = getIcon(item);
    return item;
  }

  function buildRequestTypes(items, allItems = items) {
    const explicit = items.filter(item => item.displayType === "Request Type");
    const inactiveExplicitTitles = new Set(
      allItems
        .filter(item => item.displayType === "Request Type")
        .filter(item => !item.published || normalizeKey(item.status) !== "active")
        .map(item => normalizeKey(item.title))
    );
    const contexts = new Set();
    items
      .filter(item => ["Process", "Process Group"].includes(item.displayType))
      .forEach(item => item.appearsIn.forEach(context => {
        if (context && !["global", "oos routing"].includes(normalizeKey(context)) && !inactiveExplicitTitles.has(normalizeKey(context))) contexts.add(context);
      }));
    explicit.forEach(item => {
      if (normalizeKey(item.title) !== "oos routing") contexts.add(item.title);
    });

    return [...contexts].map((title, index) => {
      const configured = explicit.find(item => normalizeKey(item.title) === normalizeKey(title));
      return configured || {
        id: `request-${slugify(title)}`,
        recordKey: `request-${slugify(title)}`,
        title,
        displayType: "Request Type",
        baseSection: "Request Types",
        icon: "folder",
        description: `${title} processes and guidance.`,
        summary: `${title} processes and guidance.`,
        appearsIn: [title],
        parents: [],
        sortOrder: requestTypeOrder(title) || index + 1,
        status: "Active",
        published: true,
        synthetic: true,
        mappingValid: true,
        destination: "left request navigation"
      };
    }).sort((a, b) =>
      (a.sortOrder || requestTypeOrder(a.title)) - (b.sortOrder || requestTypeOrder(b.title)) ||
      a.title.localeCompare(b.title)
    );
  }

  function buildModel(records, documentationRecords = []) {
    const usedIds = new Set();
    const items = records.map((record, index) => mapRecord(record, index, usedIds));
    const isActive = item => item.published && normalizeKey(item.status) === "active";
    const publishedItems = items.filter(isActive);
    const documents = documentationRecords.map(mapDocumentationRecord).filter(isActive);
    const documentsByRecordId = new Map(documents.map(item => [item.recordId, item]));
    const itemsByRecordId = new Map(publishedItems.map(item => [item.recordId, item]));

    documents.forEach(document => {
      document.appearsIn = [...new Set(
        document.sopRecordIds.flatMap(id => itemsByRecordId.get(id)?.appearsIn || [])
      )];
    });

    publishedItems.forEach(item => {
      item.relatedResources = item.relatedResourceIds
        .map(id => documentsByRecordId.get(id))
        .filter(Boolean);
      item.unresolvedRelatedResources.forEach(title => {
        item.relatedResources.push({ title, url: "", unresolved: true });
      });
      item.linkedTasks = item.linkedTaskIds
        .map(id => itemsByRecordId.get(id))
        .filter(Boolean);
      item.unresolvedLinkedTasks.forEach(title => {
        item.linkedTasks.push({ title, unresolved: true });
      });
      item.resourceCount = item.relatedResources.length;
    });
    const requestTypes = buildRequestTypes(publishedItems, items);

    return {
      items: publishedItems,
      documents,
      requestTypes,
      unmapped: publishedItems.filter(item => !item.mappingValid),
      section(displayType, baseSection) {
        return publishedItems
          .filter(item => item.displayType === displayType && item.baseSection === baseSection)
          .sort((a, b) => b.priority - a.priority || a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
      },
      documentsFor(placement) {
        return documents
          .filter(item => item.websitePlacements.some(value => normalizeKey(value) === normalizeKey(placement)))
          .sort((a, b) => b.priority - a.priority || a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
      },
      featuredFor(placement) {
        const now = Date.now();
        const featureWindow = 14 * 24 * 60 * 60 * 1000;
        const placementAliases = normalizeKey(placement) === "important news"
          ? new Set(["important news", "news"])
          : new Set(["sop updates", "sop update"]);
        return publishedItems
          .filter(item => item.featuredIn.some(value => placementAliases.has(normalizeKey(value))))
          .map(item => {
            const raw = String(item.publishDate || "").trim();
            const publishedAt = /^\d{10,13}$/.test(raw)
              ? (raw.length === 10 ? Number(raw) * 1000 : Number(raw))
              : Date.parse(raw);
            return { item, publishedAt };
          })
          .filter(({ publishedAt }) => Number.isFinite(publishedAt) && now >= publishedAt && now - publishedAt <= featureWindow)
          .sort((a, b) => b.publishedAt - a.publishedAt || a.item.sortOrder - b.item.sortOrder)
          .map(({ item }) => ({
            ...item,
            isFeatured: true,
            summary: item.featureSummary || item.summary
          }));
      },
      processesFor(requestType) {
        return publishedItems
          .filter(item =>
            ["Process", "Process Group"].includes(item.displayType) &&
            item.baseSection === "Process Content" &&
            item.appearsIn.some(context => normalizeKey(context) === normalizeKey(requestType))
          )
          .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
      },
      wrapStepsFor(parent) {
        return publishedItems
          .filter(item => item.displayType === "Checklist Step" && item.baseSection === "Wrap Up")
          .filter(item =>
            item.parentIds.includes(parent.recordId) ||
            item.parents.some(value => normalizeKey(value) === normalizeKey(parent.title))
          )
          .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
      },
      search(query, filters = {}) {
        const normalized = normalizeKey(query);
        const terms = normalized.split(" ").filter(Boolean);
        const source = normalizeKey(filters.source || "all");
        const contentType = normalizeKey(filters.contentType || "all");
        const requestType = normalizeKey(filters.requestType || "all");
        const updatedDays = Number(filters.updatedDays || 0);
        const now = Date.now();

        return [...publishedItems, ...documents]
          .filter(item => item.displayType !== "Request Type")
          .filter(item => source === "all" || (source === "resource") === (item.sourceType === "Documentation"))
          .filter(item => contentType === "all" || normalizeKey(item.displayType) === contentType || normalizeKey(item.category) === contentType)
          .filter(item => requestType === "all" || (item.appearsIn || []).some(value => normalizeKey(value) === requestType))
          .filter(item => {
            if (!updatedDays) return true;
            const raw = String(item.lastUpdated || item.publishDate || "").trim();
            const timestamp = /^\d{10,13}$/.test(raw)
              ? (raw.length === 10 ? Number(raw) * 1000 : Number(raw))
              : Date.parse(raw);
            return Number.isFinite(timestamp) && now >= timestamp && now - timestamp <= updatedDays * 24 * 60 * 60 * 1000;
          })
          .map(item => {
            const title = normalizeKey(item.title);
            const haystack = normalizeKey([
              item.title, item.summary, item.instruction,
              item.category,
              ...(item.appearsIn || []), ...(item.ticketTags || []), ...(item.keywords || []),
              ...(item.websitePlacements || []),
              ...(item.relatedResources || []).map(resource => `${resource.title || ""} ${resource.summary || ""}`),
              ...(item.linkedTasks || []).map(task => `${task.title || ""} ${task.summary || ""}`)
            ].join(" "));
            const matchesTerms = !terms.length || terms.every(term => haystack.includes(term));
            const score = !matchesTerms ? 0 : title === normalized ? 100 : title.startsWith(normalized) ? 75 : title.includes(normalized) ? 50 : 20;
            return { item, score };
          })
          .filter(result => result.score > 0)
          .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
          .slice(0, 50)
          .map(result => result.item);
      },
      find(id) {
        return publishedItems.find(item => item.id === id || item.recordKey === id) ||
          documents.find(item => item.id === id || item.recordKey === id) ||
          requestTypes.find(item => item.id === id || item.recordKey === id);
      }
    };
  }

  window.BOTSOP = {
    DISPLAY_TYPES,
    BASE_SECTIONS,
    SECTION_CONTRACT,
    mapRecord,
    mapDocumentationRecord,
    buildModel,
    textValue,
    urlValue,
    richTextValue,
    listValue,
    relationIds,
    attachmentList,
    slugify
  };

  window.baseDataReady = fetch("/api/base-records", {
    credentials: "same-origin",
    headers: { Accept: "application/json" }
  }).then(async response => {
    if (response.status === 401) {
      window.location.replace("/api/auth/login");
      return new Promise(() => {});
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Unable to load Base records");
    if (!(payload.records || []).length) throw new Error("The configured Base view returned no records");

    window.baseModel = buildModel(payload.records || [], payload.documentationRecords || []);
    window.navigationItems = [...window.baseModel.requestTypes, ...window.baseModel.items];
    window.baseMeta = payload.meta || {};
    return window.baseModel;
  });
})();

