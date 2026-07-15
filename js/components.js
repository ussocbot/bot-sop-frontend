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
    const showDescriptions = !["BOT Tools", "OPUS Links", "QA Links"].includes(title);
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
      UI.sidebarCard("OPUS Links", "link", [...model.section("Link", "OPUS Links"), ...model.documentsFor("OPUS Links")], "violet"),
      UI.sidebarCard("QA Links", "badge-check", [...model.section("Link", "QA Links"), ...model.documentsFor("QA Links")], "teal")
    ].join("");
  };

  UI.guidanceDropdownSection = function guidanceDropdownSection(title, iconName, items, tone, summaryText = "") {
    const group = String(title || "guidance").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return `
      <details class="home-strip home-strip--${UI.escape(tone)} expectations-strip home-section-accordion" data-accordion-group="home-sections">
        <summary class="home-strip__heading">
          <span class="home-strip__icon">${UI.icon(iconName)}</span>
          <div class="home-strip__heading-copy">
            <h2>${UI.escape(title)}</h2>
            <p class="home-strip__summary">${UI.escape(summaryText || (items.length ? `${items.length} active item${items.length === 1 ? "" : "s"}` : "Nothing is mapped here yet."))}</p>
          </div>
          <span class="home-strip__count">${items.length}</span>
          ${UI.icon("chevron-down", "home-strip__chevron")}
        </summary>
        <div class="home-strip__content">
          ${items.length ? items.map(item => `
            <details class="expectation-item" data-accordion-group="home-entry-${UI.escape(group)}">
              <summary>
                <span class="expectation-item__title"><span class="expectation-item__icon">${UI.icon(item.icon || "file-text")}</span><strong>${UI.escape(item.title)}</strong></span>
                ${UI.icon("chevron-down")}
              </summary>
              <div class="expectation-item__body">${UI.inlineContent(item)}</div>
            </details>
          `).join("") : `<p class="home-strip__empty">Nothing is mapped here yet.</p>`}
        </div>
      </details>
    `;
  };

  UI.expectationsSection = function expectationsSection(items, summaryText = "") {
    return UI.guidanceDropdownSection("BOT Expectations", "clock-3", items, "green", summaryText);
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
    const kind = item.sourceType === "Documentation" ? "Resource" : "SOP";
    return `
      <button type="button" class="process-card" onclick="showRecord('${UI.escape(item.id)}')">
        <span class="process-card__icon">${UI.icon(item.icon || "file-text")}</span>
        <span><em class="content-kind">${kind}</em><strong>${UI.escape(item.title)}</strong><small>${UI.escape(item.description || "Open guidance")}</small></span>
        ${UI.icon("chevron-right")}
      </button>
    `;
  };

  UI.processAccordion = function processAccordion(item, favoriteHtml = "") {
    const kind = item.sourceType === "Documentation" ? "Resource" : "SOP";
    return `
      <details class="process-accordion" data-accordion-group="process-guidance">
        <summary>
          <span class="process-card__icon">${UI.icon(item.icon || "file-text")}</span>
          <span class="process-accordion__preview">
            <em class="content-kind">${kind}</em>
            <strong>${UI.escape(item.title)}</strong>
            <small>${UI.escape(item.description || "Open guidance")}</small>
          </span>
          ${UI.icon("chevron-down", "process-accordion__chevron")}
        </summary>
        <div class="process-accordion__body">${UI.inlineContent(item, favoriteHtml)}</div>
      </details>
    `;
  };

  UI.updatesCallout = function updatesCallout(url) {
    if (!url) return "";
    return `
      <section class="updates-callout">
        <span>${UI.icon("mail-warning")}</span>
        <div><h2>Check Your Unacknowledged Updates</h2><p>Review Important News or SOP Updates that may still need your acknowledgment.</p></div>
        <a href="${UI.escape(url)}" target="_blank" rel="noopener noreferrer">View My Updates ${UI.icon("arrow-up-right")}</a>
      </section>
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
    const relatedResources = (resources || []).filter(item => item?.url);
    const linkedTasks = (tasks || []).filter(item => item?.id && !item.unresolved);
    if (!relatedResources.length && !linkedTasks.length) return "";
    return `
      <section class="detail-section">
        <h2>${UI.icon("link-2")} Related Resources &amp; Tasks</h2>
        <div class="detail-link-list">
          ${relatedResources.map(item => `
            <div class="detail-link-row">
              <a class="detail-link-main" href="${UI.escape(item.url)}" target="_blank" rel="noopener noreferrer">
                <span>${UI.icon(item.icon || "book-open")}<strong>${UI.escape(item.title)}</strong><small class="link-kind">Resource</small></span>${UI.icon("arrow-up-right")}
              </a>
              <button type="button" class="copy-link-button" data-copy-url="${UI.escape(item.url)}" onclick="copyRelatedLink(this.dataset.copyUrl, this)" aria-label="Copy link to ${UI.escape(item.title)}" title="Copy link">${UI.icon("copy")}</button>
            </div>
          `).join("")}
          ${linkedTasks.map(item => `
            <div class="detail-link-row">
              <button type="button" class="detail-link-main" onclick="showRecord('${UI.escape(item.id)}')">
                <span>${UI.icon(item.icon || "file-text")}<strong>${UI.escape(item.title)}</strong><small class="link-kind">SOP entry</small></span>${UI.icon("chevron-right")}
              </button>
              <button type="button" class="copy-link-button" data-copy-url="${UI.escape(`${window.location.origin}${window.location.pathname}?record=${encodeURIComponent(item.id)}`)}" onclick="copyRelatedLink(this.dataset.copyUrl, this)" aria-label="Copy link to ${UI.escape(item.title)}" title="Copy link">${UI.icon("copy")}</button>
            </div>
          `).join("")}
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
              <img src="${UI.escape(image.src)}" alt="${UI.escape(image.name)}" loading="lazy" onerror="this.closest('button').classList.add('is-error'); this.alt='Image unavailable';">
              <span class="guidance-gallery__name">${UI.escape(image.name)}</span>
              <span class="guidance-gallery__error">Image unavailable</span>
            </button>
          `).join("")}
        </div>
      </section>
    `;
  };

  UI.inlineContent = function inlineContent(item, favoriteHtml = "") {
    const hasContent = item.instruction || item.screenshotGuidance || item.screenshots?.length ||
      item.relatedResources?.length || item.linkedTasks?.length || item.closingGuidance ||
      item.ticketTags?.length || item.url;
    if (!hasContent && !favoriteHtml) return `<p class="inline-content__empty">No guidance has been added yet.</p>`;
    return `
      <div class="inline-content">
        ${favoriteHtml}
        ${UI.markdownSection("Instructions", "clipboard-list", item.instruction)}
        ${UI.detailSection("Screenshot Guidance", "image", item.screenshotGuidance)}
        ${UI.imageGallery(item.screenshots)}
        ${UI.relatedItemsSection(item.relatedResources, item.linkedTasks)}
        ${UI.detailSection("Closing Guidance", "message-square-check", item.closingGuidance)}
        ${UI.detailSection("Ticket Tags", "tags", item.ticketTags)}
        ${item.url ? `<a class="primary-action compact-resource-action" href="${UI.escape(item.url)}" target="_blank" rel="noopener noreferrer">${UI.escape(item.ctaLabel || "Open Resource")} ${UI.icon("arrow-up-right")}</a>` : ""}
      </div>
    `;
  };

  window.copyRelatedLink = async function copyRelatedLink(url, button) {
    if (!url) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
      else {
        const fallback = document.createElement("textarea");
        fallback.value = url;
        fallback.style.position = "fixed";
        fallback.style.opacity = "0";
        document.body.appendChild(fallback);
        fallback.select();
        document.execCommand("copy");
        fallback.remove();
      }
      if (button) {
        button.classList.add("is-copied");
        button.innerHTML = `${UI.icon("check")}<span>Copied</span>`;
        UI.refreshIcons();
        window.setTimeout(() => {
          if (!button.isConnected) return;
          button.classList.remove("is-copied");
          button.innerHTML = UI.icon("copy");
          UI.refreshIcons();
        }, 1600);
      }
    } catch (error) {
      window.alert("Unable to copy this link. Please try again.");
    }
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
