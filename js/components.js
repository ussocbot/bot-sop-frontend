(function installComponents() {
  "use strict";

  const UI = window.BOTSOP_UI = {};

  UI.escape = function escape(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  UI.icon = function icon(name, className = "") {
    return `<i data-lucide="${UI.escape(name || "file-text")}" class="${UI.escape(className)}"></i>`;
  };

  UI.refreshIcons = function refreshIcons() {
    if (window.lucide?.createIcons) window.lucide.createIcons();
  };

  UI.textBlocks = function textBlocks(value) {
    const safe = UI.escape(value || "No content has been added yet.");
    return safe.split(/\n{2,}/).map(block => `<p>${block.replace(/\n/g, "<br>")}</p>`).join("");
  };

  UI.actionAttributes = function actionAttributes(item) {
    if (item.url) {
      return `href="${UI.escape(item.url)}" target="_blank" rel="noopener noreferrer"`;
    }
    return `href="#" onclick="event.preventDefault(); showRecord('${UI.escape(item.id)}')"`;
  };

  UI.sidebarCard = function sidebarCard(title, iconName, items, tone) {
    return `
      <section class="side-card side-card--${UI.escape(tone)}">
        <header class="side-card__header">
          <span>${UI.icon(iconName)} ${UI.escape(title)}</span>
          <small>${items.length} item${items.length === 1 ? "" : "s"}</small>
        </header>
        <div class="side-card__items">
          ${items.length ? items.map(item => `
            <a class="side-card__item" ${UI.actionAttributes(item)}>
              <span>
                <strong>${UI.escape(item.title)}</strong>
                ${item.summary || item.badge ? `<small>${UI.escape(item.badge || item.summary)}</small>` : ""}
              </span>
              ${UI.icon(item.url ? "arrow-up-right" : "chevron-right")}
            </a>
          `).join("") : `<p class="side-card__empty">No published items mapped here.</p>`}
        </div>
      </section>
    `;
  };

  UI.renderRightRail = function renderRightRail(model) {
    const rail = document.getElementById("right-rail");
    if (!rail) return;
    rail.innerHTML = [
      UI.sidebarCard("BOT Tools", "wrench", model.section("Tool", "BOT Tools"), "blue"),
      UI.sidebarCard("OPUS Links", "link", model.section("Link", "OPUS Links"), "violet"),
      UI.sidebarCard("Important News", "megaphone", model.section("News", "Important News"), "green"),
      UI.sidebarCard("SOP Updates", "file-clock", model.section("SOP Update", "SOP Updates"), "orange")
    ].join("");
  };

  UI.homeSection = function homeSection(title, iconName, items, tone) {
    return `
      <section class="home-strip home-strip--${UI.escape(tone)}">
        <div class="home-strip__heading">
          <span class="home-strip__icon">${UI.icon(iconName)}</span>
          <div>
            <h2>${UI.escape(title)}</h2>
            <p>${items.length ? `${items.length} published item${items.length === 1 ? "" : "s"}` : "Nothing is mapped here yet."}</p>
          </div>
        </div>
        <div class="home-strip__content">
          ${items.map(item => `
            <button type="button" class="strip-row" onclick="showRecord('${UI.escape(item.id)}')">
              <span><strong>${UI.escape(item.title)}</strong>${item.summary ? `<small>${UI.escape(item.summary)}</small>` : ""}</span>
              ${UI.icon("chevron-right")}
            </button>
          `).join("")}
        </div>
      </section>
    `;
  };

  UI.requestTypeGrid = function requestTypeGrid(requestTypes) {
    return `
      <section class="request-area">
        <header class="section-title">
          <span class="section-title__icon">${UI.icon("layout-grid")}</span>
          <div><h2>Review by Request Type</h2><p>Select the ticket or product area you are reviewing.</p></div>
        </header>
        <div class="request-grid">
          ${requestTypes.map(item => `
            <button type="button" class="request-card" onclick="showSection('${UI.escape(item.id)}')">
              <span class="request-card__icon">${UI.icon(item.icon || "folder")}</span>
              <span><strong>${UI.escape(item.title)}</strong><small>${UI.escape(item.description || "Open guidance")}</small></span>
              ${UI.icon("chevron-right")}
            </button>
          `).join("")}
        </div>
      </section>
    `;
  };

  UI.warningCards = function warningCards(items) {
    return items.map(item => `
      <section class="wide-warning">
        <span class="wide-warning__icon">${UI.icon(item.icon || "shield-alert")}</span>
        <div><h2>${UI.escape(item.title)}</h2>${UI.textBlocks(item.instruction || item.summary)}</div>
      </section>
    `).join("");
  };

  UI.mappingAlert = function mappingAlert(items) {
    if (!items.length) return "";
    return `
      <details class="mapping-alert">
        <summary>${UI.icon("triangle-alert")} ${items.length} published record${items.length === 1 ? "" : "s"} need mapping</summary>
        <p>These records are intentionally not placed because their Display Type and Base Section combination is not part of the layout contract.</p>
        <ul>${items.map(item => `<li><strong>${UI.escape(item.title)}</strong>: ${UI.escape(item.displayType || "blank")} / ${UI.escape(item.baseSection || "blank")}</li>`).join("")}</ul>
      </details>
    `;
  };

  UI.processCard = function processCard(item) {
    return `
      <button type="button" class="process-card" onclick="showRecord('${UI.escape(item.id)}')">
        <span class="process-card__icon">${UI.icon(item.icon || "file-text")}</span>
        <span><strong>${UI.escape(item.title)}</strong><small>${UI.escape(item.description || "Open process guidance")}</small></span>
        ${UI.icon("chevron-right")}
      </button>
    `;
  };

  UI.detailSection = function detailSection(title, iconName, value) {
    if (!value || (Array.isArray(value) && !value.length)) return "";
    const body = Array.isArray(value)
      ? `<ul>${value.map(item => `<li>${UI.escape(item)}</li>`).join("")}</ul>`
      : UI.textBlocks(value);
    return `
      <section class="detail-section">
        <h2>${UI.icon(iconName)} ${UI.escape(title)}</h2>
        <div class="detail-section__body">${body}</div>
      </section>
    `;
  };
})();
