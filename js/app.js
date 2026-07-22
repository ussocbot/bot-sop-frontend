window.appState = {
  currentView: "home",
  currentSection: null,
  currentQuery: "",
  history: [],
  favorites: new Set(),
  favoritePending: new Set(),
  searchFilters: { source: "all", contentType: "all", requestType: "all", updatedDays: "all" }
};

(function installApp() {
  "use strict";

  function contentView() {
    return document.getElementById("content-view");
  }

  function isStandaloneBackup() {
    const path = window.location.pathname.replace(/\/+$/, "") || "/";
    const params = new URLSearchParams(window.location.search);
    return path === "/backup" || (params.get("page") === "backup" && params.get("standalone") === "1");
  }

  function isQuickMobile() {
    return document.documentElement.classList.contains("quick-mobile");
  }

  window.focusQuickSearch = function focusQuickSearch() {
    const input = document.querySelector(".header-search input");
    window.scrollTo({ top: 0, behavior: "smooth" });
    input?.focus({ preventScroll: true });
  };

  window.toggleMobileCategories = function toggleMobileCategories(button) {
    const section = button?.closest(".mobile-quick-section");
    if (!section) return;
    const expanded = button.getAttribute("aria-expanded") === "true";
    section.querySelectorAll(".mobile-category-extra").forEach(item => {
      item.hidden = expanded;
    });
    button.setAttribute("aria-expanded", String(!expanded));
    button.textContent = expanded ? "View all" : "Show less";
  };

  function mobileQuickHome(favorites, outOfScope, updatePanels) {
    const categories = window.baseModel?.requestTypes || [];
    const favoriteRows = favorites.slice(0, 5).map(item => `
      <button type="button" class="mobile-quick-row" onclick="showRecord('${window.BOTSOP_UI.escape(item.id)}')">
        <span>${window.BOTSOP_UI.icon(item.icon || "star")}</span>
        <strong>${window.BOTSOP_UI.escape(item.title)}</strong>
        ${window.BOTSOP_UI.icon("chevron-right")}
      </button>
    `).join("");

    return `
      <div class="mobile-quick-home">
        <section class="mobile-search-prompt">
          <span class="mobile-search-prompt__icon">${window.BOTSOP_UI.icon("search")}</span>
          <div><h1>Find guidance fast</h1><p>Search SOPs, ticket guidance, tools, and Resource Hub entries.</p></div>
          <button type="button" onclick="window.focusQuickSearch()">Start searching</button>
        </section>

        <section class="mobile-quick-section">
          <header><div><span>Browse</span><h2>Guidance categories</h2></div>${categories.length > 8 ? `<button type="button" aria-expanded="false" onclick="toggleMobileCategories(this)">View all</button>` : ""}</header>
          <div class="mobile-category-grid">
            ${categories.map((item, index) => `
              <button type="button" class="${index >= 8 ? "mobile-category-extra" : ""}" ${index >= 8 ? "hidden" : ""} onclick="showSection('${window.BOTSOP_UI.escape(item.id)}')">
                ${window.BOTSOP_UI.icon(item.icon || "folder")}
                <span>${window.BOTSOP_UI.escape(item.title)}</span>
              </button>
            `).join("")}
          </div>
        </section>

        ${favorites.length ? `
          <section class="mobile-quick-section">
            <header><div><span>Personal</span><h2>Favorites</h2></div><button type="button" onclick="showFavorites()">View all</button></header>
            <div class="mobile-quick-list">${favoriteRows}</div>
          </section>
        ` : ""}

        <section class="mobile-updates-grid" aria-label="Updates and news">
          <button type="button" class="mobile-update-shortcut mobile-update-shortcut--news" onclick="showUpdateArchive('important-news')">
            <span>${window.BOTSOP_UI.icon("megaphone")}</span>
            <span><strong>Important News</strong><small>${updatePanels.news} active update${updatePanels.news === 1 ? "" : "s"}</small></span>
            ${window.BOTSOP_UI.icon("chevron-right")}
          </button>
          <button type="button" class="mobile-update-shortcut mobile-update-shortcut--sop" onclick="showUpdateArchive('sop-updates')">
            <span>${window.BOTSOP_UI.icon("file-clock")}</span>
            <span><strong>SOP Updates</strong><small>${updatePanels.sop} active update${updatePanels.sop === 1 ? "" : "s"}</small></span>
            ${window.BOTSOP_UI.icon("chevron-right")}
          </button>
        </section>

        ${outOfScope.length ? `
          <button type="button" class="mobile-oos-shortcut" onclick="showOosRouting()">
            <span>${window.BOTSOP_UI.icon("route")}</span>
            <span><strong>OOS Routing</strong><small>Open quick routing guidance</small></span>
            ${window.BOTSOP_UI.icon("chevron-right")}
          </button>
        ` : ""}

        <a class="mobile-full-site-link" href="?desktop=1" target="_blank" rel="noopener noreferrer">
          ${window.BOTSOP_UI.icon("external-link")} Open the full BOT SOP
        </a>
      </div>
    `;
  }

  function renderAndRefresh(html) {
    const target = contentView();
    if (!target) return;
    target.innerHTML = html;
    target.querySelectorAll("details[data-accordion-group]").forEach(details => {
      const summary = details.querySelector(":scope > summary");
      const rememberAnchor = () => {
        details.__anchorTop = summary?.getBoundingClientRect().top;
      };
      summary?.addEventListener("pointerdown", rememberAnchor);
      summary?.addEventListener("keydown", event => {
        if (["Enter", " "].includes(event.key)) rememberAnchor();
      });
      details.addEventListener("toggle", () => {
        if (!details.open) return;
        const anchorTop = Number.isFinite(details.__anchorTop)
          ? details.__anchorTop
          : summary?.getBoundingClientRect().top;
        const group = details.dataset.accordionGroup;
        target.querySelectorAll(`details[data-accordion-group="${group}"][open]`).forEach(other => {
          if (other !== details) other.open = false;
        });
        window.requestAnimationFrame(() => {
          if (!summary || !details.open) return;
          summary.focus({ preventScroll: true });
          if (!Number.isFinite(anchorTop)) return;
          const movement = summary.getBoundingClientRect().top - anchorTop;
          if (Math.abs(movement) > 1) window.scrollBy({ top: movement, left: 0, behavior: "auto" });
          details.__anchorTop = undefined;
        });
      });
    });
    window.BOTSOP_UI.refreshIcons();
  }

  function placementKey(value) {
    return String(value || "").trim().toLowerCase().replace(/\s*\/\s*/g, "/").replace(/\s+/g, " ");
  }

  function appearsIn(item, placement) {
    const wanted = placementKey(placement);
    return (item.appearsIn || []).some(value => placementKey(value) === wanted);
  }

  function guidanceItemsFor(displayType) {
    return (window.baseModel?.items || [])
      .filter(item => item.displayType === displayType)
      .sort((a, b) => (b.priority || 0) - (a.priority || 0) || a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
  }

  function uniqueItems(items) {
    return [...new Map((items || []).map(item => [item.id, item])).values()];
  }

  function processAccordionList(items, layout = "default") {
    return `<div class="process-list">${items.map(item => window.BOTSOP_UI.processAccordion(item, entryActionButtons(item), layout)).join("")}</div>`;
  }

  function groupedContentList(items, layout = "default") {
    const groups = new Map();
    const nodes = [];
    items.forEach(item => {
      const name = String(item.contentGroup || "").trim();
      if (!name) {
        nodes.push({ type: "item", name: item.title, item });
        return;
      }
      const key = placementKey(name);
      if (!groups.has(key)) groups.set(key, { name, items: [] });
      groups.get(key).items.push(item);
    });
    groups.forEach(group => {
      group.items.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true }));
      nodes.push({ type: "group", name: group.name, group });
    });
    nodes.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }));
    return `
      <div class="content-group-list">
        ${nodes.map(node => node.type === "item"
          ? processAccordionList([node.item], layout)
          : `
          <details class="content-subgroup" open>
            <summary>
              <span>${window.BOTSOP_UI.icon("folder-tree")}<strong>${window.BOTSOP_UI.escape(node.group.name)}</strong></span>
              <small>${node.group.items.length} entr${node.group.items.length === 1 ? "y" : "ies"}</small>
              ${window.BOTSOP_UI.icon("chevron-down", "content-subgroup__chevron")}
            </summary>
            <div class="content-subgroup__body">${processAccordionList(node.group.items, layout)}</div>
          </details>
        `).join("")}
      </div>
    `;
  }

  function remember(view, id, query = "") {
    const previous = {
      view: window.appState.currentView,
      id: window.appState.currentSection,
      query: window.appState.currentQuery,
      scrollY: window.scrollY || 0
    };
    if (previous.view !== view || previous.id !== id || previous.query !== query) window.appState.history.push(previous);
    window.appState.currentView = view;
    window.appState.currentSection = id || null;
    window.appState.currentQuery = query || "";
  }

  function favoriteKey(item) {
    return `${item.sourceType === "Documentation" ? "resource" : "sop"}:${item.recordId}`;
  }

  function favoriteButton(item, compact = false) {
    if (!window.baseMeta?.favoritesEnabled || !item.recordId || item.displayType === "Left Nav") return "";
    const active = window.appState.favorites.has(favoriteKey(item));
    const pending = window.appState.favoritePending.has(favoriteKey(item));
    const label = pending ? "Saving favorite" : (active ? "Remove from Favorites" : "Add to Favorites");
    return `<button type="button" data-favorite-id="${window.BOTSOP_UI.escape(item.id)}" class="favorite-button${compact ? " favorite-button--meta" : ""}${active ? " is-favorite" : ""}" onclick="toggleFavorite('${window.BOTSOP_UI.escape(item.id)}')" aria-label="${label}" title="${label}"${pending ? " disabled" : ""}>${window.BOTSOP_UI.icon(pending ? "loader-circle" : "star")}<span class="entry-action-label">${label}</span></button>`;
  }

  function sendToMeButton(item) {
    if (!window.baseMeta?.sendToMeEnabled || !item.recordId || item.displayType === "Left Nav") return "";
    return `<button type="button" class="send-to-me-button" onclick="sendToMe('${window.BOTSOP_UI.escape(item.id)}', this)" aria-label="Send to Me" title="Send to Me">${window.BOTSOP_UI.icon("send")}<span class="entry-action-label">Send to Me</span></button>`;
  }

  function updateEntryButton(item, compact = false) {
    if (
      !window.BOTSOP_SUBMISSIONS?.canSubmitUpdates?.() ||
      !item.recordId ||
      item.sourceType === "Documentation" ||
      item.displayType === "Left Nav"
    ) return "";
    return `<button type="button" class="update-entry-button${compact ? " update-entry-button--meta" : ""}" onclick="openUpdateSubmission('${window.BOTSOP_UI.escape(item.id)}')" aria-label="Update this SOP" title="Update this SOP">${window.BOTSOP_UI.icon("square-pen")}<span class="entry-action-label">Update this SOP</span></button>`;
  }

  function entryActionButtons(item) {
    const actions = [favoriteButton(item), sendToMeButton(item), updateEntryButton(item)].filter(Boolean).join("");
    return actions ? `<div class="inline-entry-actions">${actions}</div>` : "";
  }

  function favoriteItems() {
    return [...(window.baseModel?.items || []), ...(window.baseModel?.documents || [])]
      .filter(item => item.recordId && window.appState.favorites.has(favoriteKey(item)))
      .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true }));
  }

  function personalFavoritesSection(items) {
    if (!window.baseMeta?.favoritesEnabled) return "";
    return `
      <details class="home-strip home-strip--violet expectations-strip home-section-accordion personal-home-section" data-accordion-group="home-sections">
        <summary class="home-strip__heading">
          <span class="home-strip__icon">${window.BOTSOP_UI.icon("user-round")}</span>
          <div class="home-strip__heading-copy">
            <h2>Personal</h2>
            <p class="home-strip__summary">Your saved guidance and resources.</p>
          </div>
          <span class="home-strip__count">${items.length}</span>
          ${window.BOTSOP_UI.icon("chevron-down", "home-strip__chevron")}
        </summary>
        <div class="home-strip__content">
          <details class="expectation-item personal-favorites-accordion" data-accordion-group="home-entry-personal">
            <summary>
              <span class="expectation-item__title"><span class="expectation-item__icon">${window.BOTSOP_UI.icon("star")}</span><strong>Favorites</strong><small>${items.length} saved item${items.length === 1 ? "" : "s"}</small></span>
              ${window.BOTSOP_UI.icon("chevron-down")}
            </summary>
            <div class="expectation-item__body personal-favorites-accordion__body">
              ${items.length ? processAccordionList(items) : `<section class="empty-state personal-favorites-empty"><h2>No favorites yet</h2><p>Open an SOP or Resource and select Add to Favorites.</p></section>`}
            </div>
          </details>
        </div>
      </details>
    `;
  }

  window.BOTSOP_ENTRY_ACTIONS = entryActionButtons;

  window.showHome = function showHome(addToHistory = true) {
    const model = window.baseModel;
    if (!model) return;
    if (addToHistory) remember("home", null);
    else {
      window.appState.currentView = "home";
      window.appState.currentSection = null;
      window.appState.currentQuery = "";
    }
    window.setActiveNavigation(null);
    const searchInput = document.querySelector(".header-search input");
    if (searchInput) searchInput.value = "";

    const outOfScope = uniqueItems([
      ...guidanceItemsFor("Out of Scope"),
      ...model.documentsFor("OOS Routing")
    ]).sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
    const banOperatorsAndReasons = guidanceItemsFor("Ban Operators");
    const warnings = model.section("Warning");
    const favorites = favoriteItems();

    if (isQuickMobile()) {
      const news = uniqueItems([...model.featuredFor("Important News"), ...model.section("Important News")]);
      const sopUpdates = uniqueItems([...model.featuredFor("SOP Updates"), ...model.section("SOP Updates")]);
      renderAndRefresh(mobileQuickHome(favorites, outOfScope, { news: news.length, sop: sopUpdates.length }));
      return;
    }

    renderAndRefresh(`
      <div class="page-stack">
        ${window.BOTSOP_UI.mappingAlert(model.unmapped)}
        ${window.BOTSOP_UI.updatesCallout(window.baseMeta?.unacknowledgedUpdatesUrl)}
        ${personalFavoritesSection(favorites)}
        ${window.BOTSOP_UI.guidanceDropdownSection("Out of Scope", "route", outOfScope, "blue", "Routing guidance for work that falls outside BOT scope.")}
        ${window.BOTSOP_UI.guidanceDropdownSection("Ban Operators and Reasons", "shield-check", banOperatorsAndReasons, "orange", "Guidance for selecting ban operators and reason codes.")}
        ${window.BOTSOP_UI.warningCards(warnings)}
      </div>
    `);
  };

  window.showOosRouting = function showOosRouting(addToHistory = true) {
    const model = window.baseModel;
    if (!model) return;
    if (addToHistory) remember("oos", "oos-routing");
    else {
      window.appState.currentView = "oos";
      window.appState.currentSection = "oos-routing";
    }
    window.setActiveNavigation(null);
    const items = uniqueItems([
      ...model.section("Out of Scope"),
      ...model.documentsFor("OOS Routing")
    ]).sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
    renderAndRefresh(`
      <div class="page-stack">
        <nav class="breadcrumbs" aria-label="Breadcrumb"><button type="button" onclick="goBack()">${window.BOTSOP_UI.icon("arrow-left")} Back</button><span>&rsaquo;</span><span>OOS Routing</span></nav>
        <header class="section-title"><span class="section-title__icon">${window.BOTSOP_UI.icon("route")}</span><div><h2>All OOS Routing</h2><p>${items.length} active destination${items.length === 1 ? "" : "s"}.</p></div></header>
        ${items.length ? groupedContentList(items, "oos") : ""}
        ${!items.length ? `<section class="empty-state"><h2>No OOS destinations available</h2><p>Active OOS records will appear here.</p></section>` : ""}
      </div>
    `);
  };

  window.showUpdateArchive = function showUpdateArchive(type, addToHistory = true) {
    const model = window.baseModel;
    if (!model) return;
    const config = {
      "important-news": { title: "Important News", icon: "megaphone", items: [...model.featuredFor("Important News"), ...model.section("Important News")] },
      "sop-updates": { title: "SOP Updates", icon: "file-clock", items: [...model.featuredFor("SOP Updates"), ...model.section("SOP Updates")] },
      "macro-updates": { title: "Macro Updates", icon: "message-square-more", items: model.section("Macro Updates") }
    }[type];
    if (!config) return;
    if (addToHistory) remember("updates", type);
    else {
      window.appState.currentView = "updates";
      window.appState.currentSection = type;
      window.appState.currentQuery = "";
    }
    const unique = [...new Map(config.items.map(item => [item.id, item])).values()];
    const parseDate = value => {
      const raw = String(value || "").trim();
      if (/^\d{10,13}$/.test(raw)) return raw.length === 10 ? Number(raw) * 1000 : Number(raw);
      const parsed = Date.parse(raw);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const items = unique.sort((a, b) => parseDate(b.updateDateRaw || b.publishDate || b.lastUpdated) - parseDate(a.updateDateRaw || a.publishDate || a.lastUpdated) || a.title.localeCompare(b.title));
    window.setActiveNavigation(null);
    renderAndRefresh(`
      <div class="page-stack">
        <nav class="breadcrumbs" aria-label="Breadcrumb"><button type="button" onclick="goBack()">${window.BOTSOP_UI.icon("arrow-left")} Back</button><span>&rsaquo;</span><span>${window.BOTSOP_UI.escape(config.title)}</span></nav>
        <header class="section-title"><span class="section-title__icon">${window.BOTSOP_UI.icon(config.icon)}</span><div><h2>${window.BOTSOP_UI.escape(config.title)}</h2><p>${items.length} active update${items.length === 1 ? "" : "s"}, newest first.</p></div></header>
        <div class="process-grid">${items.map(window.BOTSOP_UI.processCard).join("")}</div>
        ${!items.length ? `<section class="empty-state"><h2>No updates available</h2><p>Published updates will appear here.</p></section>` : ""}
      </div>
    `);
  };

  window.showSection = function showSection(sectionId, addToHistory = true) {
    const model = window.baseModel;
    const requestType = model?.requestTypes.find(item => item.id === sectionId || item.recordKey === sectionId);
    if (!model || !requestType) return;
    if (addToHistory) remember("section", requestType.id);
    window.setActiveNavigation(requestType.id);

    const allItems = model.items
      .filter(item => item.displayType === "Content" && appearsIn(item, requestType.title))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));

    renderAndRefresh(`
      <div class="page-stack">
        <nav class="breadcrumbs" aria-label="Breadcrumb"><button type="button" onclick="showHome()">Home</button><span>&rsaquo;</span><span>${window.BOTSOP_UI.escape(requestType.title)}</span></nav>
        <header class="process-header">
          <span class="process-header__icon">${window.BOTSOP_UI.icon(requestType.icon || "folder")}</span>
          <div><p>Guidance Category</p><h1>${window.BOTSOP_UI.escape(requestType.title)}</h1><span>${window.BOTSOP_UI.escape(requestType.summary || requestType.description || "Operational guidance and workflows")}</span></div>
        </header>
        ${allItems.length ? `<section class="process-group"><header><div><h2>${window.BOTSOP_UI.escape(requestType.title)} Guidance</h2><p>Expand an entry or content group to view its complete guidance.</p></div></header>${groupedContentList(allItems)}</section>` : ""}
        ${!allItems.length ? `<section class="empty-state"><h2>No content mapped here</h2><p>Add <strong>${window.BOTSOP_UI.escape(requestType.title)}</strong> to a Content record's <strong>Appears In</strong> field.</p></section>` : ""}
      </div>
    `);
  };

  window.showRecord = function showRecord(recordId, addToHistory = true) {
    const model = window.baseModel;
    const item = model?.find(recordId);
    if (!model || !item) return;
    if (item.displayType === "Left Nav") return window.showSection(item.id, addToHistory);
    if (["BOT Tools", "Team Links", "OPUS Links", "QA Links"].includes(item.displayType) && item.sourceType !== "Documentation") {
      if (item.url) window.open(item.url, "_blank", "noopener,noreferrer");
      return;
    }
    if (addToHistory) remember("record", item.id);

    const context = item.appearsIn[0];
    const requestType = context && model.requestTypes.find(candidate => candidate.title === context);
    window.setActiveNavigation(requestType?.id || null);

    const badge = window.BOTSOP_UI.itemBadge(item);
    const meta = [
      item.status && `<span>${window.BOTSOP_UI.icon("circle-dot")} ${window.BOTSOP_UI.escape(item.status)}</span>`,
      item.lastUpdated && `<span>${window.BOTSOP_UI.icon("calendar-clock")} Updated ${window.BOTSOP_UI.escape(item.lastUpdated)}</span>`,
      item.effectiveThrough && `<span class="effective-through-meta">${window.BOTSOP_UI.icon("calendar-x-2")} Effective through ${window.BOTSOP_UI.escape(item.effectiveThrough)}</span>`,
      item.displayType && `<span>${window.BOTSOP_UI.icon("layout-template")} ${window.BOTSOP_UI.escape(item.displayType)}</span>`,
      favoriteButton(item, true),
      sendToMeButton(item),
      updateEntryButton(item, true)
    ].filter(Boolean).join("");

    renderAndRefresh(`
      <article class="record-page">
        <nav class="breadcrumbs" aria-label="Breadcrumb">
          <button type="button" onclick="goBack()">${window.BOTSOP_UI.icon("arrow-left")} Back</button><span>&rsaquo;</span><button type="button" onclick="showHome()">Home</button>
          ${requestType ? `<span>&rsaquo;</span><button type="button" onclick="showSection('${window.BOTSOP_UI.escape(requestType.id)}')">${window.BOTSOP_UI.escape(requestType.title)}</button>` : ""}
          <span>&rsaquo;</span><span>${window.BOTSOP_UI.escape(item.title)}</span>
        </nav>
        <header class="record-header">
          <span class="record-header__icon">${window.BOTSOP_UI.icon(item.icon || "file-text")}</span>
          <div><p>${window.BOTSOP_UI.escape(item.displayType || "Guidance")}</p><h1>${window.BOTSOP_UI.escape(item.title)}${badge ? `<span class="entry-new-badge entry-new-badge--header">${window.BOTSOP_UI.escape(badge)}</span>` : ""}</h1>${item.summary ? `<span>${window.BOTSOP_UI.escape(item.summary)}</span>` : ""}</div>
        </header>
        <div class="record-meta">${meta}</div>
        ${window.BOTSOP_UI.markdownSection("Guidance", "clipboard-list", item.instruction)}
        ${window.BOTSOP_UI.detailSection("Screenshot Guidance", "image", item.screenshotGuidance)}
        ${window.BOTSOP_UI.imageGallery(item.screenshots)}
        ${window.BOTSOP_UI.markdownSection("Closing Guidance", "message-square-check", item.closingGuidance, "entry-priority-section")}
        ${window.BOTSOP_UI.detailSection("Ticket Tags", "tags", item.ticketTagDisplay, "entry-priority-section")}
        ${window.BOTSOP_UI.relatedItemsSection(item)}
      </article>
    `);
  };

  function backupEntry(item) {
    const relatedResources = (item.relatedResources || []).filter(entry => entry?.url);
    const linkedTasks = (item.linkedTasks || []).filter(entry => entry?.title && !entry.unresolved);
    const resourceName = String(item.ctaLabel || "").trim().toLowerCase() === "open resource"
      ? item.title
      : (item.ctaLabel || item.title || item.url);
    return `
      <section class="backup-entry">
        <h3>${window.BOTSOP_UI.escape(item.title)}</h3>
        <div class="backup-entry__meta">
          ${item.displayType ? `<span>${window.BOTSOP_UI.escape(item.displayType)}</span>` : ""}
          ${item.lastUpdated ? `<span>Updated ${window.BOTSOP_UI.escape(item.lastUpdated)}</span>` : ""}
          ${item.effectiveThrough ? `<span>Effective through ${window.BOTSOP_UI.escape(item.effectiveThrough)}</span>` : ""}
        </div>
        ${item.summary ? `<p class="backup-entry__summary">${window.BOTSOP_UI.escape(item.summary)}</p>` : ""}
        ${item.instruction ? `<div class="backup-entry__guidance formatted-content">${window.BOTSOP_UI.markdown(item.instruction)}</div>` : ""}
        ${item.url ? `<p class="backup-entry__resource"><strong>${window.BOTSOP_UI.escape(resourceName || item.url)}</strong><br><a href="${window.BOTSOP_UI.escape(item.url)}">${window.BOTSOP_UI.escape(item.url)}</a></p>` : ""}
        ${item.closingGuidance ? `<div class="backup-entry__closing formatted-content"><strong>Closing Guidance</strong>${window.BOTSOP_UI.markdown(item.closingGuidance)}</div>` : ""}
        ${item.ticketTagDisplay ? `<p class="backup-entry__tags"><strong>Ticket Tags</strong><br>${window.BOTSOP_UI.escape(item.ticketTagDisplay)}</p>` : ""}
        ${relatedResources.length ? `<div class="backup-entry__related"><strong>Related Resources</strong><ul>${relatedResources.map(entry => `<li><strong>${window.BOTSOP_UI.escape(entry.title || entry.url)}</strong><br><a href="${window.BOTSOP_UI.escape(entry.url)}">${window.BOTSOP_UI.escape(entry.url)}</a></li>`).join("")}</ul></div>` : ""}
        ${linkedTasks.length ? `<div class="backup-entry__related"><strong>Related Tasks</strong><ul>${linkedTasks.map(entry => `<li>${window.BOTSOP_UI.escape(entry.title)}</li>`).join("")}</ul></div>` : ""}
        ${(item.screenshots || []).length ? `<div class="backup-entry__images">${item.screenshots.map(image => `<figure><img src="${window.BOTSOP_UI.escape(image.src)}" alt="${window.BOTSOP_UI.escape(image.name)}"><figcaption>${window.BOTSOP_UI.escape(image.name)}</figcaption></figure>`).join("")}</div>` : ""}
      </section>
    `;
  }

  function backupSection(id, title, items, summary = "") {
    if (!items.length) return "";
    return `
      <section class="backup-section backup-document__panel" id="backup-${window.BOTSOP_UI.escape(id)}" data-backup-section="${window.BOTSOP_UI.escape(id)}" hidden>
        <h2>${window.BOTSOP_UI.escape(title)}</h2>
        ${summary ? `<p class="backup-section__summary">${window.BOTSOP_UI.escape(summary)}</p>` : ""}
        ${items.map(backupEntry).join("")}
      </section>
    `;
  }

  function backupSectionDefinitions() {
    const model = window.baseModel;
    const sections = [];

    model.requestTypes.forEach(category => {
      const items = model.processesFor(category.title);
      if (!items.length) return;
      sections.push({
        id: `request-${category.id}`,
        title: category.title,
        summary: category.summary || category.description || "Active operational guidance.",
        items
      });
    });

    [
      ["BOT Expectations", "BOT Expectations"],
      ["USDS JV Compliance", "USDS JV Compliance"],
      ["Out of Scope", "Out of Scope"],
      ["Ban Operators and Reasons", "Ban Operators"],
      ["Important News", "Important News"],
      ["SOP Updates", "SOP Updates"],
      ["Macro Updates", "Macro Updates"],
      ["BOT Tools", "BOT Tools"],
      ["Team Links", "Team Links"],
      ["OPUS Links", "OPUS Links"],
      ["QA Links", "QA Links"],
      ["Warnings and Policy Reminders", "Warning"]
    ].forEach(([title, displayType]) => {
      const items = model.section(displayType);
      if (!items.length) return;
      sections.push({
        id: `section-${displayType.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
        title,
        summary: "Current active guidance.",
        items
      });
    });

    return sections;
  }

  function buildBackupDocument() {
    const sections = backupSectionDefinitions();
    const includedItems = sections.flatMap(section => section.items);
    const linkedResources = new Map();
    includedItems.forEach(item => {
      (item.relatedResources || []).forEach(resource => {
        if (!resource?.url || resource.unresolved) return;
        linkedResources.set(resource.recordId || resource.id || resource.url, resource);
      });
    });

    const generatedAt = new Date().toLocaleString([], { dateStyle: "long", timeStyle: "short" });
    const navItems = [
      {
        id: "overview",
        title: "Current Guidance Overview",
        summary: "Directory of every active section in this copy.",
        count: includedItems.length
      },
      ...sections.map(section => ({
        id: section.id,
        title: section.title,
        summary: section.summary || "Current active guidance.",
        count: section.items.length
      }))
    ];
    return `
      <article class="backup-document" id="backup-document">
        <aside class="backup-document__nav" aria-label="Backup document sections">
          <span class="backup-document__nav-label">Current Guidance</span>
          ${navItems.map((item, index) => `
            <a href="#backup-${window.BOTSOP_UI.escape(item.id)}" data-backup-nav="${window.BOTSOP_UI.escape(item.id)}" aria-current="${index === 0 ? "page" : "false"}" onclick="if(window.showBackupSection){return window.showBackupSection(event, '${window.BOTSOP_UI.escape(item.id)}')}">
              <span class="backup-document__nav-copy">
                <strong>${window.BOTSOP_UI.escape(item.title)}</strong>
                <em>${window.BOTSOP_UI.escape(item.summary)}</em>
              </span>
              <small aria-label="${item.count} active entries">${item.count}</small>
            </a>
          `).join("")}
        </aside>
        <div class="backup-document__content">
          <header class="backup-document__cover backup-document__panel" id="backup-overview" data-backup-section="overview">
            <span class="backup-document__mark">BOT SOP</span>
            <h1>Current Operational Guidance</h1>
            <p>A focused copy containing only active guidance and the Resource Hub items linked directly to it.</p>
            <dl><div><dt>Generated</dt><dd>${window.BOTSOP_UI.escape(generatedAt)}</dd></div><div><dt>Active guidance</dt><dd>${includedItems.length}</dd></div><div><dt>Linked resources</dt><dd>${linkedResources.size}</dd></div><div><dt>Sections</dt><dd>${sections.length}</dd></div></dl>
            <div class="backup-overview-list">
              ${sections.map(section => `<a href="#backup-${window.BOTSOP_UI.escape(section.id)}" onclick="if(window.showBackupSection){return window.showBackupSection(event, '${window.BOTSOP_UI.escape(section.id)}')}"><span><strong>${window.BOTSOP_UI.escape(section.title)}</strong><small>${window.BOTSOP_UI.escape(section.summary || "Current active guidance.")}</small></span><b aria-label="${section.items.length} active entries">${section.items.length}</b></a>`).join("")}
            </div>
          </header>
          ${sections.map(section => backupSection(section.id, section.title, section.items, section.summary)).join("")}
        </div>
      </article>
    `;
  }

  window.showBackupSection = function showBackupSection(event, sectionId) {
    if (event?.preventDefault) event.preventDefault();
    const documentRoot = document.getElementById("backup-document");
    if (!documentRoot) return false;
    documentRoot.querySelectorAll("[data-backup-section]").forEach(section => {
      section.hidden = section.dataset.backupSection !== sectionId;
    });
    documentRoot.querySelectorAll("[data-backup-nav]").forEach(link => {
      link.setAttribute("aria-current", link.dataset.backupNav === sectionId ? "page" : "false");
    });
    documentRoot.scrollIntoView({ block: "start", behavior: "smooth" });
    return false;
  };

  window.showBackupDocument = function showBackupDocument(addToHistory = true) {
    if (!window.baseModel) return;
    const standalone = isStandaloneBackup();
    document.body.classList.toggle("backup-standalone", standalone);
    if (addToHistory) remember("backup", "backup-document");
    else {
      window.appState.currentView = "backup";
      window.appState.currentSection = "backup-document";
      window.appState.currentQuery = "";
    }
    window.setActiveNavigation(null);
    renderAndRefresh(`
      <div class="backup-page">
        ${standalone ? "" : `<nav class="breadcrumbs backup-page__breadcrumbs" aria-label="Breadcrumb"><button type="button" onclick="showHome()">Home</button><span>&rsaquo;</span><span>Backup Document</span></nav>`}
        <div class="backup-page__toolbar">
          <div><h2>Current Guidance Document</h2><p>Active guidance only. Resource Hub records appear only when linked to included content.</p></div>
          ${standalone ? `<a class="secondary-action backup-page__back" href="/">${window.BOTSOP_UI.icon("arrow-left")} Back to SOP</a>` : ""}
          <button type="button" class="secondary-action" onclick="downloadBackupDocument(this)">${window.BOTSOP_UI.icon("download")} Download Copy</button>
          <button type="button" class="primary-action" onclick="window.print()">${window.BOTSOP_UI.icon("printer")} Print / Save PDF</button>
        </div>
        ${buildBackupDocument()}
      </div>
    `);
  };

  window.downloadBackupDocument = async function downloadBackupDocument(button) {
    const source = document.getElementById("backup-document");
    if (!source) return;
    const originalButton = button?.innerHTML || "";
    if (button) {
      button.disabled = true;
      button.innerHTML = `${window.BOTSOP_UI.icon("loader-circle")} Preparing Copy`;
      window.BOTSOP_UI.refreshIcons();
    }
    const copy = source.cloneNode(true);
    copy.querySelectorAll("[data-backup-section]").forEach(section => { section.hidden = false; });
    copy.querySelectorAll("[data-backup-nav]").forEach(link => link.removeAttribute("aria-current"));
    const sourceImages = [...source.querySelectorAll("img")];
    const copyImages = [...copy.querySelectorAll("img")];
    const blobToDataUrl = blob => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("Unable to embed image"));
      reader.readAsDataURL(blob);
    });
    await Promise.all(copyImages.map(async (image, index) => {
      const sourceUrl = sourceImages[index]?.src;
      if (!sourceUrl) return;
      try {
        const response = await fetch(sourceUrl, { credentials: "include" });
        if (!response.ok) throw new Error(`Image request failed (${response.status})`);
        image.src = await blobToDataUrl(await response.blob());
      } catch (error) {
        console.warn("Backup image could not be embedded", error);
        image.closest("figure")?.remove();
      }
    }));
    const exportStyles = `html{scroll-behavior:smooth}body{margin:0;padding:28px;color:#17233b;font:11pt/1.55 Arial,sans-serif}a{color:#075ee8}.backup-document{display:grid;grid-template-columns:250px minmax(0,900px);gap:28px;max-width:1140px;margin:auto}.backup-document__nav{position:sticky;top:20px;align-self:start;display:grid;gap:4px;max-height:calc(100vh - 40px);padding-right:18px;overflow-y:auto;overscroll-behavior:contain;border-right:1px solid #d9e1ec;scrollbar-width:thin}.backup-document__nav-label{font-size:8pt;font-weight:800;text-transform:uppercase}.backup-document__nav a{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px;border:1px solid #d9e1ec;border-radius:8px;color:#173e70;text-decoration:none}.backup-document__nav-copy{display:grid;gap:2px}.backup-document__nav-copy strong{font-size:9pt}.backup-document__nav-copy em{color:#65758a;font-size:7.5pt;font-style:normal;line-height:1.3}.backup-document__content{min-width:0}.backup-document__cover{padding:32px 0;border-bottom:3px solid #173e70}.backup-document__cover h1{font-size:28pt;margin:8px 0}.backup-document__mark{font-weight:800;color:#173e70}.backup-document__cover dl{display:flex;flex-wrap:wrap;gap:24px}.backup-document__cover dt{font-size:8pt;text-transform:uppercase}.backup-document__cover dd{margin:2px 0;font-weight:700}.backup-overview-list{display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin-top:24px}.backup-overview-list a{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:54px;padding:9px 10px;border:1px solid #d9e1ec;border-radius:8px;text-decoration:none}.backup-overview-list a>span{display:grid;gap:2px}.backup-overview-list a small{color:#65758a;font-size:7.5pt}.backup-overview-list a b{display:inline-grid;min-width:25px;height:25px;place-items:center;border-radius:999px;color:#fff;background:#173e70;font-size:8pt}.backup-section{margin-top:30px;break-before:auto;page-break-before:auto}.backup-section>h2{padding-bottom:6px;border-bottom:2px solid #9bb6d7;color:#173e70}.backup-entry{break-inside:auto;page-break-inside:auto;margin:18px 0;padding-bottom:18px;border-bottom:1px solid #d9e1ec}.backup-entry h3{font-size:15pt;margin:0 0 6px}.backup-entry__meta{display:flex;gap:8px;flex-wrap:wrap;color:#5d6d82;font-size:8.5pt}.backup-entry__summary{font-weight:700}.backup-entry__images{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.backup-entry__images img{max-width:100%;max-height:420px}.backup-entry__images figure{margin:0}.backup-entry__images figcaption{font-size:8pt;color:#5d6d82}h3{page-break-after:avoid}ul{padding-left:20px}@media print{body{padding:0}.backup-document{display:block;max-width:none}.backup-document__nav{display:none}.backup-section,.backup-entry{break-before:auto;break-inside:auto;page-break-before:auto;page-break-inside:auto}}@media(max-width:720px){.backup-document{grid-template-columns:1fr}.backup-document__nav{position:static;max-height:none;overflow:visible;border-right:0;border-bottom:1px solid #d9e1ec;padding:0 0 14px}.backup-overview-list{grid-template-columns:1fr}}`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>BOT SOP Backup</title><style>${exportStyles}</style></head><body>${copy.outerHTML}</body></html>`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `BOT-SOP-Backup-${new Date().toISOString().slice(0, 10)}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (button) {
      button.disabled = false;
      button.innerHTML = originalButton;
      window.BOTSOP_UI.refreshIcons();
    }
  };

  window.goBack = function goBack() {
    const prior = window.appState.history.pop();
    if (!prior || prior.view === "home") return window.showHome(false);
    if (prior.view === "section") return window.showSection(prior.id, false);
    if (prior.view === "search") return window.showSearch(prior.query, false, prior.scrollY);
    if (prior.view === "favorites") return window.showFavorites(false);
    if (prior.view === "updates") return window.showUpdateArchive(prior.id, false);
    if (prior.view === "oos") return window.showOosRouting(false);
    if (prior.view === "backup") return window.showBackupDocument(false);
    return window.showRecord(prior.id, false);
  };

  function activeFilterCount() {
    return Object.values(window.appState.searchFilters).filter(value => value && value !== "all").length;
  }

  function updateFilterBadge() {
    const count = activeFilterCount();
    const badge = document.getElementById("search-filter-badge");
    const toggle = document.getElementById("search-filter-toggle");
    if (badge) {
      badge.textContent = String(count);
      badge.hidden = count === 0;
    }
    if (toggle) toggle.classList.toggle("has-active-filters", count > 0);
  }

  window.showSearch = function showSearch(rawQuery, addToHistory = true, restoreScroll = 0, preserveInput = false) {
    const query = String(rawQuery || "").trim();
    const input = document.querySelector(".header-search input");
    if (!preserveInput && input && input.value !== query) input.value = query;
    const filterCount = activeFilterCount();
    if (!query && !filterCount) return window.showHome(false);
    if (addToHistory && window.appState.currentView !== "search") remember("search", null, query);
    else {
      window.appState.currentView = "search";
      window.appState.currentSection = null;
      window.appState.currentQuery = query;
    }
    const matches = window.baseModel.search(query, window.appState.searchFilters);
    const resultDescription = query
      ? `${matches.length} result${matches.length === 1 ? "" : "s"} for "${window.BOTSOP_UI.escape(query)}"${filterCount ? ` with ${filterCount} filter${filterCount === 1 ? "" : "s"}` : ""}`
      : `${matches.length} filtered result${matches.length === 1 ? "" : "s"}`;
    window.setActiveNavigation(null);
    renderAndRefresh(`
      <div class="page-stack">
        <header class="section-title"><span class="section-title__icon">${window.BOTSOP_UI.icon("search")}</span><div><h2>${query ? "Search Results" : "Filtered Results"}</h2><p>${resultDescription}</p></div></header>
        ${matches.length ? groupedContentList(matches) : ""}
        ${!matches.length ? `<section class="empty-state"><h2>No matches found</h2><p>Try a different title, keyword, category, or resource name.</p></section>` : ""}
      </div>
    `);
    if (restoreScroll) requestAnimationFrame(() => window.scrollTo(0, restoreScroll));
  };

  window.showFavorites = function showFavorites(addToHistory = true) {
    if (addToHistory) remember("favorites", "favorites");
    else {
      window.appState.currentView = "favorites";
      window.appState.currentSection = "favorites";
    }
    window.setActiveNavigation("favorites");
    const matches = favoriteItems();
    renderAndRefresh(`
      <div class="page-stack">
        <nav class="breadcrumbs" aria-label="Breadcrumb"><button type="button" onclick="goBack()">${window.BOTSOP_UI.icon("arrow-left")} Back</button><span>&rsaquo;</span><span>My Favorites</span></nav>
        <header class="section-title"><span class="section-title__icon">${window.BOTSOP_UI.icon("star")}</span><div><h2>My Favorites</h2><p>${matches.length} saved item${matches.length === 1 ? "" : "s"}</p></div></header>
        <div class="process-grid">${matches.map(window.BOTSOP_UI.processCard).join("")}</div>
        ${!matches.length ? `<section class="empty-state"><h2>No favorites yet</h2><p>Open an SOP or Resource and select Add to Favorites.</p></section>` : ""}
      </div>
    `);
  };

  window.toggleFavorite = async function toggleFavorite(itemId) {
    const item = window.baseModel?.find(itemId);
    if (!item?.recordId || !window.baseMeta?.favoritesEnabled) return;
    const key = favoriteKey(item);
    if (window.appState.favoritePending.has(key)) return;
    const removing = window.appState.favorites.has(key);
    if (removing) window.appState.favorites.delete(key);
    else window.appState.favorites.add(key);
    window.appState.favoritePending.add(key);
    writeFavoriteCache();
    refreshFavoriteButtons(item);
    try {
      const response = await fetch("/api/favorites", {
        method: removing ? "DELETE" : "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ recordId: item.recordId, recordType: item.sourceType === "Documentation" ? "Resource" : "SOP", title: item.title })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to update favorites");
      if (window.appState.currentView === "favorites" && removing) window.showFavorites(false);
      if (window.appState.currentView === "home") window.showHome(false);
    } catch (error) {
      if (removing) window.appState.favorites.add(key);
      else window.appState.favorites.delete(key);
      writeFavoriteCache();
      window.alert(`${error.message}. Please try again.`);
    } finally {
      window.appState.favoritePending.delete(key);
      refreshFavoriteButtons(item);
    }
  };

  function favoritesCacheKey() {
    const user = String(window.baseMeta?.signedInAs || "signed-in-user").trim().toLowerCase();
    return `botsop:favorites:v14:${user}`;
  }

  function writeFavoriteCache() {
    try {
      window.sessionStorage.setItem(favoritesCacheKey(), JSON.stringify([...window.appState.favorites]));
    } catch {
      // Storage may be unavailable in restricted browser contexts.
    }
  }

  function readFavoriteCache() {
    try {
      const values = JSON.parse(window.sessionStorage.getItem(favoritesCacheKey()) || "[]");
      if (Array.isArray(values)) window.appState.favorites = new Set(values.filter(Boolean));
    } catch {
      // Ignore invalid or unavailable cache data.
    }
  }

  function refreshFavoriteButtons(item) {
    const active = window.appState.favorites.has(favoriteKey(item));
    const pending = window.appState.favoritePending.has(favoriteKey(item));
    document.querySelectorAll("button[data-favorite-id]").forEach(button => {
      if (button.dataset.favoriteId !== item.id) return;
      button.classList.toggle("is-favorite", active);
      button.disabled = pending;
      const label = pending ? "Saving favorite" : (active ? "Remove from Favorites" : "Add to Favorites");
      button.setAttribute("aria-label", label);
      button.title = label;
      button.innerHTML = `${window.BOTSOP_UI.icon(pending ? "loader-circle" : "star")}<span class="entry-action-label">${label}</span>`;
    });
    window.BOTSOP_UI.refreshIcons();
  }

  window.sendToMe = async function sendToMe(itemId, button) {
    const item = window.baseModel?.find(itemId);
    if (!item?.recordId || !window.baseMeta?.sendToMeEnabled || button?.disabled) return;
    const original = button?.innerHTML || "";
    if (button) {
      button.disabled = true;
      button.classList.remove("is-sent", "is-error");
      button.setAttribute("aria-label", "Sending to Feishu");
      button.title = "Sending to Feishu";
      button.innerHTML = `${window.BOTSOP_UI.icon("loader-circle")}<span class="entry-action-label">Sending to Feishu</span>`;
      window.BOTSOP_UI.refreshIcons();
    }
    try {
      const response = await fetch("/api/send-to-me", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ recordId: item.recordId, recordType: item.sourceType === "Documentation" ? "Resource" : "SOP" })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = [payload.error, payload.reason, payload.feishuCode ? `Feishu code ${payload.feishuCode}` : ""].filter(Boolean).join(": ");
        throw new Error(detail || "Unable to send this entry");
      }
      if (button) {
        button.classList.add("is-sent");
        button.setAttribute("aria-label", "Sent to Feishu");
        button.title = "Sent to Feishu";
        button.innerHTML = `${window.BOTSOP_UI.icon("check")}<span class="entry-action-label">${payload.deliveryFormat === "text" ? "Sent in basic format" : "Sent to Feishu"}</span>`;
      }
    } catch (error) {
      if (button) {
        button.classList.add("is-error");
        button.setAttribute("aria-label", "Send failed");
        button.innerHTML = `${window.BOTSOP_UI.icon("triangle-alert")}<span class="entry-action-label">Send failed</span>`;
        button.title = error.message;
      }
      window.alert(`Send to Me failed: ${error.message}`);
    } finally {
      if (button) {
        button.disabled = false;
        window.BOTSOP_UI.refreshIcons();
        window.setTimeout(() => {
          if (!button.isConnected) return;
          button.classList.remove("is-sent", "is-error");
          button.innerHTML = original;
          button.setAttribute("aria-label", "Send to Me");
          button.title = "Send to Me";
          window.BOTSOP_UI.refreshIcons();
        }, 5000);
      }
    }
  };

  async function loadFavorites() {
    readFavoriteCache();
    if (!window.baseMeta?.favoritesEnabled) return;
    const response = await fetch("/api/favorites", { credentials: "same-origin", headers: { Accept: "application/json" } });
    if (!response.ok) return;
    const payload = await response.json();
    window.appState.favorites = new Set((payload.favorites || []).map(item => `${String(item.recordType).toLowerCase()}:${item.recordId}`));
    writeFavoriteCache();
  }

  function installCombinedSearch() {
    const input = document.querySelector(".header-search input");
    if (!input) return;
    const replacement = input.cloneNode(true);
    input.replaceWith(replacement);
    replacement.addEventListener("input", event => window.showSearch(
      event.target.value,
      window.appState.currentView !== "search",
      0,
      true
    ));
  }

  function installAdvancedSearch() {
    const shell = document.querySelector(".search-shell");
    const toggle = document.getElementById("search-filter-toggle");
    const popover = document.getElementById("search-filter-popover");
    const close = document.getElementById("search-filter-close");
    const apply = document.getElementById("search-filter-apply");
    const clear = document.getElementById("search-filter-clear");
    const source = document.getElementById("filter-source");
    const contentType = document.getElementById("filter-content-type");
    const requestType = document.getElementById("filter-request-type");
    const updated = document.getElementById("filter-updated");
    if (!shell || !toggle || !popover || !source || !contentType || !requestType || !updated) return;

    const contentOptions = [...new Set(
      [...window.baseModel.items, ...window.baseModel.documents]
        .flatMap(item => [item.category, item.displayType])
        .filter(value => value && value !== "Left Nav")
    )].sort((a, b) => a.localeCompare(b));
    contentType.insertAdjacentHTML("beforeend", contentOptions.map(value => `<option value="${window.BOTSOP_UI.escape(value)}">${window.BOTSOP_UI.escape(value)}</option>`).join(""));
    requestType.insertAdjacentHTML("beforeend", window.baseModel.requestTypes.map(item => `<option value="${window.BOTSOP_UI.escape(item.title)}">${window.BOTSOP_UI.escape(item.title)}</option>`).join(""));

    function closePopover() {
      popover.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
    }

    function syncControls() {
      source.value = window.appState.searchFilters.source;
      contentType.value = window.appState.searchFilters.contentType;
      requestType.value = window.appState.searchFilters.requestType;
      updated.value = window.appState.searchFilters.updatedDays;
    }

    toggle.addEventListener("click", event => {
      event.stopPropagation();
      const opening = popover.hidden;
      if (opening) syncControls();
      popover.hidden = !opening;
      toggle.setAttribute("aria-expanded", String(opening));
    });
    close?.addEventListener("click", closePopover);
    apply?.addEventListener("click", () => {
      window.appState.searchFilters = {
        source: source.value,
        contentType: contentType.value,
        requestType: requestType.value,
        updatedDays: updated.value
      };
      updateFilterBadge();
      closePopover();
      window.showSearch(document.querySelector(".header-search input")?.value || "", false);
    });
    clear?.addEventListener("click", () => {
      window.appState.searchFilters = { source: "all", contentType: "all", requestType: "all", updatedDays: "all" };
      syncControls();
      updateFilterBadge();
      closePopover();
      const query = document.querySelector(".header-search input")?.value || "";
      if (query.trim()) window.showSearch(query, false);
      else window.showHome(false);
    });
    document.addEventListener("click", event => {
      if (!popover.hidden && !shell.contains(event.target)) closePopover();
    });
    popover.addEventListener("click", event => event.stopPropagation());
    updateFilterBadge();
  }

  function showStartupError(error) {
    renderAndRefresh(`<section class="empty-state"><h1>Unable to load BOT SOP</h1><p>${window.BOTSOP_UI.escape(error.message || error)}</p><button type="button" class="primary-action" onclick="window.location.reload()">Try again</button></section>`);
  }

  function renderCurrentViewAfterDataUpdate() {
    window.buildLeftNavigation();
    window.BOTSOP_UI.renderRightRail(window.baseModel);

    const view = window.appState.currentView;
    const id = window.appState.currentSection;
    const query = window.appState.currentQuery;
    const scrollY = window.scrollY || 0;

    if (view === "section") {
      if (window.baseModel.requestTypes.some(item => item.id === id || item.recordKey === id)) window.showSection(id, false);
      else window.showHome(false);
    } else if (view === "record") {
      if (window.baseModel.find(id)) window.showRecord(id, false);
      else window.showHome(false);
    } else if (view === "search") {
      window.showSearch(query, false, scrollY);
    } else if (view === "favorites") {
      window.showFavorites(false);
    } else if (view === "updates") {
      window.showUpdateArchive(id, false);
    } else if (view === "oos") {
      window.showOosRouting(false);
    } else if (view === "backup") {
      window.showBackupDocument(false);
    } else if (view === "home") {
      window.showHome(false);
    } else {
      window.BOTSOP_UI.refreshIcons();
    }
  }

  window.addEventListener("botsop:data-updated", renderCurrentViewAfterDataUpdate);

  async function initializeApp() {
    try {
      const standaloneBackup = isStandaloneBackup();
      document.body.classList.toggle("backup-standalone", standaloneBackup);
      const accessPromise = window.BOTSOP_SUBMISSIONS?.loadAccess?.();
      await window.baseDataReady;
      await Promise.all([loadFavorites(), accessPromise]);
      if (!standaloneBackup) {
        window.buildLeftNavigation();
        window.BOTSOP_UI.renderRightRail(window.baseModel);
      }
      window.BOTSOP_UI.installImageViewer();
      if ("serviceWorker" in navigator) navigator.serviceWorker.register("/service-worker.js").catch(() => {});
      installCombinedSearch();
      installAdvancedSearch();
      const signedIn = document.getElementById("signed-in-user");
      if (signedIn && window.baseMeta?.signedInAs) signedIn.textContent = window.baseMeta.signedInAs;
      const assistant = document.getElementById("agent-assistant");
      if (assistant && window.baseMeta?.agentAssistantUrl) {
        assistant.href = window.baseMeta.agentAssistantUrl;
        assistant.target = "_blank";
        assistant.rel = "noopener noreferrer";
        assistant.hidden = false;
      }
      const mobileAssistant = document.getElementById("mobile-agent-assistant");
      if (mobileAssistant && window.baseMeta?.agentAssistantUrl) {
        mobileAssistant.href = window.baseMeta.agentAssistantUrl;
        mobileAssistant.hidden = false;
      }
      const submitResource = document.getElementById("submit-resource");
      if (submitResource && window.BOTSOP_SUBMISSIONS?.hasAnyAccess?.()) {
        submitResource.href = "?page=submit";
        submitResource.removeAttribute("target");
        submitResource.removeAttribute("rel");
        submitResource.hidden = false;
      } else if (submitResource && window.baseMeta?.submitResourceUrl) {
        submitResource.href = window.baseMeta.submitResourceUrl;
        submitResource.target = "_blank";
        submitResource.rel = "noopener noreferrer";
        submitResource.hidden = false;
      }
      const requestedPage = standaloneBackup ? "backup" : new URLSearchParams(window.location.search).get("page");
      const requestedRecord = new URLSearchParams(window.location.search).get("record");
      if (requestedPage === "backup") {
        window.showBackupDocument(false);
      } else if (requestedPage === "submit" && window.BOTSOP_SUBMISSIONS?.showSubmissionCenter) {
        window.BOTSOP_SUBMISSIONS.showSubmissionCenter();
      } else if (requestedRecord && window.baseModel.find(requestedRecord)) window.showRecord(requestedRecord, false);
      else window.showHome(false);
    } catch (error) {
      console.error("BOT SOP startup failed", error);
      showStartupError(error);
    }
  }

  initializeApp();

})();
