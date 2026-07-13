window.appState = { currentView: "home", currentSection: null, history: [] };

(function installApp() {
  "use strict";

  function contentView() {
    return document.getElementById("content-view");
  }

  function renderAndRefresh(html) {
    const target = contentView();
    if (!target) return;
    target.innerHTML = html;
    window.BOTSOP_UI.refreshIcons();
  }

  function remember(view, id) {
    const previous = { view: window.appState.currentView, id: window.appState.currentSection };
    if (previous.view !== view || previous.id !== id) window.appState.history.push(previous);
    window.appState.currentView = view;
    window.appState.currentSection = id || null;
  }

  window.showHome = function showHome(addToHistory = true) {
    const model = window.baseModel;
    if (!model) return;
    if (addToHistory) remember("home", null);
    else {
      window.appState.currentView = "home";
      window.appState.currentSection = null;
    }
    window.setActiveNavigation(null);

    const expectations = model.section("Section", "BOT Expectations");
    const bestPractices = model.section("Section", "Best Practices");
    const wrapUp = model.section("Checklist", "Wrap Up");
    const warnings = model.section("Warning", "Policy Reminders");

    renderAndRefresh(`
      <div class="page-stack">
        ${window.BOTSOP_UI.mappingAlert(model.unmapped)}
        ${window.BOTSOP_UI.homeSection("BOT Expectations", "clock-3", expectations, "green")}
        ${window.BOTSOP_UI.homeSection("Best Practices", "sparkles", bestPractices, "blue")}
        ${window.BOTSOP_UI.requestTypeGrid(model.requestTypes)}
        ${window.BOTSOP_UI.homeSection("Wrap Up", "circle-check-big", wrapUp, "violet")}
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

    const allItems = model.processesFor(requestType.title);
    const groups = allItems.filter(item => item.displayType === "Process Group");
    const processes = allItems.filter(item => item.displayType === "Process");
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
          <div class="process-grid">${children.map(window.BOTSOP_UI.processCard).join("")}</div>
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
        ${ungrouped.length ? `<section class="process-group"><header><div><h2>${window.BOTSOP_UI.escape(requestType.title)} Processes</h2><p>Select a process to view the full instructions.</p></div></header><div class="process-grid">${ungrouped.map(window.BOTSOP_UI.processCard).join("")}</div></section>` : ""}
        ${groupSections}
        ${!processes.length ? `<section class="empty-state"><h2>No processes mapped here</h2><p>Add this request type to a Process record's <strong>Appears In</strong> field.</p></section>` : ""}
      </div>
    `);
  };

  window.showRecord = function showRecord(recordId, addToHistory = true) {
    const model = window.baseModel;
    const item = model?.find(recordId);
    if (!model || !item) return;
    if (item.displayType === "Request Type") return window.showSection(item.id, addToHistory);
    if (["Link", "Tool"].includes(item.displayType)) {
      if (item.url) window.open(item.url, "_blank", "noopener,noreferrer");
      return;
    }
    if (addToHistory) remember("record", item.id);

    const context = item.appearsIn[0];
    const requestType = context && model.requestTypes.find(candidate => candidate.title === context);
    window.setActiveNavigation(requestType?.id || null);

    const meta = [
      item.status && `<span>${window.BOTSOP_UI.icon("circle-dot")} ${window.BOTSOP_UI.escape(item.status)}</span>`,
      item.lastUpdated && `<span>${window.BOTSOP_UI.icon("calendar-clock")} Updated ${window.BOTSOP_UI.escape(item.lastUpdated)}</span>`,
      item.displayType && `<span>${window.BOTSOP_UI.icon("layout-template")} ${window.BOTSOP_UI.escape(item.displayType)}</span>`
    ].filter(Boolean).join("");

    renderAndRefresh(`
      <article class="record-page">
        <nav class="breadcrumbs" aria-label="Breadcrumb">
          <button type="button" onclick="showHome()">Home</button>
          ${requestType ? `<span>›</span><button type="button" onclick="showSection('${window.BOTSOP_UI.escape(requestType.id)}')">${window.BOTSOP_UI.escape(requestType.title)}</button>` : ""}
          <span>›</span><span>${window.BOTSOP_UI.escape(item.title)}</span>
        </nav>
        <header class="record-header">
          <span class="record-header__icon">${window.BOTSOP_UI.icon(item.icon || "file-text")}</span>
          <div><p>${window.BOTSOP_UI.escape(item.baseSection)}</p><h1>${window.BOTSOP_UI.escape(item.title)}</h1><span>${window.BOTSOP_UI.escape(item.summary || item.description || "")}</span></div>
        </header>
        <div class="record-meta">${meta}</div>
        ${window.BOTSOP_UI.detailSection("Instructions", "clipboard-list", item.instruction)}
        ${window.BOTSOP_UI.detailSection("Screenshot Guidance", "image", item.screenshotGuidance)}
        ${window.BOTSOP_UI.imageGallery(item.screenshots)}
        ${window.BOTSOP_UI.relatedResourceLinks(item.relatedResources)}
        ${window.BOTSOP_UI.linkedTaskLinks(item.linkedTasks)}
        ${window.BOTSOP_UI.detailSection("Ticket Tags", "tags", item.ticketTags)}
        ${window.BOTSOP_UI.detailSection("Ticket Tag Display", "tag", item.ticketTagDisplay)}
        ${window.BOTSOP_UI.detailSection("Closing Guidance", "message-square-check", item.closingGuidance)}
        ${item.url ? `<a class="primary-action" href="${window.BOTSOP_UI.escape(item.url)}" target="_blank" rel="noopener noreferrer">${window.BOTSOP_UI.escape(item.ctaLabel)} ${window.BOTSOP_UI.icon("arrow-up-right")}</a>` : ""}
      </article>
    `);
  };

  window.goBack = function goBack() {
    const prior = window.appState.history.pop();
    if (!prior || prior.view === "home") return window.showHome(false);
    if (prior.view === "section") return window.showSection(prior.id, false);
    return window.showRecord(prior.id, false);
  };

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

  function showStartupError(error) {
    renderAndRefresh(`<section class="empty-state"><h1>Unable to load BOT SOP</h1><p>${window.BOTSOP_UI.escape(error.message || error)}</p><button type="button" class="primary-action" onclick="window.location.reload()">Try again</button></section>`);
  }

  async function initializeApp() {
    try {
      await window.baseDataReady;
      window.buildLeftNavigation();
      window.BOTSOP_UI.renderRightRail(window.baseModel);
      window.BOTSOP_UI.installImageViewer();
      window.showHome(false);
      configureSearch();
      const signedIn = document.getElementById("signed-in-user");
      if (signedIn && window.baseMeta?.signedInAs) signedIn.textContent = window.baseMeta.signedInAs;
    } catch (error) {
      console.error("BOT SOP startup failed", error);
      showStartupError(error);
    }
  }

  initializeApp();
})();
