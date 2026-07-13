(function installNavigation() {
  "use strict";

  window.buildLeftNavigation = function buildLeftNavigation() {
    const nav = document.getElementById("left-navigation");
    const model = window.baseModel;
    if (!nav || !model) return;

    const callouts = model.section("Callout", "OOS Routing");
    const oosRoutes = model.documentsFor("OOS Routing");
    nav.innerHTML = `
      <div class="nav-block">
        <p class="nav-label">Request Types</p>
        ${model.requestTypes.map(item => `
          <button type="button" class="nav-item" data-section-id="${window.BOTSOP_UI.escape(item.id)}" onclick="showSection('${window.BOTSOP_UI.escape(item.id)}')">
            ${window.BOTSOP_UI.icon(item.icon || "folder")}
            <span>${window.BOTSOP_UI.escape(item.title)}</span>
            ${window.BOTSOP_UI.icon("chevron-right")}
          </button>
        `).join("")}
      </div>
      <div class="nav-callouts">
        ${(callouts.length || oosRoutes.length) ? `
          <section class="side-card side-card--green oos-side-card">
            <header class="side-card__header"><span>${window.BOTSOP_UI.icon("route")} OOS Routing</span><small>${callouts.length + oosRoutes.length} items</small></header>
            <div class="side-card__items">
              ${callouts.map(item => `
                <a class="side-card__item" href="#" onclick="event.preventDefault(); showRecord('${window.BOTSOP_UI.escape(item.id)}')">
                  <span><strong>${window.BOTSOP_UI.escape(item.title)}</strong></span>${window.BOTSOP_UI.icon("chevron-right")}
                </a>
              `).join("")}
            ${oosRoutes.map(item => item.url ? `
              <a class="side-card__item" href="${window.BOTSOP_UI.escape(item.url)}" target="_blank" rel="noopener noreferrer">
                <span>${window.BOTSOP_UI.escape(item.title)}</span>${window.BOTSOP_UI.icon("arrow-up-right")}
              </a>
            ` : `<a class="side-card__item is-disabled" href="#" aria-disabled="true" title="URL required" onclick="event.preventDefault()"><span><strong>${window.BOTSOP_UI.escape(item.title)}</strong></span>${window.BOTSOP_UI.icon("arrow-up-right")}</a>`).join("")}
            </div>
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
