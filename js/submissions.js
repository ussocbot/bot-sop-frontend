(function installSubmissionCenter() {
  "use strict";

  const state = {
    access: null,
    accessPromise: null,
    activeTab: "resource"
  };

  const UI = () => window.BOTSOP_UI;

  function key(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function escape(value) {
    return UI().escape(value == null ? "" : String(value));
  }

  async function request(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      headers: { Accept: "application/json", ...(options.headers || {}) },
      ...options
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "The request could not be completed");
    return payload;
  }

  async function loadAccess(force = false) {
    if (!force && state.accessPromise) return state.accessPromise;
    state.accessPromise = request("/api/submission-access")
      .then(payload => {
        state.access = payload;
        return payload;
      })
      .catch(error => {
        state.access = {
          configured: false,
          canSubmitResources: false,
          canSubmitSopUpdates: false,
          error: error.message
        };
        return state.access;
      });
    return state.accessPromise;
  }

  function hasAnyAccess() {
    return Boolean(state.access?.canSubmitResources || state.access?.canSubmitSopUpdates);
  }

  function itemAppearsIn(item, placement) {
    const wanted = key(placement);
    return (item.appearsIn || []).some(value => key(value) === wanted);
  }

  function contextItems(category) {
    const model = window.baseModel;
    const items = (model?.items || []).filter(item => item.displayType !== "Request Type");
    if (key(category) === "out of scope") {
      return items.filter(item =>
        key(item.baseSection) === "oos routing" ||
        itemAppearsIn(item, "OOS Routing") ||
        itemAppearsIn(item, "Out of Scope")
      );
    }
    return items.filter(item => itemAppearsIn(item, category));
  }

  function categoryChoices() {
    const titles = (window.baseModel?.requestTypes || []).map(item => item.title);
    if (contextItems("Out of Scope").length) titles.push("Out of Scope");
    return [...new Set(titles)].sort((a, b) => a.localeCompare(b));
  }

  function groupChoices(category) {
    const items = contextItems(category);
    const groups = items
      .filter(item => item.displayType === "Process Group")
      .map(item => ({ value: item.title, title: item.title, recordId: item.recordId || "" }));
    const existing = new Set(groups.map(item => key(item.title)));
    items.flatMap(item => item.parents || []).forEach(parent => {
      if (!existing.has(key(parent))) {
        existing.add(key(parent));
        groups.push({ value: parent, title: parent, recordId: "" });
      }
    });
    return groups.sort((a, b) => a.title.localeCompare(b.title));
  }

  function targetChoices(category, group) {
    const all = contextItems(category).filter(item => item.displayType !== "Process Group");
    if (!group) return all.sort((a, b) => a.title.localeCompare(b.title));
    const wanted = key(group);
    const groupRecord = contextItems(category).find(item => item.displayType === "Process Group" && key(item.title) === wanted);
    const children = all.filter(item =>
      (item.parents || []).some(parent => key(parent) === wanted) ||
      (groupRecord?.recordId && (item.parentIds || []).includes(groupRecord.recordId))
    );
    return (children.length ? children : all).sort((a, b) => a.title.localeCompare(b.title));
  }

  function optionList(items, placeholder, valueKey = "value", titleKey = "title") {
    return `<option value="">${escape(placeholder)}</option>${items.map(item =>
      `<option value="${escape(typeof item === "string" ? item : item[valueKey])}">${escape(typeof item === "string" ? item : item[titleKey])}</option>`
    ).join("")}`;
  }

  function selectorHtml(prefix, required = false) {
    return `
      <section class="workflow-selector" data-workflow-selector="${escape(prefix)}">
        <header>
          <h3>${required ? "Choose the workflow being updated" : "Link this resource to an SOP"}</h3>
          <p>The choices below are populated from active records in the SOP Base.</p>
        </header>
        <div class="workflow-selector__fields">
          <label class="submission-field"><span>Request Type / Section</span><select id="${escape(prefix)}-category" ${required ? "required" : ""}></select></label>
          <label class="submission-field"><span>Workflow Family</span><select id="${escape(prefix)}-group" disabled></select></label>
          <label class="submission-field"><span>Existing Guidance</span><select id="${escape(prefix)}-target" disabled></select></label>
        </div>
        <div class="workflow-path" id="${escape(prefix)}-path"><span>No workflow selected</span></div>
        <div id="${escape(prefix)}-current-preview"></div>
      </section>
    `;
  }

  function editorHtml(id, title, required = false) {
    return `
      <section class="submission-editor">
        <div class="submission-editor__heading">${escape(title)}</div>
        <div class="submission-editor__toolbar" data-editor-toolbar="${escape(id)}">
          <button type="button" data-action="bold" title="Bold">B</button>
          <button type="button" data-action="italic" title="Italic"><em>I</em></button>
          <button type="button" data-action="heading" title="Heading">H</button>
          <button type="button" data-action="bullets" title="Bulleted list">Bullets</button>
          <button type="button" data-action="numbers" title="Numbered list">Numbers</button>
          <button type="button" data-action="link" title="Link">Link</button>
        </div>
        <textarea id="${escape(id)}" ${required ? "required" : ""} placeholder="Write the proposed guidance here..."></textarea>
        <div class="submission-editor__preview" id="${escape(id)}-preview"><p>Start typing to preview the formatted guidance.</p></div>
      </section>
    `;
  }

  function resourceFormHtml() {
    const categories = [...new Set((window.baseModel?.documents || []).map(item => item.category).filter(Boolean))].sort();
    return `
      <section class="submission-panel" id="submission-resource-panel">
        <header><h2>Submit a Resource</h2><p>Add useful documentation without opening or editing the Base.</p></header>
        <form class="submission-form" id="resource-submission-form">
          <div class="submission-grid">
            <label class="submission-field submission-field--wide"><span>Content Name</span><input id="resource-title" maxlength="300" required></label>
            <label class="submission-field submission-field--wide"><span>Content Summary</span><textarea id="resource-summary" maxlength="2000" required></textarea></label>
            <label class="submission-field"><span>Category</span><select id="resource-category">${optionList(categories, "Select a category")}</select><small>Uses the existing Documentation Category options.</small></label>
            <label class="submission-field"><span>Resource URL</span><input id="resource-url" type="url" placeholder="https://" required></label>
            <label class="submission-field submission-field--wide"><span>Search Keywords</span><input id="resource-keywords" placeholder="appeal, age gate, verification"><small>Separate keywords with commas.</small></label>
            ${selectorHtml("resource-workflow", false)}
            ${editorHtml("resource-instruction", "Resource Description / Instructions", true)}
            <label class="submission-upload"><strong>Screenshots</strong><small>Optional. Up to 3 images, 3 MB each.</small><input id="resource-screenshots" type="file" accept="image/*" multiple><span class="submission-upload-list" id="resource-screenshot-list"></span></label>
          </div>
          <div class="submission-form__actions"><span class="submission-status" id="resource-status"></span><button class="submission-submit" type="submit">${UI().icon("send")} Submit Resource</button></div>
        </form>
      </section>
    `;
  }

  function sopFormHtml() {
    return `
      <section class="submission-panel" id="submission-sop-panel">
        <header><h2>Submit an SOP Workflow Update</h2><p>The live SOP will not change until a reviewer verifies and approves this request.</p></header>
        <form class="submission-form" id="sop-submission-form">
          <div class="submission-grid">
            <label class="submission-field"><span>Submission Type</span><select id="sop-submission-type" required><option value="Update Existing SOP">Update Existing SOP</option><option value="Correction">Correction</option><option value="New SOP">New SOP</option></select></label>
            <label class="submission-field"><span>Proposed Content Name</span><input id="sop-title" maxlength="300" required></label>
            ${selectorHtml("sop-workflow", true)}
            <label class="submission-field submission-field--wide"><span>Proposed Content Summary</span><textarea id="sop-summary" maxlength="2000" required></textarea></label>
            ${editorHtml("sop-instruction", "Proposed Instructions", true)}
            ${editorHtml("sop-closing", "Proposed Closing Guidance", false)}
            <label class="submission-field submission-field--wide"><span>Proposed Ticket Tag Display</span><textarea id="sop-ticket-tags" maxlength="3000" placeholder="Tags that should be displayed to the agent"></textarea></label>
            <label class="submission-field submission-field--wide"><span>Reason for Change</span><textarea id="sop-reason" maxlength="5000" required></textarea></label>
            <label class="submission-upload"><strong>Screenshots</strong><small>Optional. Up to 3 images, 3 MB each.</small><input id="sop-screenshots" type="file" accept="image/*" multiple><span class="submission-upload-list" id="sop-screenshot-list"></span></label>
          </div>
          <div class="submission-form__actions"><span class="submission-status" id="sop-status"></span><button class="submission-submit" type="submit">${UI().icon("send")} Submit SOP Update</button></div>
        </form>
      </section>
    `;
  }

  function setStatus(id, message, tone = "") {
    const element = document.getElementById(id);
    if (!element) return;
    element.textContent = message;
    element.className = `submission-status${tone ? ` is-${tone}` : ""}`;
  }

  function selectedText(select) {
    return select?.selectedOptions?.[0]?.textContent?.trim() || "";
  }

  function currentPreview(item) {
    if (!item) return "";
    return `
      <details class="current-guidance-preview">
        <summary>Preview current guidance: ${escape(item.title)}</summary>
        <div>
          ${item.summary ? `<p><strong>Summary:</strong> ${escape(item.summary)}</p>` : ""}
          ${item.instruction ? `<section>${UI().markdown(item.instruction)}</section>` : ""}
        </div>
      </details>
    `;
  }

  function bindWorkflowSelector(prefix) {
    const category = document.getElementById(`${prefix}-category`);
    const group = document.getElementById(`${prefix}-group`);
    const target = document.getElementById(`${prefix}-target`);
    const path = document.getElementById(`${prefix}-path`);
    const preview = document.getElementById(`${prefix}-current-preview`);
    if (!category || !group || !target || !path || !preview) return;

    category.innerHTML = optionList(categoryChoices(), "Select a request type or section");
    group.innerHTML = `<option value="">Select a request type first</option>`;
    target.innerHTML = `<option value="">Select a request type first</option>`;

    function updatePath() {
      const values = [selectedText(category), selectedText(group), selectedText(target)]
        .filter(value => value && !/^Select|^No additional/.test(value));
      path.innerHTML = values.length ? values.map(value => `<span>${escape(value)}</span>`).join("") : `<span>No workflow selected</span>`;
      const item = window.baseModel?.items.find(candidate => candidate.recordId === target.value);
      preview.innerHTML = currentPreview(item);
    }

    category.addEventListener("change", () => {
      const groups = groupChoices(category.value);
      group.disabled = !category.value || !groups.length;
      group.innerHTML = groups.length
        ? optionList(groups, "All workflows in this section")
        : `<option value="">No additional workflow level</option>`;
      const targets = category.value ? targetChoices(category.value, "") : [];
      target.disabled = !targets.length;
      target.innerHTML = optionList(targets.map(item => ({ value: item.recordId, title: item.title })), "Select existing guidance");
      preview.innerHTML = "";
      updatePath();
    });

    group.addEventListener("change", () => {
      const targets = targetChoices(category.value, group.value);
      target.disabled = !targets.length;
      target.innerHTML = optionList(targets.map(item => ({ value: item.recordId, title: item.title })), "Select existing guidance");
      preview.innerHTML = "";
      updatePath();
    });

    target.addEventListener("change", () => {
      updatePath();
      if (prefix === "sop-workflow" && target.value) {
        const title = document.getElementById("sop-title");
        if (title && !title.value.trim()) title.value = selectedText(target);
      }
    });
  }

  function insertMarkup(textarea, action) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.slice(start, end);
    let replacement = selected;
    if (action === "bold") replacement = `**${selected || "bold text"}**`;
    if (action === "italic") replacement = `*${selected || "italic text"}*`;
    if (action === "heading") replacement = `## ${selected || "Heading"}`;
    if (action === "bullets") replacement = (selected || "List item").split("\n").map(line => `- ${line}`).join("\n");
    if (action === "numbers") replacement = (selected || "List item").split("\n").map((line, index) => `${index + 1}. ${line}`).join("\n");
    if (action === "link") {
      const url = window.prompt("Paste the link URL", "https://");
      if (!url) return;
      replacement = `[${selected || "Link text"}](${url})`;
    }
    textarea.setRangeText(replacement, start, end, "end");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.focus();
  }

  function bindEditor(id) {
    const textarea = document.getElementById(id);
    const preview = document.getElementById(`${id}-preview`);
    const toolbar = document.querySelector(`[data-editor-toolbar="${id}"]`);
    if (!textarea || !preview || !toolbar) return;
    const refresh = () => {
      preview.innerHTML = textarea.value.trim()
        ? UI().markdown(textarea.value)
        : `<p>Start typing to preview the formatted guidance.</p>`;
    };
    textarea.addEventListener("input", refresh);
    toolbar.addEventListener("click", event => {
      const button = event.target.closest("button[data-action]");
      if (button) insertMarkup(textarea, button.dataset.action);
    });
  }

  function bindFileList(inputId, listId) {
    const input = document.getElementById(inputId);
    const list = document.getElementById(listId);
    input?.addEventListener("change", () => {
      const files = [...input.files];
      list.innerHTML = files.length ? files.map(file => `<span>${escape(file.name)} - ${Math.ceil(file.size / 1024)} KB</span>`).join("") : "";
    });
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
      reader.onerror = () => reject(new Error(`Unable to read ${file.name}`));
      reader.readAsDataURL(file);
    });
  }

  async function uploadScreenshots(input, kind, statusId) {
    const files = [...(input?.files || [])];
    if (files.length > 3) throw new Error("Please select no more than 3 screenshots");
    const tokens = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      if (!file.type.startsWith("image/")) throw new Error(`${file.name} is not an image`);
      if (file.size > 3 * 1024 * 1024) throw new Error(`${file.name} is larger than 3 MB`);
      setStatus(statusId, `Uploading image ${index + 1} of ${files.length}...`);
      const data = await readFile(file);
      const payload = await request("/api/submission-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, name: file.name, mimeType: file.type, data })
      });
      tokens.push(payload.fileToken);
    }
    return tokens;
  }

  function workflowPath(prefix) {
    return [`${prefix}-category`, `${prefix}-group`, `${prefix}-target`]
      .map(id => selectedText(document.getElementById(id)))
      .filter(value => value && !/^Select|^No additional/.test(value))
      .join(" > ");
  }

  async function submitResource(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      setStatus("resource-status", "Preparing submission...");
      const screenshotTokens = await uploadScreenshots(document.getElementById("resource-screenshots"), "resource", "resource-status");
      const keywords = document.getElementById("resource-keywords").value.split(",").map(value => value.trim()).filter(Boolean);
      await request("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "resource",
          title: document.getElementById("resource-title").value,
          summary: document.getElementById("resource-summary").value,
          category: document.getElementById("resource-category").value,
          url: document.getElementById("resource-url").value,
          keywords,
          instruction: document.getElementById("resource-instruction").value,
          relatedSopId: document.getElementById("resource-workflow-target").value,
          workflowPath: workflowPath("resource-workflow"),
          screenshotTokens
        })
      });
      setStatus("resource-status", "Resource submitted for review.", "success");
      form.reset();
      document.getElementById("resource-instruction").dispatchEvent(new Event("input"));
    } catch (error) {
      setStatus("resource-status", error.message, "error");
    } finally {
      button.disabled = false;
    }
  }

  async function submitSopUpdate(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button[type=submit]");
    const submissionType = document.getElementById("sop-submission-type").value;
    const targetRecordId = document.getElementById("sop-workflow-target").value;
    if (submissionType !== "New SOP" && !targetRecordId) {
      setStatus("sop-status", "Select the existing guidance that this request should update.", "error");
      return;
    }
    button.disabled = true;
    try {
      setStatus("sop-status", "Preparing submission...");
      const screenshotTokens = await uploadScreenshots(document.getElementById("sop-screenshots"), "sop", "sop-status");
      await request("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "sop",
          submissionType,
          title: document.getElementById("sop-title").value,
          summary: document.getElementById("sop-summary").value,
          instruction: document.getElementById("sop-instruction").value,
          closingGuidance: document.getElementById("sop-closing").value,
          ticketTagDisplay: document.getElementById("sop-ticket-tags").value,
          reason: document.getElementById("sop-reason").value,
          workflowPath: workflowPath("sop-workflow"),
          suggestedSopId: targetRecordId,
          screenshotTokens
        })
      });
      setStatus("sop-status", "SOP update submitted for verification.", "success");
      form.reset();
      document.getElementById("sop-instruction").dispatchEvent(new Event("input"));
      document.getElementById("sop-closing").dispatchEvent(new Event("input"));
    } catch (error) {
      setStatus("sop-status", error.message, "error");
    } finally {
      button.disabled = false;
    }
  }

  function activateTab(tab) {
    state.activeTab = tab;
    document.querySelectorAll(".submission-tab").forEach(button => button.classList.toggle("is-active", button.dataset.tab === tab));
    const resource = document.getElementById("submission-resource-panel");
    const sop = document.getElementById("submission-sop-panel");
    if (resource) resource.hidden = tab !== "resource";
    if (sop) sop.hidden = tab !== "sop";
  }

  function bindPage() {
    document.querySelectorAll(".submission-tab").forEach(button => button.addEventListener("click", () => activateTab(button.dataset.tab)));
    bindWorkflowSelector("resource-workflow");
    bindWorkflowSelector("sop-workflow");
    ["resource-instruction", "sop-instruction", "sop-closing"].forEach(bindEditor);
    bindFileList("resource-screenshots", "resource-screenshot-list");
    bindFileList("sop-screenshots", "sop-screenshot-list");
    document.getElementById("resource-submission-form")?.addEventListener("submit", submitResource);
    document.getElementById("sop-submission-form")?.addEventListener("submit", submitSopUpdate);
    UI().refreshIcons();
  }

  function showSubmissionCenter() {
    const target = document.getElementById("content-view");
    if (!target) return;
    window.appState.currentView = "submission";
    window.appState.currentSection = null;
    window.setActiveNavigation?.(null);

    if (!state.access?.configured) {
      target.innerHTML = `<section class="submission-access-message"><h1>Submission Center Setup Required</h1><p>The Submission Access table has not been configured yet.</p><button type="button" class="primary-action" onclick="showHome()">Return Home</button></section>`;
      return;
    }
    if (!hasAnyAccess()) {
      target.innerHTML = `<section class="submission-access-message"><h1>Submission Access Required</h1><p>Your Feishu account is not currently authorized to submit resources or SOP workflow updates.</p><button type="button" class="primary-action" onclick="showHome()">Return Home</button></section>`;
      return;
    }

    const resourceAllowed = state.access.canSubmitResources;
    const sopAllowed = state.access.canSubmitSopUpdates;
    state.activeTab = resourceAllowed ? "resource" : "sop";
    target.innerHTML = `
      <div class="submission-page">
        <nav class="breadcrumbs" aria-label="Breadcrumb"><button type="button" onclick="showHome()">Home</button><span>&rsaquo;</span><span>Submission Center</span></nav>
        <header class="submission-hero"><span class="submission-hero__icon">${UI().icon("file-plus-2")}</span><div><h1>Submission Center</h1><p>Submit formatted resources and proposed SOP workflow changes for review.</p></div></header>
        ${resourceAllowed && sopAllowed ? `<div class="submission-tabs"><button type="button" class="submission-tab" data-tab="resource">${UI().icon("book-plus")} Submit Resource</button><button type="button" class="submission-tab" data-tab="sop">${UI().icon("workflow")} Submit SOP Update</button></div>` : ""}
        ${resourceAllowed ? resourceFormHtml() : ""}
        ${sopAllowed ? sopFormHtml() : ""}
      </div>
    `;
    bindPage();
    activateTab(state.activeTab);
  }

  window.BOTSOP_SUBMISSIONS = {
    loadAccess,
    hasAnyAccess,
    showSubmissionCenter
  };
})();
