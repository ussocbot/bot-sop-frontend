window.appState = { currentView: "home", currentSection: null, currentQuery: "", history: [], favorites: new Set() };

(function installApp() {
  "use strict";

  function contentView() {
    return document.getElementById("content-view");
  }

  function renderAndRefresh(html) {
  const target = contentView();
  if (!target) return;

  target.innerHTML = html;

  target
    .querySelectorAll("details[data-accordion-group]")
    .forEach(details => {
      details.addEventListener("toggle", () => {
        if (!details.open) return;

        const group = details.dataset.accordionGroup;

        target
          .querySelectorAll(
            `details[data-accordion-group="${group}"][open]`
          )
          .forEach(other => {
            if (other !== details) {
              other.open = false;
            }
          });
      });
    });

  window.BOTSOP_UI.refreshIcons();
}

function placementKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ");
}

function appearsIn(item, placement) {
  const wanted = placementKey(placement);

  return (item.appearsIn || []).some(
    value => placementKey(value) === wanted
  );
}

function guidanceItemsFor(placement) {
  const supportedTypes = new Set([
    "Process",
    "Section",
    "Checklist",
    "Checklist Step"
  ]);

  const wanted = placementKey(placement);

  return (window.baseModel?.items || [])
    .filter(item => supportedTypes.has(item.displayType))
    .filter(item =>
      placementKey(item.baseSection) === wanted ||
      appearsIn(item, placement)
    )
    .sort((a, b) =>
      (b.priority || 0) - (a.priority || 0) ||
      a.sortOrder - b.sortOrder ||
      a.title.localeCompare(b.title)
    );
}

function processAccordionList(items) {
  return `
    <div class="process-list">
      ${items.map(item =>
        window.BOTSOP_UI.processAccordion(
          item,
          favoriteButton(item)
        )
      ).join("")}
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

  function favoriteButton(item) {
    if (!window.baseMeta?.favoritesEnabled || !item.recordId || item.displayType === "Request Type") return "";
    const active = window.appState.favorites.has(favoriteKey(item));
    return `<button type="button" class="favorite-button${active ? " is-favorite" : ""}" onclick="toggleFavorite('${window.BOTSOP_UI.escape(item.id)}')">${window.BOTSOP_UI.icon(active ? "star" : "star")} ${active ? "Remove from Favorites" : "Add to Favorites"}</button>`;
  }

window.showHome = function showHome(addToHistory = true) {
  const model = window.baseModel;

  if (!model) return;

  if (addToHistory) {
    remember("home", null);
  } else {
    window.appState.currentView = "home";
    window.appState.currentSection = null;
    window.appState.currentQuery = "";
  }

  window.setActiveNavigation(null);

  const searchInput =
    document.querySelector(".header-search input");

  if (searchInput) {
    searchInput.value = "";
  }

  const expectations =
    guidanceItemsFor("BOT Expectations");

  const bestPractices =
    guidanceItemsFor("Best Practices");

  const wrapUp =
    guidanceItemsFor("Wrap Up");

  const warnings =
    model.section("Warning", "Policy Reminders");

  renderAndRefresh(`
    <div class="page-stack">
      ${window.BOTSOP_UI.mappingAlert(
        model.unmapped
      )}

      ${window.BOTSOP_UI.updatesCallout(
        window.baseMeta?.unacknowledgedUpdatesUrl
      )}

      ${window.BOTSOP_UI.expectationsSection(
        expectations
      )}

      ${window.BOTSOP_UI.guidanceDropdownSection(
        "Best Practices",
        "sparkles",
        bestPractices,
        "blue"
      )}

      ${window.BOTSOP_UI.guidanceDropdownSection(
        "Wrap Up",
        "circle-check-big",
        wrapUp,
        "violet"
      )}

      ${window.BOTSOP_UI.warningCards(
        warnings
      )}
    </div>
  `);
};
window.showSection = function showSection(
  sectionId,
  addToHistory = true
) {
  const model = window.baseModel;

  const requestType = model?.requestTypes.find(
    item =>
      item.id === sectionId ||
      item.recordKey === sectionId
  );

  if (!model || !requestType) return;

  if (addToHistory) {
    remember("section", requestType.id);
  } else {
    window.appState.currentView = "section";
    window.appState.currentSection = requestType.id;
    window.appState.currentQuery = "";
  }

  window.setActiveNavigation(requestType.id);

  const supportedTypes = new Set([
    "Process",
    "Process Group",
    "Section",
    "Checklist",
    "Checklist Step"
  ]);

  const allItems = model.items
    .filter(item =>
      supportedTypes.has(item.displayType) &&
      appearsIn(item, requestType.title)
    )
    .sort((a, b) =>
      a.sortOrder - b.sortOrder ||
      a.title.localeCompare(b.title)
    );

  const groups = allItems.filter(
    item => item.displayType === "Process Group"
  );

  const processes = allItems.filter(
    item => item.displayType !== "Process Group"
  );

  const groupedNames = new Set(
    groups.map(group => placementKey(group.title))
  );

  const ungrouped = processes.filter(item =>
    !(item.parents || []).some(parent =>
      groupedNames.has(placementKey(parent))
    )
  );

  const groupSections = groups
    .map(group => {
      const children = processes.filter(item =>
        (item.parents || []).some(
          parent =>
            placementKey(parent) ===
            placementKey(group.title)
        )
      );

      if (!children.length) return "";

      return `
        <section class="process-group">
          <header>
            <span>
              ${window.BOTSOP_UI.icon(
                group.icon || "folders"
              )}
            </span>

            <div>
              <h2>
                ${window.BOTSOP_UI.escape(group.title)}
              </h2>

              <p>
                ${window.BOTSOP_UI.escape(
                  group.summary ||
                  group.description ||
                  "Related processes"
                )}
              </p>
            </div>
          </header>

          ${processAccordionList(children)}
        </section>
      `;
    })
    .join("");

  renderAndRefresh(`
    <div class="page-stack">
      <nav
        class="breadcrumbs"
        aria-label="Breadcrumb"
      >
        <button
          type="button"
          onclick="showHome()"
        >
          Home
        </button>

        <span>&rsaquo;</span>

        <span>
          ${window.BOTSOP_UI.escape(requestType.title)}
        </span>
      </nav>

      <header class="process-header">
        <span class="process-header__icon">
          ${window.BOTSOP_UI.icon(
            requestType.icon || "folder"
          )}
        </span>

        <div>
          <p>Request Type</p>

          <h1>
            ${window.BOTSOP_UI.escape(requestType.title)}
          </h1>

          <span>
            ${window.BOTSOP_UI.escape(
              requestType.summary ||
              requestType.description ||
              "Operational guidance and workflows"
            )}
          </span>
        </div>
      </header>

      ${
        ungrouped.length
          ? `
            <section class="process-group">
              <header>
                <div>
                  <h2>
                    ${window.BOTSOP_UI.escape(
                      requestType.title
                    )}
                    Processes
                  </h2>

                  <p>
                    Expand a process to view its complete guidance.
                  </p>
                </div>
              </header>

              ${processAccordionList(ungrouped)}
            </section>
          `
          : ""
      }

      ${groupSections}

      ${
        !processes.length
          ? `
            <section class="empty-state">
              <h2>No processes mapped here</h2>

              <p>
                Add this request type to a content
                record’s <strong>Appears In</strong> field.
              </p>
            </section>
          `
          : ""
      }
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
        <header class="process-header"><span class="process-header__icon">${window.BOTSOP_UI.icon(parent.icon || "circle-check-big")}</span><div><p>Wrap Up</p><h1>${window.BOTSOP_UI.escape(parent.title)}</h1><span>${window.BOTSOP_UI.escape(parent.summary || "Complete each step before closing the ticket.")}</span></div></header>
        ${parent.instruction ? window.BOTSOP_UI.markdownSection("Overview", "clipboard-check", parent.instruction) : ""}
        <section class="process-group"><header><div><h2>Wrap Up Steps</h2><p>Select a step to view its full guidance.</p></div></header><div class="process-grid">${steps.map(window.BOTSOP_UI.processCard).join("")}</div></section>
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
      item.displayType && `<span>${window.BOTSOP_UI.icon("layout-template")} ${window.BOTSOP_UI.escape(item.displayType)}</span>`
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
        ${favoriteButton(item)}
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

  window.showSearch = function showSearch(rawQuery, addToHistory = true, restoreScroll = 0) {
    const query = String(rawQuery || "").trim();
    const input = document.querySelector(".header-search input");
    if (input && input.value !== query) input.value = query;
    if (!query) return window.showHome(false);
    if (addToHistory && window.appState.currentView !== "search") remember("search", null, query);
    else {
      window.appState.currentView = "search";
      window.appState.currentSection = null;
      window.appState.currentQuery = query;
    }
    const matches = window.baseModel.search(query);
    window.setActiveNavigation(null);
    renderAndRefresh(`
      <div class="page-stack">
        <header class="section-title"><span class="section-title__icon">${window.BOTSOP_UI.icon("search")}</span><div><h2>Search Results</h2><p>${matches.length} result${matches.length === 1 ? "" : "s"} for “${window.BOTSOP_UI.escape(query)}”</p></div></header>
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
   if (removing) {
  window.appState.favorites.delete(key);
} else {
  window.appState.favorites.add(key);
}

if (window.appState.currentView === "section") {
  window.showSection(
    window.appState.currentSection,
    false
  );
} else if (window.appState.currentView === "home") {
  window.showHome(false);
} else if (
  window.appState.currentView === "favorites"
) {
  window.showFavorites(false);
} else {
  window.showRecord(item.id, false);
}
  };

  async function loadFavorites() {
    if (!window.baseMeta?.favoritesEnabled) return;
    const response = await fetch("/api/favorites", { credentials: "same-origin", headers: { Accept: "application/json" } });
    if (!response.ok) return;
    const payload = await response.json();
    window.appState.favorites = new Set((payload.favorites || []).map(item => `${String(item.recordType).toLowerCase()}:${item.recordId}`));
  }

  function configureSearch() {
    const input = document.querySelector(".header-search input");
    if (!input) return;
    input.addEventListener("input", event => {
      const query = event.target.value.trim().toLowerCase();
      if (!query) return window.showHome(false);
      const matches = window.baseModel.items.filter(item =>
        [item.title, item.summary, item.instruction, ...item.appearsIn, ...item.ticketTags]
          .join(" ").toLowerCase().includes(query)
      ).slice(0, 50);
      window.setActiveNavigation(null);
      renderAndRefresh(`
        <div class="page-stack">
          <header class="section-title"><span class="section-title__icon">${window.BOTSOP_UI.icon("search")}</span><div><h2>Search Results</h2><p>${matches.length} result${matches.length === 1 ? "" : "s"} for “${window.BOTSOP_UI.escape(event.target.value)}”</p></div></header>
          <div class="process-grid">${matches.map(window.BOTSOP_UI.processCard).join("")}</div>
        </div>
      `);
    });
  }

  function installCombinedSearch() {
    const input = document.querySelector(".header-search input");
    if (!input) return;
    const replacement = input.cloneNode(true);
    input.replaceWith(replacement);
    replacement.addEventListener("input", event => window.showSearch(event.target.value, window.appState.currentView !== "search"));
  }

  function showStartupError(error) {
    renderAndRefresh(`<section class="empty-state"><h1>Unable to load BOT SOP</h1><p>${window.BOTSOP_UI.escape(error.message || error)}</p><button type="button" class="primary-action" onclick="window.location.reload()">Try again</button></section>`);
  }
function configureAgentAssistant() {
  const assistant = document.getElementById("agent-assistant");

  if (!assistant) return;

  assistant.href =
    "https://applink.feishu.cn/client/bot/open" +
    "?appId=cli_aaba0414f1b91bd7";

  assistant.target = "_blank";
  assistant.rel = "noopener noreferrer";
  assistant.hidden = false;
}
  async function initializeApp() {
    try {
      await window.baseDataReady;
      await loadFavorites();
      window.buildLeftNavigation();
      window.BOTSOP_UI.renderRightRail(window.baseModel);
      window.BOTSOP_UI.installImageViewer();
      window.showHome(false);
      installCombinedSearch();
      const signedIn = document.getElementById("signed-in-user");
      if (signedIn && window.baseMeta?.signedInAs) signedIn.textContent = window.baseMeta.signedInAs;
   configureAgentAssistant();
    } catch (error) {
      console.error("BOT SOP startup failed", error);
      showStartupError(error);
    }
  }

  initializeApp();
})();
