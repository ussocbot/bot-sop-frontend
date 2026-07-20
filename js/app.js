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
    return `<button type="button" data-favorite-id="${window.BOTSOP_UI.escape(item.id)}" class="favorite-button${compact ? " favorite-button--meta" : ""}${active ? " is-favorite" : ""}" onclick="toggleFavorite('${window.BOTSOP_UI.escape(item.id)}')"${pending ? " disabled" : ""}>${window.BOTSOP_UI.icon(pending ? "loader-circle" : "star")} ${pending ? "Saving..." : (active ? "Remove from Favorites" : "Add to Favorites")}</button>`;
  }

  function sendToMeButton(item) {
    if (!window.baseMeta?.sendToMeEnabled || !item.recordId || item.displayType === "Left Nav") return "";
    return `<button type="button" class="send-to-me-button" onclick="sendToMe('${window.BOTSOP_UI.escape(item.id)}', this)">${window.BOTSOP_UI.icon("send")} Send to Me</button>`;
  }

  function updateEntryButton(item, compact = false) {
    if (
      !window.BOTSOP_SUBMISSIONS?.canSubmitUpdates?.() ||
      !item.recordId ||
      item.sourceType === "Documentation" ||
      item.displayType === "Left Nav"
    ) return "";
    return `<button type="button" class="update-entry-button${compact ? " update-entry-button--meta" : ""}" onclick="openUpdateSubmission('${window.BOTSOP_UI.escape(item.id)}')">${window.BOTSOP_UI.icon("square-pen")} Update this SOP</button>`;
  }

  function entryActionButtons(item) {
    const actions = [favoriteButton(item), sendToMeButton(item), updateEntryButton(item)].filter(Boolean).join("");
    return actions ? `<div class="inline-entry-actions">${actions}</div>` : "";
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

    const expectations = guidanceItemsFor("BOT Expectations");
    const usdsCompliance = guidanceItemsFor("USDS JV Compliance");
    const outOfScope = uniqueItems([
      ...guidanceItemsFor("Out of Scope"),
      ...model.documentsFor("OOS Routing")
    ]).sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
    const banOperatorsAndReasons = guidanceItemsFor("Ban Operators");
    const warnings = model.section("Warning");

    renderAndRefresh(`
      <div class="page-stack">
        ${window.BOTSOP_UI.mappingAlert(model.unmapped)}
        ${window.BOTSOP_UI.updatesCallout(window.baseMeta?.unacknowledgedUpdatesUrl)}
        ${window.BOTSOP_UI.guidanceDropdownSection("USDS JV Compliance", "shield-check", usdsCompliance, "red", "Privacy, disclosure, and USDS JV handling requirements.")}
        ${window.BOTSOP_UI.expectationsSection(expectations, "Required standards and responsibilities for every ticket.")}
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
    if (["BOT Tools", "BOT Links", "OPUS Links", "QA Links"].includes(item.displayType) && item.sourceType !== "Documentation") {
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

  window.goBack = function goBack() {
    const prior = window.appState.history.pop();
    if (!prior || prior.view === "home") return window.showHome(false);
    if (prior.view === "section") return window.showSection(prior.id, false);
    if (prior.view === "search") return window.showSearch(prior.query, false, prior.scrollY);
    if (prior.view === "favorites") return window.showFavorites(false);
    if (prior.view === "updates") return window.showUpdateArchive(prior.id, false);
    if (prior.view === "oos") return window.showOosRouting(false);
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

  window.showSearch = function showSearch(rawQuery, addToHistory = true, restoreScroll = 0) {
    const query = String(rawQuery || "").trim();
    const input = document.querySelector(".header-search input");
    if (input && input.value !== query) input.value = query;
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
    const matches = [...window.baseModel.items, ...window.baseModel.documents]
      .filter(item => item.recordId && window.appState.favorites.has(favoriteKey(item)));
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
      button.innerHTML = `${window.BOTSOP_UI.icon(pending ? "loader-circle" : "star")} ${pending ? "Saving..." : (active ? "Remove from Favorites" : "Add to Favorites")}`;
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
      button.innerHTML = `${window.BOTSOP_UI.icon("loader-circle")} Sending...`;
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
      if (!response.ok) throw new Error(payload.error || "Unable to send this entry");
      if (button) {
        button.classList.add("is-sent");
        button.innerHTML = `${window.BOTSOP_UI.icon("check")} Sent to Feishu`;
      }
    } catch (error) {
      if (button) {
        button.classList.add("is-error");
        button.innerHTML = `${window.BOTSOP_UI.icon("triangle-alert")} Send failed`;
        button.title = error.message;
      }
    } finally {
      if (button) {
        button.disabled = false;
        window.BOTSOP_UI.refreshIcons();
        window.setTimeout(() => {
          if (!button.isConnected) return;
          button.classList.remove("is-sent", "is-error");
          button.innerHTML = original;
          button.title = "";
          window.BOTSOP_UI.refreshIcons();
        }, 2500);
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
    replacement.addEventListener("input", event => window.showSearch(event.target.value, window.appState.currentView !== "search"));
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

  async function initializeApp() {
    try {
      const accessPromise = window.BOTSOP_SUBMISSIONS?.loadAccess?.();
      await window.baseDataReady;
      await Promise.all([loadFavorites(), accessPromise]);
      window.buildLeftNavigation();
      window.BOTSOP_UI.renderRightRail(window.baseModel);
      window.BOTSOP_UI.installImageViewer();
      if ("serviceWorker" in navigator) navigator.serviceWorker.register("/service-worker.js").catch(() => {});
      installCombinedSearch();
      installAdvancedSearch();
      const signedIn = document.getElementById("signed-in-user");
      if (signedIn && window.baseMeta?.signedInAs) signedIn.textContent = window.baseMeta.signedInAs;
      const assistant = document.getElementById("agent-assistant");
      if (assistant && window.baseMeta?.agentAssistantUrl) {
        assistant.href = window.baseMeta.agentAssistantUrl;
        assistant.hidden = false;
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
      const requestedPage = new URLSearchParams(window.location.search).get("page");
      const requestedRecord = new URLSearchParams(window.location.search).get("record");
      if (requestedPage === "submit" && window.BOTSOP_SUBMISSIONS?.showSubmissionCenter) {
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
