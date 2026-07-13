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
        ${callouts.map(item => `
          <button type="button" class="nav-callout" onclick="showRecord('${window.BOTSOP_UI.escape(item.id)}')">
            ${window.BOTSOP_UI.icon(item.icon || "route")}
            <span><strong>${window.BOTSOP_UI.escape(item.title)}</strong><small>${window.BOTSOP_UI.escape(item.summary || "Open routing guidance")}</small></span>
          </button>
        `).join("")}
        ${oosRoutes.length ? `
          <section class="oos-route-card">
            <header>${window.BOTSOP_UI.icon("route")}<strong>OOS Routing</strong></header>
            ${oosRoutes.map(item => item.url ? `
              <a href="${window.BOTSOP_UI.escape(item.url)}" target="_blank" rel="noopener noreferrer">
                <span>${window.BOTSOP_UI.escape(item.title)}</span>${window.BOTSOP_UI.icon("arrow-up-right")}
              </a>
            ` : `<span class="oos-route-card__disabled"><span>${window.BOTSOP_UI.escape(item.title)}</span><small>URL required</small></span>`).join("")}
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
