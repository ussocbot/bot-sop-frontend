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
          canSubmitUpdates: false,
          error: error.message
        };
        return state.access;
      });
    return state.accessPromise;
  }

  function hasAnyAccess() {
    return Boolean(state.access?.canSubmitResources || state.access?.canSubmitUpdates || state.access?.canSubmitSopUpdates || state.access?.canReviewUpdates);
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

  function updateFormHtml() {
    return `
      <section class="submission-panel" id="submission-update-panel">
        <header><h2>Submit an Update</h2><p>Submit an SOP change, Important News item, or Macro Update for Base review.</p></header>
        <form class="submission-form" id="update-submission-form">
          <div class="submission-grid">
            <div class="submission-type-row">
              <label class="submission-field"><span>Update Type</span><select id="update-type" required><option value="sop" selected>SOP Update</option><option value="important_news">Important News</option><option value="macro_update">Macro Update</option></select><small id="update-type-confirmation">SOP workflow fields are active.</small></label>
              <label class="submission-field" data-sop-only><span>SOP Change Type</span><select id="update-submission-type"><option value="Update Existing SOP">Update Existing SOP</option><option value="Correction">Correction</option><option value="New SOP">New SOP</option></select><small>Choose whether this replaces existing guidance or creates a new SOP.</small></label>
            </div>
            <label class="submission-field submission-field--wide"><span>Proposed Content Name</span><input id="update-title" maxlength="300" required></label>
            <div data-sop-only class="submission-conditional-wide">${selectorHtml("update-workflow", true)}</div>
            <label class="submission-field submission-field--wide"><span>Proposed Content Summary</span><textarea id="update-summary" maxlength="2000" required></textarea></label>
            ${editorHtml("update-instruction", "Proposed Instructions / Message", true)}
            <div data-sop-only class="submission-conditional-wide">${editorHtml("update-closing", "Proposed Closing Guidance", false)}</div>
            <label class="submission-field submission-field--wide" data-sop-only><span>Proposed Ticket Tag Display</span><textarea id="update-ticket-tags" maxlength="3000" placeholder="Tags that should be displayed to the agent"></textarea></label>
            <label class="submission-field" data-announcement-only hidden><span>Publish Date</span><input id="update-publish-date" type="date"></label>
            <label class="submission-field" data-announcement-only hidden><span>Resource Link</span><input id="update-url" type="url" placeholder="https://"></label>
            <label class="submission-field submission-field--wide"><span>Reason for Change</span><textarea id="update-reason" maxlength="5000" required></textarea></label>
            <section class="submission-upload"><strong>Screenshots</strong><small>Optional. Up to 3 images, 3 MB each.</small><div id="update-screenshot-options" class="submission-screenshot-options"><label><input type="radio" name="update-screenshot-action" value="Keep Existing" checked> Keep existing screenshots</label><label><input type="radio" name="update-screenshot-action" value="Remove Existing"> Remove existing screenshots</label></div><input id="update-screenshots" type="file" accept="image/*" multiple><span class="submission-upload-list" id="update-screenshot-list"></span></section>
          </div>
          <div class="submission-form__actions"><span class="submission-status" id="update-status"></span><button class="submission-submit" type="submit">${UI().icon("send")} Submit Update</button></div>
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
      const targets = category.value && !groups.length ? targetChoices(category.value, "") : [];
      target.disabled = !targets.length;
      target.innerHTML = groups.length
        ? `<option value="">Select a workflow family first</option>`
        : optionList(targets.map(item => ({ value: item.recordId, title: item.title })), "Select existing guidance");
      preview.innerHTML = "";
      updatePath();
    });

    group.addEventListener("change", () => {
      const targets = group.value ? targetChoices(category.value, group.value) : [];
      target.disabled = !targets.length;
      target.innerHTML = group.value
        ? optionList(targets.map(item => ({ value: item.recordId, title: item.title })), "Select existing guidance")
        : `<option value="">Select a workflow family first</option>`;
      preview.innerHTML = "";
      updatePath();
    });

    target.addEventListener("change", () => {
      updatePath();
      if (prefix === "update-workflow" && target.value) {
        const title = document.getElementById("update-title");
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
      if (inputId === "update-screenshots" && files.length) {
        const keep = document.querySelector('input[name="update-screenshot-action"][value="Keep Existing"]');
        if (keep) keep.checked = false;
      }
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

  function workflowSelection(prefix) {
    const category = document.getElementById(`${prefix}-category`)?.value || "";
    const group = document.getElementById(`${prefix}-group`)?.value || "";
    const targetRecordId = document.getElementById(`${prefix}-target`)?.value || "";
    const groupRecord = (window.baseModel?.items || []).find(item =>
      item.displayType === "Process Group" && key(item.title) === key(group)
    );
    return {
      path: workflowPath(prefix),
      category,
      group,
      groupRecordId: groupRecord?.recordId || "",
      targetRecordId
    };
  }

  function showSuccess(kind, title, recordId) {
    const target = document.getElementById("content-view");
    if (!target) return;
    target.innerHTML = `
      <section class="submission-success-page">
        <span class="submission-success-page__icon">${UI().icon("circle-check-big")}</span>
        <p class="submission-success-page__eyebrow">Submission Received</p>
        <h1>${escape(title)}</h1>
        <p>Your ${escape(kind)} was saved successfully and is now pending review.</p>
        ${recordId ? `<div class="submission-reference"><span>Reference ID</span><code>${escape(recordId)}</code></div>` : ""}
        <div class="submission-success-page__actions">
          <button type="button" class="primary-action" id="submit-another">Submit Another</button>
          <button type="button" class="secondary-action" onclick="showHome()">Return to BOT SOP</button>
        </div>
      </section>
    `;
    document.getElementById("submit-another")?.addEventListener("click", showSubmissionCenter);
    UI().refreshIcons();
    window.scrollTo({ top: 0, behavior: "smooth" });
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
      const result = await request("/api/submissions", {
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
      showSuccess("resource", document.getElementById("resource-title").value, result.recordId);
    } catch (error) {
      setStatus("resource-status", error.message, "error");
    } finally {
      button.disabled = false;
    }
  }

  async function submitUpdate(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button[type=submit]");
    const updateTypeCode = document.getElementById("update-type").value;
    const updateTypeLabels = { sop: "SOP Update", important_news: "Important News", macro_update: "Macro Update" };
    const updateType = updateTypeLabels[updateTypeCode] || "SOP Update";
    const submissionType = document.getElementById("update-submission-type").value;
    const workflow = workflowSelection("update-workflow");
    if (updateType === "SOP Update" && submissionType !== "New SOP" && !workflow.targetRecordId) {
      setStatus("update-status", "Select the existing guidance that this request should update.", "error");
      return;
    }
    button.disabled = true;
    try {
      setStatus("update-status", "Preparing submission...");
      const screenshotTokens = await uploadScreenshots(document.getElementById("update-screenshots"), "update", "update-status");
      const result = await request("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "update",
          updateType: updateTypeCode,
          submissionType,
          title: document.getElementById("update-title").value,
          summary: document.getElementById("update-summary").value,
          instruction: document.getElementById("update-instruction").value,
          closingGuidance: document.getElementById("update-closing").value,
          ticketTagDisplay: document.getElementById("update-ticket-tags").value,
          reason: document.getElementById("update-reason").value,
          publishDate: document.getElementById("update-publish-date").value,
          url: document.getElementById("update-url").value,
          workflowPath: workflow.path,
          workflowCategory: workflow.category,
          workflowGroup: workflow.group,
          workflowGroupId: workflow.groupRecordId,
          suggestedSopId: workflow.targetRecordId,
          screenshotAction: document.querySelector('input[name="update-screenshot-action"]:checked')?.value || (screenshotTokens.length ? "Replace Existing" : "Keep Existing"),
          screenshotTokens
        })
      });
      showSuccess((result.updateType || updateType).toLowerCase(), document.getElementById("update-title").value, result.recordId);
    } catch (error) {
      setStatus("update-status", error.message, "error");
    } finally {
      button.disabled = false;
    }
  }

  function syncUpdateType() {
    const updateType = document.getElementById("update-type")?.value || "sop";
    const sopMode = updateType === "sop";
    const form = document.getElementById("update-submission-form");
    form?.classList.toggle("is-announcement-mode", !sopMode);
    form?.querySelectorAll("[data-sop-only]").forEach(element => {
      element.hidden = !sopMode;
      element.style.display = sopMode ? "" : "none";
    });
    form?.querySelectorAll("[data-announcement-only]").forEach(element => {
      element.hidden = sopMode;
      element.style.display = sopMode ? "none" : "";
    });
    const confirmation = document.getElementById("update-type-confirmation");
    if (confirmation) confirmation.textContent = sopMode
      ? "SOP workflow fields are active."
      : `${updateType === "important_news" ? "Important News" : "Macro Update"} announcement fields are active.`;
    const category = document.getElementById("update-workflow-category");
    if (category) category.required = sopMode;
    const date = document.getElementById("update-publish-date");
    if (!sopMode && date && !date.value) date.value = new Date().toISOString().slice(0, 10);
    syncScreenshotOptions();
  }

  function syncScreenshotOptions() {
    const type = document.getElementById("update-submission-type")?.value || "Update Existing SOP";
    const options = document.getElementById("update-screenshot-options");
    if (!options) return;
    options.hidden = type === "New SOP" || document.getElementById("update-type")?.value !== "sop";
  }

  function activateTab(tab) {
    state.activeTab = tab;
    document.querySelectorAll(".submission-tab").forEach(button => button.classList.toggle("is-active", button.dataset.tab === tab));
    const resource = document.getElementById("submission-resource-panel");
    const update = document.getElementById("submission-update-panel");
    const review = document.getElementById("submission-review-panel");
    if (resource) resource.hidden = tab !== "resource";
    if (update) update.hidden = tab !== "update";
    if (review) review.hidden = tab !== "review";
  }

  function bindPage() {
    document.querySelectorAll(".submission-tab").forEach(button => button.addEventListener("click", () => activateTab(button.dataset.tab)));
    bindWorkflowSelector("resource-workflow");
    bindWorkflowSelector("update-workflow");
    ["resource-instruction", "update-instruction", "update-closing"].forEach(bindEditor);
    bindFileList("resource-screenshots", "resource-screenshot-list");
    bindFileList("update-screenshots", "update-screenshot-list");
    document.getElementById("resource-submission-form")?.addEventListener("submit", submitResource);
    document.getElementById("update-submission-form")?.addEventListener("submit", submitUpdate);
    document.getElementById("update-type")?.addEventListener("change", syncUpdateType);
    document.getElementById("update-submission-type")?.addEventListener("change", syncScreenshotOptions);
    window.BOTSOP_REVIEWS?.bindPage?.();
    syncUpdateType();
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
      target.innerHTML = `<section class="submission-access-message"><h1>Submission Access Required</h1><p>Your Feishu account is not currently authorized to submit resources or updates.</p><button type="button" class="primary-action" onclick="showHome()">Return Home</button></section>`;
      return;
    }

    const resourceAllowed = state.access.canSubmitResources;
    const updateAllowed = state.access.canSubmitUpdates || state.access.canSubmitSopUpdates;
    const reviewAllowed = state.access.canReviewUpdates;
    state.activeTab = resourceAllowed ? "resource" : (updateAllowed ? "update" : "review");
    const tabs = [
      resourceAllowed ? `<button type="button" class="submission-tab" data-tab="resource">${UI().icon("book-plus")} Submit Resource</button>` : "",
      updateAllowed ? `<button type="button" class="submission-tab" data-tab="update">${UI().icon("workflow")} Submit Update</button>` : "",
      reviewAllowed ? `<button type="button" class="submission-tab" data-tab="review">${UI().icon("clipboard-check")} Review Updates</button>` : ""
    ].filter(Boolean);
    target.innerHTML = `
      <div class="submission-page">
        <nav class="breadcrumbs" aria-label="Breadcrumb"><button type="button" onclick="showHome()">Home</button><span>&rsaquo;</span><span>Submission Center</span></nav>
        <header class="submission-hero"><span class="submission-hero__icon">${UI().icon("file-plus-2")}</span><div><h1>Submission Center</h1><p>Submit formatted resources, SOP changes, Important News, and Macro Updates for review.</p></div></header>
        ${tabs.length > 1 ? `<div class="submission-tabs">${tabs.join("")}</div>` : ""}
        ${resourceAllowed ? resourceFormHtml() : ""}
        ${updateAllowed ? updateFormHtml() : ""}
        ${reviewAllowed ? window.BOTSOP_REVIEWS.panelHtml() : ""}
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
