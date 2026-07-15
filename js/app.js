window.appState = {
  currentView: "home",
  currentSection: null,
  currentQuery: "",
  history: [],
  favorites: new Set(),
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
      details.addEventListener("toggle", () => {
        if (!details.open) return;
        const group = details.dataset.accordionGroup;
        target.querySelectorAll(`details[data-accordion-group="${group}"][open]`).forEach(other => {
          if (other !== details) other.open = false;
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

  function guidanceItemsFor(placement) {
    const supportedTypes = new Set(["Process", "Section", "Checklist", "Checklist Step"]);
    const wanted = placementKey(placement);
    return (window.baseModel?.items || [])
      .filter(item => supportedTypes.has(item.displayType))
      .filter(item => placementKey(item.baseSection) === wanted || appearsIn(item, placement))
      .sort((a, b) => (b.priority || 0) - (a.priority || 0) || a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
  }

  function uniqueItems(items) {
    return [...new Map((items || []).map(item => [item.id, item])).values()];
  }

  function guidanceItemsForAny(placements) {
    return uniqueItems(placements.flatMap(guidanceItemsFor))
      .sort((a, b) => (b.priority || 0) - (a.priority || 0) || a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
  }

  function processAccordionList(items) {
    return `<div class="process-list">${items.map(item => window.BOTSOP_UI.processAccordion(item, favoriteButton(item))).join("")}</div>`;
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
    if (!window.baseMeta?.favoritesEnabled || !item.recordId || item.displayType === "Request Type") return "";
    const active = window.appState.favorites.has(favoriteKey(item));
    return `<button type="button" class="favorite-button${compact ? " favorite-button--meta" : ""}${active ? " is-favorite" : ""}" onclick="toggleFavorite('${window.BOTSOP_UI.escape(item.id)}')">${window.BOTSOP_UI.icon("star")} ${active ? "Remove from Favorites" : "Add to Favorites"}</button>`;
  }

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
    const outOfScope = uniqueItems([
      ...model.section("Callout", "OOS Routing"),
      ...model.documentsFor("OOS Routing")
    ]);
    const ticketGuidance = guidanceItemsFor("Wrap Up");
    const banOperatorsAndReasons = guidanceItemsForAny(["Ban Operators and Reasons", "Ban Operators", "Reasons"]);
    const warnings = model.section("Warning", "Policy Reminders");

    renderAndRefresh(`
      <div class="page-stack">
        ${window.BOTSOP_UI.mappingAlert(model.unmapped)}
        ${window.BOTSOP_UI.updatesCallout(window.baseMeta?.unacknowledgedUpdatesUrl)}
        ${window.BOTSOP_UI.expectationsSection(expectations, "Required standards and responsibilities for every ticket.")}
        ${window.BOTSOP_UI.guidanceDropdownSection("Out of Scope", "route", outOfScope, "blue", "Routing guidance for work that falls outside BOT scope.")}
        ${window.BOTSOP_UI.guidanceDropdownSection("Ticket Guidance", "circle-check-big", ticketGuidance, "violet", "Steps and reminders for handling and closing tickets.")}
        ${window.BOTSOP_UI.guidanceDropdownSection("Ban Operators and Reasons", "shield-check", banOperatorsAndReasons, "orange", "Guidance for selecting ban operators and reason codes.")}
        ${window.BOTSOP_UI.warningCards(warnings)}
      </div>
    `);
  };

  window.showSection = function showSection(sectionId, addToHistory = true) {
    const model = window.baseModel;
    const requestType = model?.requestTypes.find(item => item.id === sectionId || item.recordKey === sectionId);
    if (!model || !requestType) return;
    if (addToHistory) remember("section", requestType.id);
    window.setActiveNavigation(requestType.id);

    const supportedTypes = new Set(["Process", "Process Group", "Section", "Checklist", "Checklist Step"]);
    const allItems = model.items
      .filter(item => supportedTypes.has(item.displayType) && appearsIn(item, requestType.title))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
    const groups = allItems.filter(item => item.displayType === "Process Group");
    const processes = allItems.filter(item => item.displayType !== "Process Group");
    const groupedNames = new Set(groups.map(group => group.title.toLowerCase()));
    const ungrouped = processes.filter(item =>
      !item.parents.some(parent => groupedNames.has(parent.toLowerCase()))
    );

    const groupSections = groups.map(group => {
      const children = processes.filter(item =>
        item.parents.some(parent => parent.toLowerCase() === group.title.toLowerCase())
      );
      return `
        <section class="process-group">
          <header><span>${window.BOTSOP_UI.icon(group.icon || "folders")}</span><div><h2>${window.BOTSOP_UI.escape(group.title)}</h2><p>${window.BOTSOP_UI.escape(group.summary || group.description || "Related processes")}</p></div></header>
          ${processAccordionList(children)}
        </section>
      `;
    }).join("");

    renderAndRefresh(`
      <div class="page-stack">
        <nav class="breadcrumbs" aria-label="Breadcrumb"><button type="button" onclick="showHome()">Home</button><span>›</span><span>${window.BOTSOP_UI.escape(requestType.title)}</span></nav>
        <header class="process-header">
          <span class="process-header__icon">${window.BOTSOP_UI.icon(requestType.icon || "folder")}</span>
          <div><p>Request Type</p><h1>${window.BOTSOP_UI.escape(requestType.title)}</h1><span>${window.BOTSOP_UI.escape(requestType.summary || requestType.description || "Operational guidance and workflows")}</span></div>
        </header>
        ${ungrouped.length ? `<section class="process-group"><header><div><h2>${window.BOTSOP_UI.escape(requestType.title)} Processes</h2><p>Expand a process to view its complete guidance.</p></div></header>${processAccordionList(ungrouped)}</section>` : ""}
        ${groupSections}
        ${!processes.length ? `<section class="empty-state"><h2>No processes mapped here</h2><p>Add this request type to a Process record's <strong>Appears In</strong> field.</p></section>` : ""}
      </div>
    `);
  };

  window.showWrapUp = function showWrapUp(recordId, addToHistory = true) {
    const model = window.baseModel;
    const parent = model?.find(recordId);
    if (!model || !parent) return;
    const steps = model.wrapStepsFor(parent);
    if (addToHistory) remember("wrap", parent.id);
    window.setActiveNavigation(null);
    renderAndRefresh(`
      <div class="page-stack">
        <nav class="breadcrumbs" aria-label="Breadcrumb"><button type="button" onclick="goBack()">${window.BOTSOP_UI.icon("arrow-left")} Back</button><span>›</span><button type="button" onclick="showHome()">Home</button><span>›</span><span>${window.BOTSOP_UI.escape(parent.title)}</span></nav>
        <header class="process-header"><span class="process-header__icon">${window.BOTSOP_UI.icon(parent.icon || "circle-check-big")}</span><div><p>Ticket Guidance</p><h1>${window.BOTSOP_UI.escape(parent.title)}</h1><span>${window.BOTSOP_UI.escape(parent.summary || "Complete each step before closing the ticket.")}</span></div></header>
        ${parent.instruction ? window.BOTSOP_UI.markdownSection("Overview", "clipboard-check", parent.instruction) : ""}
        <section class="process-group"><header><div><h2>Ticket Guidance Steps</h2><p>Select a step to view its full guidance.</p></div></header><div class="process-grid">${steps.map(window.BOTSOP_UI.processCard).join("")}</div></section>
        ${!steps.length ? `<section class="empty-state"><h2>No steps mapped yet</h2><p>Add Checklist Step records with <strong>${window.BOTSOP_UI.escape(parent.title)}</strong> in Parent.</p></section>` : ""}
      </div>
    `);
  };

  window.showRecord = function showRecord(recordId, addToHistory = true) {
    const model = window.baseModel;
    const item = model?.find(recordId);
    if (!model || !item) return;
    if (item.displayType === "Request Type") return window.showSection(item.id, addToHistory);
    if (item.displayType === "Checklist" && model.wrapStepsFor(item).length) return window.showWrapUp(item.id, addToHistory);
    if (["Link", "Tool"].includes(item.displayType) && item.sourceType !== "Documentation") {
      if (item.url) window.open(item.url, "_blank", "noopener,noreferrer");
      return;
    }
    if (addToHistory) remember("record", item.id);

    const context = item.appearsIn[0];
    const requestType = context && model.requestTypes.find(candidate => candidate.title === context);
    const wrapParent = item.displayType === "Checklist Step"
      ? model.items.find(candidate => candidate.displayType === "Checklist" && (
          item.parentIds?.includes(candidate.recordId) || item.parents?.some(parent => parent.toLowerCase() === candidate.title.toLowerCase())
        ))
      : null;
    window.setActiveNavigation(requestType?.id || null);

    const meta = [
      item.status && `<span>${window.BOTSOP_UI.icon("circle-dot")} ${window.BOTSOP_UI.escape(item.status)}</span>`,
      item.lastUpdated && `<span>${window.BOTSOP_UI.icon("calendar-clock")} Updated ${window.BOTSOP_UI.escape(item.lastUpdated)}</span>`,
      item.displayType && `<span>${window.BOTSOP_UI.icon("layout-template")} ${window.BOTSOP_UI.escape(item.displayType)}</span>`,
      favoriteButton(item, true)
    ].filter(Boolean).join("");

    renderAndRefresh(`
      <article class="record-page">
        <nav class="breadcrumbs" aria-label="Breadcrumb">
          <button type="button" onclick="goBack()">${window.BOTSOP_UI.icon("arrow-left")} Back</button><span>›</span><button type="button" onclick="showHome()">Home</button>
          ${wrapParent ? `<span>›</span><button type="button" onclick="showWrapUp('${window.BOTSOP_UI.escape(wrapParent.id)}')">${window.BOTSOP_UI.escape(wrapParent.title)}</button>` : ""}
          ${requestType ? `<span>›</span><button type="button" onclick="showSection('${window.BOTSOP_UI.escape(requestType.id)}')">${window.BOTSOP_UI.escape(requestType.title)}</button>` : ""}
          <span>›</span><span>${window.BOTSOP_UI.escape(item.title)}</span>
        </nav>
        <header class="record-header">
          <span class="record-header__icon">${window.BOTSOP_UI.icon(item.icon || "file-text")}</span>
          <div><p>${window.BOTSOP_UI.escape(item.baseSection)}</p><h1>${window.BOTSOP_UI.escape(item.title)}</h1><span>${window.BOTSOP_UI.escape(item.summary || item.description || "")}</span></div>
        </header>
        <div class="record-meta">${meta}</div>
        ${window.BOTSOP_UI.markdownSection("Instructions", "clipboard-list", item.instruction)}
        ${window.BOTSOP_UI.detailSection("Screenshot Guidance", "image", item.screenshotGuidance)}
        ${window.BOTSOP_UI.imageGallery(item.screenshots)}
        ${window.BOTSOP_UI.relatedItemsSection(item.relatedResources, item.linkedTasks)}
        ${window.BOTSOP_UI.detailSection("Closing Guidance", "message-square-check", item.closingGuidance)}
        ${window.BOTSOP_UI.detailSection("Ticket Tags", "tags", item.ticketTags)}
        ${item.url ? `<a class="primary-action" href="${window.BOTSOP_UI.escape(item.url)}" target="_blank" rel="noopener noreferrer">${window.BOTSOP_UI.escape(item.ctaLabel)} ${window.BOTSOP_UI.icon("arrow-up-right")}</a>` : ""}
      </article>
    `);
  };

  window.goBack = function goBack() {
    const prior = window.appState.history.pop();
    if (!prior || prior.view === "home") return window.showHome(false);
    if (prior.view === "section") return window.showSection(prior.id, false);
    if (prior.view === "wrap") return window.showWrapUp(prior.id, false);
    if (prior.view === "search") return window.showSearch(prior.query, false, prior.scrollY);
    if (prior.view === "favorites") return window.showFavorites(false);
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
      ? `${matches.length} result${matches.length === 1 ? "" : "s"} for “${window.BOTSOP_UI.escape(query)}”${filterCount ? ` with ${filterCount} filter${filterCount === 1 ? "" : "s"}` : ""}`
      : `${matches.length} filtered result${matches.length === 1 ? "" : "s"}`;
    window.setActiveNavigation(null);
    renderAndRefresh(`
      <div class="page-stack">
        <header class="section-title"><span class="section-title__icon">${window.BOTSOP_UI.icon("search")}</span><div><h2>${query ? "Search Results" : "Filtered Results"}</h2><p>${resultDescription}</p></div></header>
        <div class="process-grid">${matches.map(window.BOTSOP_UI.processCard).join("")}</div>
        ${!matches.length ? `<section class="empty-state"><h2>No matches found</h2><p>Try a different title, keyword, request type, or resource name.</p></section>` : ""}
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
        <nav class="breadcrumbs" aria-label="Breadcrumb"><button type="button" onclick="goBack()">${window.BOTSOP_UI.icon("arrow-left")} Back</button><span>›</span><span>My Favorites</span></nav>
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
    const removing = window.appState.favorites.has(key);
    const response = await fetch("/api/favorites", {
      method: removing ? "DELETE" : "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ recordId: item.recordId, recordType: item.sourceType === "Documentation" ? "Resource" : "SOP", title: item.title })
    });
    if (!response.ok) return window.alert("Unable to update favorites. Please try again.");
    if (removing) window.appState.favorites.delete(key);
    else window.appState.favorites.add(key);
    if (window.appState.currentView === "section") window.showSection(window.appState.currentSection, false);
    else if (window.appState.currentView === "home") window.showHome(false);
    else if (window.appState.currentView === "favorites") window.showFavorites(false);
    else window.showRecord(item.id, false);
  };

  async function loadFavorites() {
    if (!window.baseMeta?.favoritesEnabled) return;
    const response = await fetch("/api/favorites", { credentials: "same-origin", headers: { Accept: "application/json" } });
    if (!response.ok) return;
    const payload = await response.json();
    window.appState.favorites = new Set((payload.favorites || []).map(item => `${String(item.recordType).toLowerCase()}:${item.recordId}`));
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
        .filter(value => value && value !== "Request Type")
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
      await window.baseDataReady;
      await loadFavorites();
      window.buildLeftNavigation();
      window.BOTSOP_UI.renderRightRail(window.baseModel);
      window.BOTSOP_UI.installImageViewer();
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
      if (submitResource && window.baseMeta?.submitResourceUrl) {
        submitResource.href = window.baseMeta.submitResourceUrl;
        submitResource.hidden = false;
      }
      const requestedRecord = new URLSearchParams(window.location.search).get("record");
      if (requestedRecord && window.baseModel.find(requestedRecord)) window.showRecord(requestedRecord, false);
      else window.showHome(false);
    } catch (error) {
      console.error("BOT SOP startup failed", error);
      showStartupError(error);
    }
  }

  initializeApp();
})();
