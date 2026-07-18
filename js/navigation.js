(function installNavigation() {
  "use strict";

  window.buildLeftNavigation = function buildLeftNavigation() {
    const nav = document.getElementById("left-navigation");
    const model = window.baseModel;
    if (!nav || !model) return;

    const callouts = model.section("Callout", "OOS Routing");
    const oosRoutes = model.documentsFor("OOS Routing");
    const allOosRoutes = [...new Map([...callouts, ...oosRoutes].map(item => [item.id, item])).values()]
      .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
    const markedQuickAccess = allOosRoutes.filter(item => item.quickAccess);
    const quickAccessRoutes = (markedQuickAccess.length ? markedQuickAccess : allOosRoutes).slice(0, 6);
    const hiddenRequestTypes = new Set([
      "e-commerce", "ecommerce", "best practices", "circumvention / recidivism",
      "circumvention/recidivism", "remarks / closing", "remarks/closing",
      "response wrap-up", "response wrap up", "wrap up", "ticket guidance", "oos routing"
    ]);
    const visibleRequestTypes = model.requestTypes.filter(item => !hiddenRequestTypes.has(item.title.trim().toLowerCase()));
    nav.innerHTML = `
      <div class="nav-block">
        <p class="nav-label">Request Types</p>
        ${visibleRequestTypes.map(item => `
          <button type="button" class="nav-item" data-section-id="${window.BOTSOP_UI.escape(item.id)}" onclick="showSection('${window.BOTSOP_UI.escape(item.id)}')">
            ${window.BOTSOP_UI.icon(item.icon || "folder")}
            <span>${item.specialType ? `${window.BOTSOP_UI.icon("star", "special-request-icon")} ` : ""}${window.BOTSOP_UI.escape(item.title)}</span>
            ${window.BOTSOP_UI.icon("chevron-right")}
          </button>
        `).join("")}
      </div>
      ${window.baseMeta?.favoritesEnabled ? `
        <div class="nav-block personal-nav">
          <p class="nav-label">Personal</p>
          <button type="button" class="nav-item" data-section-id="favorites" onclick="showFavorites()">
            ${window.BOTSOP_UI.icon("star")}<span>My Favorites</span>${window.BOTSOP_UI.icon("chevron-right")}
          </button>
        </div>
      ` : ""}
      <div class="nav-callouts">
        ${allOosRoutes.length ? `
          <section class="side-card side-card--green oos-side-card">
            <header class="side-card__header"><span>${window.BOTSOP_UI.icon("route")} OOS Quick Access</span><small>${allOosRoutes.length} total</small></header>
            <div class="side-card__items">
            ${quickAccessRoutes.map(item => item.url ? `
              <a class="side-card__item" href="${window.BOTSOP_UI.escape(item.url)}" target="_blank" rel="noopener noreferrer">
                <span><strong>${window.BOTSOP_UI.escape(item.title)}</strong></span>${window.BOTSOP_UI.icon("arrow-up-right")}
              </a>` : `
              <a class="side-card__item" href="#" onclick="event.preventDefault(); showRecord('${window.BOTSOP_UI.escape(item.id)}')">
                <span><strong>${window.BOTSOP_UI.escape(item.title)}</strong></span>${window.BOTSOP_UI.icon("chevron-right")}
              </a>`).join("")}
            </div>
            <button type="button" class="side-card__view-all" onclick="showOosRouting()">View All OOS Routing ${window.BOTSOP_UI.icon("arrow-right")}</button>
          </section>
        ` : ""}
      </div>
    `;
  };

  window.setActiveNavigation = function setActiveNavigation(sectionId) {
    document.querySelectorAll(".nav-item").forEach(item => {
      item.classList.toggle("is-active", item.dataset.sectionId === sectionId);
    });
  };
})();
