window.navigationItems = [];

(function configureBaseData() {
  function findField(fields, names) {
    const entries = Object.entries(fields || {});

    for (const name of names) {
      const direct = fields?.[name];
      if (direct !== undefined) return direct;

      const match = entries.find(
        ([key]) => key.trim().toLowerCase() === name.toLowerCase()
      );
      if (match) return match[1];
    }

    return null;
  }

  function textValue(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value.trim();
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    if (Array.isArray(value)) {
      return value.map(textValue).filter(Boolean).join(", ");
    }
    if (typeof value === "object") {
      return textValue(
        value.text ?? value.name ?? value.link ?? value.id ?? ""
      );
    }
    return "";
  }

  function listValue(value) {
    if (Array.isArray(value)) {
      return value.map(textValue).filter(Boolean);
    }

    const text = textValue(value);
    if (!text) return [];

    return text.split(/[,\n]/).map(item => item.trim()).filter(Boolean);
  }

  function slugify(value) {
    return textValue(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "record";
  }

  function shortDescription(value) {
    const text = textValue(value).replace(/\s+/g, " ");
    return text.length > 180 ? `${text.slice(0, 177)}...` : text;
  }

  const requestTypeDefinitions = {
    "video/photo post": { title: "Video / Photo Post", icon: "🎬", order: 1 },
    "video / photo post": { title: "Video / Photo Post", icon: "🎬", order: 1 },
    "account": { title: "Account", icon: "👤", order: 2 },
    "live": { title: "Live", icon: "📡", order: 3 },
    "comment": { title: "Comment", icon: "💬", order: 4 },
    "direct message": { title: "Direct Message", icon: "✉️", order: 5 },
    "dm": { title: "Direct Message", icon: "✉️", order: 5 },
    "live comment": { title: "Live Comment", icon: "💬", order: 6 },
    "user profile": { title: "User Profile", icon: "👤", order: 7 },
    "circumvention / recidivism": {
      title: "Circumvention / Recidivism",
      icon: "🛡️",
      order: 8
    },
    "response wrap-up": { title: "Response Wrap-Up", icon: "✅", order: 9 },
    "oos routing": { title: "OOS Routing", icon: "🔀", order: 10 }
  };

  function requestType(value) {
    const suppliedTitle = textValue(value).replace(/\s+/g, " ").trim();
    const key = suppliedTitle.toLowerCase();
    const definition = requestTypeDefinitions[key];

    return definition || {
      title: suppliedTitle || "Other",
      icon: "📁",
      order: 1000
    };
  }

  function parentTitle(value) {
    let parent = value;

    if (Array.isArray(parent)) parent = parent[0];
    if (parent && typeof parent === "object") {
      parent = parent.text ?? parent.name ?? parent.id ?? parent.record_id ?? "";
    }

    return textValue(parent);
  }

  function mapRecords(records) {
    const usedIds = new Set();

    const sourceItems = records.map((record, index) => {
      const fields = record.fields || {};
      const title = textValue(findField(fields, [
        "Content Name",
        "Title",
        "Name"
      ])) || `Record ${index + 1}`;
      const requestedId = slugify(
        findField(fields, ["Slug", "ID"]) || title
      );
      let id = requestedId;

      if (usedIds.has(id)) {
        id = `${requestedId}-${String(record.record_id || index).slice(-6)}`;
      }
      usedIds.add(id);

      const instruction = textValue(findField(fields, [
        "Instruction",
        "Content",
        "Guidance"
      ]));
      const summary = textValue(findField(fields, ["Summary", "Description"]));

      return {
        id,
        recordId: record.record_id,
        title,
        icon: textValue(findField(fields, ["Icon", "Icon Key"])) || "📄",
        description: summary || shortDescription(instruction),
        rawParent: findField(fields, ["Parent"]),
        parent: null,
        appearsIn: listValue(findField(fields, ["Appears In"])),
        sortOrder: Number(textValue(findField(fields, ["Sort Order"]))) || index + 1,
        status: textValue(findField(fields, ["Status"])) || "Active",
        workflow: textValue(findField(fields, ["Workflow"])) || "BOT",
        lastUpdated: textValue(findField(fields, ["Last Updated"])) || "Not available",
        displayType: textValue(findField(fields, ["Display Type"])) || "Process",
        content: instruction,
        screenshotGuidance: textValue(findField(fields, ["Screenshot Guidance"])),
        relatedResources: textValue(findField(fields, ["Related Resources"])),
        linkedTasks: textValue(findField(fields, ["Linked Tasks"])),
        ticketTags: textValue(findField(fields, ["Ticket Tags"])),
        ticketTagDisplay: textValue(findField(fields, ["Ticket Tag Display"])),
        closingGuidance: textValue(findField(fields, ["Closing Guidance"]))
      };
    });

    const categoryByTitle = new Map();
    const categories = [];

    for (const item of sourceItems) {
      const requestedTypes = item.appearsIn.length
        ? item.appearsIn
        : [parentTitle(item.rawParent) || "Other"];

      item.requestTypes = requestedTypes.map(requestType);

      for (const definition of item.requestTypes) {
        const key = definition.title.toLowerCase();
        if (categoryByTitle.has(key)) continue;

        const category = {
          id: `request-${slugify(definition.title)}`,
          title: definition.title,
          icon: definition.icon,
          description: `${definition.title} processes and operational guidance.`,
          parent: null,
          appearsIn: [definition.title],
          sortOrder: definition.order,
          displayType: "Request Type",
          synthetic: true
        };

        categoryByTitle.set(key, category);
        categories.push(category);
      }
    }

    const groupsByKey = new Map();
    const groups = [];
    const leaves = [];

    for (const item of sourceItems) {
      const configuredParent = parentTitle(item.rawParent);

      item.requestTypes.forEach((definition, placementIndex) => {
        const category = categoryByTitle.get(definition.title.toLowerCase());
        const parentMatchesCategory = configuredParent &&
          requestType(configuredParent).title.toLowerCase() ===
            definition.title.toLowerCase();
        let navigationParent = category.id;

        if (configuredParent && !parentMatchesCategory) {
          const groupKey = `${category.id}|${configuredParent.toLowerCase()}`;
          let group = groupsByKey.get(groupKey);

          if (!group) {
            group = {
              id: `group-${slugify(definition.title)}-${slugify(configuredParent)}`,
              title: configuredParent,
              icon: "📂",
              description: `${configuredParent} guidance for ${definition.title}.`,
              parent: category.id,
              appearsIn: [definition.title],
              sortOrder: item.sortOrder,
              displayType: "Process Group",
              synthetic: true
            };
            groupsByKey.set(groupKey, group);
            groups.push(group);
          } else {
            group.sortOrder = Math.min(group.sortOrder, item.sortOrder);
          }

          navigationParent = group.id;
        }

        leaves.push({
          ...item,
          id: `${item.id}--${slugify(definition.title)}-${placementIndex + 1}`,
          parent: navigationParent,
          placement: definition.title,
          resourceCount: listValue(item.relatedResources).length
        });
      });
    }

    categories.sort((left, right) =>
      left.sortOrder - right.sortOrder || left.title.localeCompare(right.title)
    );

    return [...categories, ...groups, ...leaves];
  }

  function escapeHtml(value) {
    return textValue(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function textToHtml(value) {
    const text = escapeHtml(value);
    if (!text) return "<p>No guidance has been added yet.</p>";
    return `<p>${text.replace(/\n/g, "<br>")}</p>`;
  }

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

    const items = mapRecords(payload.records || []);
    if (!items.length) throw new Error("The configured Base view returned no records");

    window.navigationItems = items;
    window.baseMeta = payload.meta || {};
    return items;
  });

  window.installBaseRecordRenderer = function installBaseRecordRenderer() {
    window.showRecord = function showBaseRecord(recordId) {
      const contentView = document.getElementById("content-view");
      const record = window.navigationItems.find(item => item.id === recordId);

      if (!contentView || !record) return;

      if (typeof saveRecentlyViewed === "function") saveRecentlyViewed(record.id);
      if (typeof renderRecentlyViewedWidget === "function") {
        renderRecentlyViewedWidget();
      }

      const breadcrumb = typeof getBreadcrumb === "function"
        ? getBreadcrumb(record.id)
        : [record];
      const optionalSections = [
        ["Screenshot Guidance", record.screenshotGuidance],
        ["Related Resources", record.relatedResources],
        ["Linked Tasks", record.linkedTasks],
        ["Ticket Tags", record.ticketTags],
        ["Ticket Tag Display", record.ticketTagDisplay],
        ["Closing Guidance", record.closingGuidance]
      ].filter(([, value]) => value);

      const panels = typeof buildGlobalInfoPanels === "function"
        ? buildGlobalInfoPanels()
        : "";

      contentView.innerHTML = `
        ${panels}
        <div class="entry-page">
          <div class="section-toolbar">
            <button class="back-button" type="button" onclick="goBack()">← Back</button>
            <nav class="breadcrumb" aria-label="Breadcrumb">
              <span>Home</span>
              ${breadcrumb.map(item => `
                <span aria-hidden="true">›</span>
                <span>${escapeHtml(item.title)}</span>
              `).join("")}
            </nav>
          </div>

          <header class="entry-header">
            <div>
              <h1>${escapeHtml(record.title)}</h1>
              <p>${escapeHtml(record.description)}</p>
            </div>
            <div class="entry-meta">
              <span class="entry-status active">${escapeHtml(record.status)}</span>
              <span class="entry-updated">Updated ${escapeHtml(record.lastUpdated)}</span>
            </div>
          </header>

          <section class="entry-overview">
            ${typeof buildEntryOverviewCard === "function" ? buildEntryOverviewCard({
              icon: "workflow",
              label: "Display Type",
              value: record.displayType
            }) : ""}
            ${typeof buildEntryOverviewCard === "function" ? buildEntryOverviewCard({
              icon: "link",
              label: "Resources",
              value: `${record.resourceCount} Linked`
            }) : ""}
          </section>

          <section class="entry-body">
            ${typeof buildExpandableEntrySection === "function"
              ? buildExpandableEntrySection({
                  id: `guidance-${record.id}`,
                  icon: "clipboard-list",
                  eyebrow: "Process Content",
                  title: record.title,
                  description: record.description || "Operational guidance",
                  content: textToHtml(record.content)
                })
              : `<article>${textToHtml(record.content)}</article>`}

            ${optionalSections.map(([title, value], index) =>
              typeof buildExpandableEntrySection === "function"
                ? buildExpandableEntrySection({
                    id: `base-detail-${record.id}-${index}`,
                    icon: "info",
                    eyebrow: "Supporting Information",
                    title,
                    description: "",
                    content: textToHtml(value)
                  })
                : `<article><h2>${escapeHtml(title)}</h2>${textToHtml(value)}</article>`
            ).join("")}
          </section>
        </div>
      `;

      if (window.lucide?.createIcons) window.lucide.createIcons();
    };
  };
})();
