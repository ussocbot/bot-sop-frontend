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

  UI.markdown = function markdown(value) {
    const source = String(value ?? "").replace(/\r\n?/g, "\n");
    if (!source.trim()) return "";

    function inline(rawLine) {
      const tokens = [];
      const stash = html => {
        const marker = `%%BOTFMT${tokens.length}%%`;
        tokens.push(html);
        return marker;
      };
      let line = rawLine;
      line = line.replace(/`([^`\n]+)`/g, (_, code) => stash(`<code>${UI.escape(code)}</code>`));
      line = line.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/gi, (_, label, url) =>
        stash(`<a href="${UI.escape(url)}" target="_blank" rel="noopener noreferrer">${UI.escape(label)}</a>`)
      );
      line = line.replace(/https?:\/\/[^\s<]+/gi, rawUrl => {
        const trailing = rawUrl.match(/[.,;:!?]+$/)?.[0] || "";
        const url = trailing ? rawUrl.slice(0, -trailing.length) : rawUrl;
        return `${stash(`<a href="${UI.escape(url)}" target="_blank" rel="noopener noreferrer">${UI.escape(url)}</a>`)}${UI.escape(trailing)}`;
      });
      line = UI.escape(line)
        .replace(/\*\*\*([^*\n]+)\*\*\*/g, "<strong><em>$1</em></strong>")
        .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
        .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
        .replace(/_([^_\n]+)_/g, "<em>$1</em>");
      return line.replace(/%%BOTFMT(\d+)%%/g, (_, index) => tokens[Number(index)] || "");
    }

    const html = [];
    let listType = "";
    function closeList() {
      if (listType) html.push(`</${listType}>`);
      listType = "";
    }

    source.split("\n").forEach(line => {
      if (!line.trim()) {
        closeList();
        return;
      }
      const heading = line.match(/^(#{1,3})\s+(.+)$/);
      if (heading) {
        closeList();
        const level = heading[1].length + 2;
        html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
        return;
      }
      const unordered = line.match(/^\s*[-*]\s+(.+)$/);
      const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
      if (unordered || ordered) {
        const desired = unordered ? "ul" : "ol";
        if (listType !== desired) {
          closeList();
          listType = desired;
          html.push(`<${desired}>`);
        }
        html.push(`<li>${inline((unordered || ordered)[1])}</li>`);
        return;
      }
      closeList();
      html.push(`<p>${inline(line)}</p>`);
    });
    closeList();
    return html.join("");
  };

  UI.markdownSection = function markdownSection(title, iconName, value) {
    if (!value) return "";
    return `
      <section class="detail-section formatted-content">
        <h2>${UI.icon(iconName)} ${UI.escape(title)}</h2>
        <div class="detail-section__body">${UI.markdown(value)}</div>
      </section>
    `;
  };

  UI.actionAttributes = function actionAttributes(item) {
    if ((item.isFeatured || ["News", "SOP Update"].includes(item.displayType)) && item.id) {
      return `href="#" onclick="event.preventDefault(); showRecord('${UI.escape(item.id)}')"`;
    }
    if (item.url) {
      return `href="${UI.escape(item.url)}" target="_blank" rel="noopener noreferrer"`;
    }
    if (["Link", "Tool"].includes(item.displayType)) {
      return `href="#" aria-disabled="true" title="URL required" onclick="event.preventDefault()"`;
    }
    return `href="#" onclick="event.preventDefault(); showRecord('${UI.escape(item.id)}')"`;
  };

  UI.itemBadge = function itemBadge(item) {
    if (item.badge) return item.badge;
    if (!item.publishDate) return "";
    const raw = String(item.publishDate).trim();
    const published = /^\d{10,13}$/.test(raw)
      ? new Date(raw.length === 10 ? Number(raw) * 1000 : Number(raw))
      : new Date(raw);
    if (Number.isNaN(published.getTime())) return "";
    const age = Date.now() - published.getTime();
    return age >= 0 && age <= 7 * 24 * 60 * 60 * 1000 ? "New" : "";
  };

  UI.sidebarCard = function sidebarCard(title, iconName, items, tone) {
    const showDescriptions = !["BOT Tools", "OPUS Links"].includes(title);
    return `
      <section class="side-card side-card--${UI.escape(tone)}">
        <header class="side-card__header">
          <span>${UI.icon(iconName)} ${UI.escape(title)}</span>
          <small>${items.length} item${items.length === 1 ? "" : "s"}</small>
        </header>
        <div class="side-card__items">
          ${items.length ? items.map(item => {
            const badge = UI.itemBadge(item);
            return `
            <a class="side-card__item${["Link", "Tool"].includes(item.displayType) && !item.url ? " is-disabled" : ""}" ${UI.actionAttributes(item)}>
              <span>
                <span class="side-card__title"><strong>${UI.escape(item.title)}</strong>${badge ? `<em class="side-card__badge">${UI.escape(badge)}</em>` : ""}</span>
                ${showDescriptions && item.summary ? `<small>${UI.escape(item.summary)}</small>` : ""}
              </span>
              ${UI.icon(item.displayType === "Link" ? "arrow-up-right" : (item.url ? "arrow-up-right" : "chevron-right"))}
            </a>
          `; }).join("") : `<p class="side-card__empty">No published items mapped here.</p>`}
        </div>
      </section>
    `;
  };

  UI.renderRightRail = function renderRightRail(model) {
    const rail = document.getElementById("right-rail");
    if (!rail) return;
    const unique = items => [...new Map(items.map(item => [item.id, item])).values()];
    rail.innerHTML = [
      UI.sidebarCard("Important News", "megaphone", unique([...model.featuredFor("Important News"), ...model.section("News", "Important News")]), "green"),
      UI.sidebarCard("SOP Updates", "file-clock", unique([...model.featuredFor("SOP Updates"), ...model.section("SOP Update", "SOP Updates")]), "orange"),
      UI.sidebarCard("BOT Tools", "wrench", [...model.section("Tool", "BOT Tools"), ...model.documentsFor("BOT Tools")], "blue"),
      UI.sidebarCard("OPUS Links", "link", [...model.section("Link", "OPUS Links"), ...model.documentsFor("OPUS Links")], "violet")
    ].join("");
  };

  UI.guidanceDropdownSection = function guidanceDropdownSection(title, iconName, items, tone) {
    return `
      <section class="home-strip home-strip--${UI.escape(tone)} expectations-strip">
        <div class="home-strip__heading">
          <span class="home-strip__icon">${UI.icon(iconName)}</span>
          <div><h2>${UI.escape(title)}</h2><p>${items.length ? `${items.length} published item${items.length === 1 ? "" : "s"}` : "Nothing is mapped here yet."}</p></div>
        </div>
        <div class="home-strip__content">
          ${items.map(item => `
            <details class="expectation-item">
              <summary><strong>${UI.escape(item.title)}</strong>${UI.icon("chevron-down")}</summary>
              ${(item.instruction || item.url) ? `<div class="expectation-item__body">
                ${item.instruction ? UI.markdown(item.instruction) : ""}
                ${item.url ? `<a class="primary-action" href="${UI.escape(item.url)}" target="_blank" rel="noopener noreferrer">${UI.escape(item.ctaLabel || "Open Resource")} ${UI.icon("arrow-up-right")}</a>` : ""}
              </div>` : ""}
            </details>
          `).join("")}
        </div>
      </section>
    `;
  };

  UI.expectationsSection = function expectationsSection(items) {
    return UI.guidanceDropdownSection("BOT Expectations", "clock-3", items, "green");
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

  UI.relatedResourceLinks = function relatedResourceLinks(items) {
    if (!items?.length) return "";
    return `
      <section class="detail-section">
        <h2>${UI.icon("link")} Related Resources</h2>
        <div class="detail-link-list">
          ${items.map(item => item.url ? `
            <a href="${UI.escape(item.url)}" target="_blank" rel="noopener noreferrer">
              <span>${UI.icon(item.icon || "book-open")}<strong>${UI.escape(item.title)}</strong></span>${UI.icon("arrow-up-right")}
            </a>
          ` : `<span class="detail-link-list__unavailable">${UI.icon("unlink")}<strong>${UI.escape(item.title)}</strong><small>URL unavailable</small></span>`).join("")}
        </div>
      </section>
    `;
  };

  UI.linkedTaskLinks = function linkedTaskLinks(items) {
    if (!items?.length) return "";
    return `
      <section class="detail-section">
        <h2>${UI.icon("list-checks")} Linked Tasks</h2>
        <div class="detail-link-list">
          ${items.map(item => item.id ? `
            <button type="button" onclick="showRecord('${UI.escape(item.id)}')">
              <span>${UI.icon("file-text")}<strong>${UI.escape(item.title)}</strong></span>${UI.icon("chevron-right")}
            </button>
          ` : `<span class="detail-link-list__unavailable">${UI.icon("file-question")}<strong>${UI.escape(item.title)}</strong><small>Entry unavailable</small></span>`).join("")}
        </div>
      </section>
    `;
  };

  UI.relatedItemsSection = function relatedItemsSection(resources, tasks) {
    const relatedResources = resources || [];
    const linkedTasks = tasks || [];
    if (!relatedResources.length && !linkedTasks.length) return "";
    return `
      <section class="detail-section">
        <h2>${UI.icon("link-2")} Related Resources &amp; Tasks</h2>
        <div class="detail-link-list">
          ${relatedResources.map(item => item.url ? `
            <a href="${UI.escape(item.url)}" target="_blank" rel="noopener noreferrer">
              <span>${UI.icon(item.icon || "book-open")}<strong>${UI.escape(item.title)}</strong><small class="link-kind">Resource</small></span>${UI.icon("arrow-up-right")}
            </a>
          ` : `<span class="detail-link-list__unavailable">${UI.icon("unlink")}<strong>${UI.escape(item.title)}</strong><small>URL unavailable</small></span>`).join("")}
          ${linkedTasks.map(item => item.id ? `
            <button type="button" onclick="showRecord('${UI.escape(item.id)}')">
              <span>${UI.icon("file-text")}<strong>${UI.escape(item.title)}</strong><small class="link-kind">SOP entry</small></span>${UI.icon("chevron-right")}
            </button>
          ` : `<span class="detail-link-list__unavailable">${UI.icon("file-question")}<strong>${UI.escape(item.title)}</strong><small>Entry unavailable</small></span>`).join("")}
        </div>
      </section>
    `;
  };

  UI.imageGallery = function imageGallery(images) {
    if (!images?.length) return "";
    return `
      <section class="detail-section">
        <h2>${UI.icon("images")} Guidance Images</h2>
        <div class="guidance-gallery">
          ${images.map(image => `
            <button type="button" data-src="${UI.escape(image.src)}" data-name="${UI.escape(image.name)}" onclick="openGuidanceImage(this.dataset.src, this.dataset.name)" aria-label="Open ${UI.escape(image.name)}">
              <img src="${UI.escape(image.src)}" alt="${UI.escape(image.name)}" loading="lazy">
              <span>${UI.escape(image.name)}</span>
            </button>
          `).join("")}
        </div>
      </section>
    `;
  };

  UI.installImageViewer = function installImageViewer() {
    if (document.getElementById("guidance-image-viewer")) return;
    document.body.insertAdjacentHTML("beforeend", `
      <div id="guidance-image-viewer" class="image-viewer" hidden role="dialog" aria-modal="true" aria-label="Guidance image viewer">
        <button type="button" class="image-viewer__backdrop" aria-label="Close image" onclick="closeGuidanceImage()"></button>
        <div class="image-viewer__panel">
          <header><strong id="guidance-image-title">Guidance image</strong><button type="button" onclick="closeGuidanceImage()" aria-label="Close image">${UI.icon("x")}</button></header>
          <img id="guidance-image-full" alt="">
        </div>
      </div>
    `);
    window.openGuidanceImage = function openGuidanceImage(src, name) {
      const viewer = document.getElementById("guidance-image-viewer");
      const image = document.getElementById("guidance-image-full");
      document.getElementById("guidance-image-title").textContent = name || "Guidance image";
      image.src = src;
      image.alt = name || "Guidance image";
      viewer.hidden = false;
      document.body.classList.add("has-modal");
    };
    window.closeGuidanceImage = function closeGuidanceImage() {
      const viewer = document.getElementById("guidance-image-viewer");
      if (viewer) viewer.hidden = true;
      document.body.classList.remove("has-modal");
    };
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") window.closeGuidanceImage();
    });
  };
})();
