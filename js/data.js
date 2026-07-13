window.navigationItems = [];

(function configureBaseData() {
  "use strict";

  const DISPLAY_TYPES = {
    "request type": "Request Type",
    "process group": "Process Group",
    process: "Process",
    section: "Section",
    checklist: "Checklist",
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
    "oos routing": "OOS Routing",
    "bot tools": "BOT Tools",
    "opus links": "OPUS Links",
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
    "Callout|OOS Routing": "left OOS Routing card",
    "Tool|BOT Tools": "right BOT Tools card",
    "Link|OPUS Links": "right OPUS Links card",
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
        value.text ?? value.name ?? value.link ?? value.url ?? value.id ?? value.record_id ?? ""
      );
    }
    return "";
  }

  function listValue(value) {
    if (Array.isArray(value)) return value.map(textValue).filter(Boolean);
    const text = textValue(value);
    return text ? text.split(/[,\n]/).map(item => item.trim()).filter(Boolean) : [];
  }

  function relationNames(value) {
    if (!value) return [];
    if (!Array.isArray(value)) return listValue(value);
    return value.map(item => textValue(item)).filter(Boolean);
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

  function getIcon(record) {
    if (record.iconKey) return record.iconKey;
    const icons = {
      "Request Type": "folder",
      "Process Group": "folders",
      Process: "file-text",
      Section: "info",
      Checklist: "circle-check-big",
      Callout: "route",
      Tool: "wrench",
      Link: "link",
      News: "megaphone",
      "SOP Update": "file-clock",
      Warning: "shield-alert"
    };
    return icons[record.displayType] || "file-text";
  }

  function mapRecord(record, index, usedIds) {
    const fields = record.fields || {};
    const title = textValue(findField(fields, ["Content Name", "Title", "Name"])) || `Record ${index + 1}`;
    const recordKey = textValue(findField(fields, ["Record Key", "Slug", "ID"])) || slugify(title);
    let id = slugify(recordKey);
    if (usedIds.has(id)) id = `${id}-${String(record.record_id || index).slice(-6)}`;
    usedIds.add(id);

    const instruction = textValue(findField(fields, ["Instruction", "Content", "Guidance"]));
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

    const item = {
      id,
      recordId: record.record_id || "",
      recordKey,
      title,
      displayType,
      baseSection,
      iconKey: textValue(findField(fields, ["Icon Key", "Icon"])),
      summary: textValue(findField(fields, ["Summary", "Description"])),
      instruction,
      appearsIn: listValue(findField(fields, ["Appears In"])).map(canonicalRequestType),
      parents: relationNames(findField(fields, ["Parent"])),
      sortOrder: numberValue(findField(fields, ["Sort Order"]), index + 1),
      priority: numberValue(findField(fields, ["Priority"]), 0),
      status: textValue(findField(fields, ["Status"])) || "Active",
      published: boolValue(findField(fields, ["Published"]), true),
      url: textValue(findField(fields, ["URL", "Link"])),
      ctaLabel: textValue(findField(fields, ["CTA Label"])) || "Open",
      badge: textValue(findField(fields, ["Badge"])),
      publishDate: textValue(findField(fields, ["Publish Date"])),
      expirationDate: textValue(findField(fields, ["Expiration Date"])),
      lastUpdated: textValue(findField(fields, ["Last Updated"])) || "Not available",
      screenshotGuidance: textValue(findField(fields, ["Screenshot Guidance"])),
      screenshots: findField(fields, ["Screenshots", "Attachments"]),
      relatedResources: relationNames(findField(fields, ["Related Resources"])),
      linkedTasks: relationNames(findField(fields, ["Linked Tasks"])),
      ticketTags: listValue(findField(fields, ["Ticket Tags"])),
      ticketTagDisplay: textValue(findField(fields, ["Ticket Tag Display"])),
      closingGuidance: textValue(findField(fields, ["Closing Guidance"])),
      workflow: textValue(findField(fields, ["Workflow"])) || "BOT"
    };

    item.description = item.summary || shortDescription(item.instruction);
    item.icon = getIcon(item);
    item.contractKey = `${item.displayType}|${item.baseSection}`;
    item.destination = SECTION_CONTRACT[item.contractKey] || "Unmapped";
    item.mappingValid = Boolean(SECTION_CONTRACT[item.contractKey]);
    item.resourceCount = item.relatedResources.length;
    return item;
  }

  function buildRequestTypes(items) {
    const explicit = items.filter(item => item.displayType === "Request Type");
    const contexts = new Set();
    items
      .filter(item => ["Process", "Process Group"].includes(item.displayType))
      .forEach(item => item.appearsIn.forEach(context => {
        if (context && normalizeKey(context) !== "global") contexts.add(context);
      }));
    explicit.forEach(item => contexts.add(item.title));

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

  function buildModel(records) {
    const usedIds = new Set();
    const items = records.map((record, index) => mapRecord(record, index, usedIds));
    const publishedItems = items.filter(item => item.published);
    const requestTypes = buildRequestTypes(publishedItems);

    return {
      items: publishedItems,
      requestTypes,
      unmapped: publishedItems.filter(item => !item.mappingValid),
      section(displayType, baseSection) {
        return publishedItems
          .filter(item => item.displayType === displayType && item.baseSection === baseSection)
          .sort((a, b) => b.priority - a.priority || a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
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
      find(id) {
        return publishedItems.find(item => item.id === id || item.recordKey === id) ||
          requestTypes.find(item => item.id === id || item.recordKey === id);
      }
    };
  }

  window.BOTSOP = {
    DISPLAY_TYPES,
    BASE_SECTIONS,
    SECTION_CONTRACT,
    mapRecord,
    buildModel,
    textValue,
    listValue,
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

    window.baseModel = buildModel(payload.records || []);
    window.navigationItems = [...window.baseModel.requestTypes, ...window.baseModel.items];
    window.baseMeta = payload.meta || {};
    return window.baseModel;
  });
})();
