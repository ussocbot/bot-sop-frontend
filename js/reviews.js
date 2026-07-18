(function installReviewCenter() {
  "use strict";

  const state = {
    requests: [],
    selectedId: "",
    filter: "pending",
    loading: false
  };

  const UI = () => window.BOTSOP_UI;

  function escape(value) {
    return UI().escape(value == null ? "" : String(value));
  }

  function key(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  async function request(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      headers: { Accept: "application/json", ...(options.headers || {}) },
      ...options
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "The review request could not be completed.");
    return payload;
  }

  function panelHtml() {
    return `
      <section class="submission-panel review-panel" id="submission-review-panel" hidden>
        <header><h2>Review Submissions</h2><p>Review, edit, and approve proposed SOP guidance and announcements.</p></header>
        <div id="review-center-content" class="review-center-loading">Loading pending reviews...</div>
      </section>
    `;
  }

  function formatDate(value) {
    const date = new Date(Number(value) || value || 0);
    return Number.isNaN(date.getTime()) || !date.getTime()
      ? "Date unavailable"
      : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  }

  function statusClass(value) {
    const normalized = key(value).replace(/[^a-z0-9]+/g, "-");
    return normalized || "pending";
  }

  function visibleRequests() {
    if (state.filter === "all") return state.requests;
    if (state.filter === "pending") {
      return state.requests.filter(item => ["pending review", "needs changes"].includes(key(item.reviewStatus)));
    }
    if (state.filter === "approved") {
      return state.requests.filter(item => ["approved", "applied", "applying", "failed"].includes(key(item.reviewStatus)) || ["applied", "applying", "failed"].includes(key(item.applyStatus)));
    }
    return state.requests.filter(item => key(item.reviewStatus) === state.filter);
  }

  function queueHtml() {
    const items = visibleRequests();
    return `
      <aside class="review-queue">
        <div class="review-filter-row" role="group" aria-label="Review filters">
          ${[
            ["pending", "Pending"],
            ["approved", "Approved"],
            ["rejected", "Rejected"],
            ["all", "All"]
          ].map(([value, label]) => `<button type="button" data-review-filter="${value}" class="${state.filter === value ? "is-active" : ""}">${label}</button>`).join("")}
        </div>
        <div class="review-queue__items">
          ${items.length ? items.map(item => `
            <button type="button" class="review-queue-item${item.recordId === state.selectedId ? " is-active" : ""}" data-review-id="${escape(item.recordId)}">
              <span class="review-queue-item__top"><strong>${escape(item.title || item.requestName)}</strong><em class="review-status review-status--${statusClass(item.reviewStatus)}">${escape(item.reviewStatus)}</em></span>
              <small>${escape(item.updateType)}${item.submissionType ? ` | ${escape(item.submissionType)}` : ""}</small>
              <small>${escape(formatDate(item.submittedAt))}</small>
            </button>
          `).join("") : `<div class="review-queue-empty"><strong>No requests here</strong><span>Try another status filter.</span></div>`}
        </div>
      </aside>
    `;
  }

  function modelItem(recordId) {
    return (window.baseModel?.items || []).find(item => item.recordId === recordId) || null;
  }

  function queueRowsHtml() {
    const items = visibleRequests();
    return `
      <section class="review-queue review-queue--rows">
        <div class="review-filter-row" role="group" aria-label="Review filters">
          ${[
            ["pending", "Pending"],
            ["approved", "Approved"],
            ["rejected", "Rejected"],
            ["all", "All"]
          ].map(([value, label]) => `<button type="button" data-review-filter="${value}" class="${state.filter === value ? "is-active" : ""}">${label}</button>`).join("")}
        </div>
        <div class="review-queue__items">
          ${items.length ? `<div class="review-queue__header" aria-hidden="true"><span>Submission</span><span>Update Type</span><span>Change Type</span><span>Status</span><span>Submitted</span></div>` : ""}
          ${items.length ? items.map(item => `
            <button type="button" class="review-queue-item${item.recordId === state.selectedId ? " is-active" : ""}" data-review-id="${escape(item.recordId)}">
              <strong class="review-queue-item__title">${escape(item.title || item.requestName)}</strong>
              <small>${escape(item.updateType)}</small>
              <small>${escape(item.submissionType || "Not applicable")}</small>
              <em class="review-status review-status--${statusClass(item.reviewStatus)}">${escape(item.reviewStatus)}</em>
              <small>${escape(formatDate(item.submittedAt))}</small>
            </button>
          `).join("") : `<div class="review-queue-empty"><strong>No submissions here</strong><span>Try another status filter.</span></div>`}
        </div>
      </section>
    `;
  }

  function appearsIn(item, placement) {
    return (item?.appearsIn || []).some(value => key(value) === key(placement));
  }

  function contextItems(category) {
    const items = (window.baseModel?.items || []).filter(item => item.displayType !== "Request Type");
    if (key(category) === "out of scope") {
      return items.filter(item => key(item.baseSection) === "oos routing" || appearsIn(item, "OOS Routing") || appearsIn(item, "Out of Scope"));
    }
    return items.filter(item => appearsIn(item, category));
  }

  function categoryChoices() {
    const values = (window.baseModel?.requestTypes || []).map(item => item.title);
    if (contextItems("Out of Scope").length) values.push("Out of Scope");
    return [...new Set(values)].sort((a, b) => a.localeCompare(b));
  }

  function groupChoices(category) {
    return contextItems(category)
      .filter(item => item.displayType === "Process Group")
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  function targetChoices(category, groupId = "") {
    const candidates = contextItems(category).filter(item => item.displayType !== "Process Group");
    if (!groupId) return candidates.sort((a, b) => a.title.localeCompare(b.title));
    const group = modelItem(groupId);
    if (!group) return [];
    return candidates.filter(item =>
      (item.parentIds || []).includes(group.recordId) ||
      (item.parents || []).some(parent => key(parent) === key(group.title))
    ).sort((a, b) => a.title.localeCompare(b.title));
  }

  function options(items, placeholder, selected = "", value = item => item, label = item => item) {
    return `<option value="">${escape(placeholder)}</option>${items.map(item => {
      const itemValue = String(value(item) || "");
      return `<option value="${escape(itemValue)}"${itemValue === String(selected || "") ? " selected" : ""}>${escape(label(item))}</option>`;
    }).join("")}`;
  }

  function currentGuidanceHtml(item) {
    if (!item) return `<div class="review-current-empty">No existing SOP target is selected.</div>`;
    return `
      <article class="review-current-card">
        <h4>${escape(item.title)}</h4>
        ${item.summary ? `<p><strong>Summary</strong>${escape(item.summary)}</p>` : ""}
        ${item.instruction ? `<div><strong>Guidance</strong>${UI().markdown(item.instruction)}</div>` : ""}
        ${item.closingGuidance ? `<div><strong>Closing Guidance</strong>${UI().markdown(item.closingGuidance)}</div>` : ""}
        ${item.ticketTagDisplay ? `<p><strong>Ticket Tags</strong>${escape(item.ticketTagDisplay)}</p>` : ""}
        ${(item.screenshots || []).length ? `<p><strong>Screenshots</strong>${item.screenshots.length} existing image${item.screenshots.length === 1 ? "" : "s"}</p>` : ""}
      </article>
    `;
  }

  function proposedGuidanceHtml(values) {
    return `
      <article class="review-current-card review-proposed-card">
        <h4>${escape(values.title || "Untitled guidance")}</h4>
        ${values.summary ? `<p><strong>Summary</strong>${escape(values.summary)}</p>` : ""}
        ${values.instruction ? `<div><strong>Guidance</strong>${UI().markdown(values.instruction)}</div>` : ""}
        ${values.closingGuidance ? `<div><strong>Closing Guidance</strong>${UI().markdown(values.closingGuidance)}</div>` : ""}
        ${values.ticketTagDisplay ? `<p><strong>Ticket Tags</strong>${escape(values.ticketTagDisplay)}</p>` : ""}
        ${!values.summary && !values.instruction && !values.closingGuidance && !values.ticketTagDisplay ? `<p>No proposed guidance has been entered.</p>` : ""}
      </article>
    `;
  }

  function relationDetailHtml(item, current) {
    const resources = (window.baseModel?.documents || []).filter(entry => entry.recordId).sort((a, b) => a.title.localeCompare(b.title));
    const tasks = (window.baseModel?.items || []).filter(entry => entry.recordId && !["Request Type", "Tool", "Link"].includes(entry.displayType)).sort((a, b) => a.title.localeCompare(b.title));
    const type = item.relationSuggestionType || "New Link";
    return `
      <section class="review-detail" data-review-record="${escape(item.recordId)}">
        <header class="review-detail__header"><div><span class="review-type-pill">Related Item Suggestion</span><h3>${escape(item.requestName || item.title)}</h3><p>Submitted ${escape(formatDate(item.submittedAt))}${item.submittedBy ? ` by ${escape(item.submittedBy)}` : ""}</p></div><div><em class="review-status review-status--${statusClass(item.reviewStatus)}">${escape(item.reviewStatus)}</em><small>Apply: ${escape(item.applyStatus)}</small></div></header>
        <form id="review-edit-form" class="submission-form">
          <input type="hidden" id="review-update-type" value="Related Item Suggestion">
          <div class="submission-grid">
            <section class="review-comparison"><div><h3>Target SOP</h3>${currentGuidanceHtml(current)}</div><div><h3>Proposed Relationship</h3><article class="review-current-card review-proposed-card"><h4>${escape(item.title)}</h4><p><strong>Type</strong>${escape(type)}</p>${item.url ? `<p><strong>Link</strong>${escape(item.url)}</p>` : ""}<p>${escape(item.reason)}</p></article></div></section>
            <label class="submission-field"><span>Suggestion Type</span><select id="review-relation-type">${["New Link", "Existing Resource", "Existing Task"].map(value => `<option value="${value}"${type === value ? " selected" : ""}>${value}</option>`).join("")}</select></label>
            <label class="submission-field submission-field--wide"><span>Display Name</span><input id="review-title" value="${escape(item.title)}" required></label>
            <label class="submission-field submission-field--wide"><span>URL</span><input id="review-url" type="url" value="${escape(item.url)}" placeholder="https://"></label>
            <label class="submission-field submission-field--wide"><span>Existing Resource</span><select id="review-related-resource">${options(resources, "Select a resource", item.suggestedResourceId, entry => entry.recordId, entry => entry.title)}</select></label>
            <label class="submission-field submission-field--wide"><span>Existing SOP Task</span><select id="review-related-task">${options(tasks, "Select an SOP task", item.suggestedTaskId, entry => entry.recordId, entry => entry.title)}</select></label>
            <label class="submission-field submission-field--wide"><span>Reason for Suggestion</span><textarea id="review-reason">${escape(item.reason)}</textarea></label>
            <label class="submission-field submission-field--wide"><span>Reviewer Notes</span><textarea id="review-notes" placeholder="Required when requesting changes or rejecting">${escape(item.reviewNotes)}</textarea></label>
          </div>
          <div class="review-action-bar"><span id="review-action-status" class="submission-status"></span><button type="button" class="secondary-action" data-review-action="save">Save Changes</button><button type="button" class="review-needs-action" data-review-action="needs_changes">Needs Changes</button><button type="button" class="review-reject-action" data-review-action="reject">Reject</button><button type="button" class="submission-submit review-approve-action" data-review-action="approve">${UI().icon("badge-check")} Approve</button></div>
        </form>
      </section>
    `;
  }

  function screenshotChoiceHtml(item) {
    const choices = [
      ["Keep Existing", "Keep existing screenshots"],
      ["Remove Existing", "Remove existing screenshots"],
      ["Replace Existing", "Replace with submitted/new screenshots"]
    ];
    return `
      <section class="review-screenshot-control" data-sop-review-only>
        <strong>Screenshot handling</strong>
        <div class="review-radio-row">
          ${choices.map(([value, label]) => `<label><input type="radio" name="review-screenshot-action" value="${value}"${item.screenshotAction === value ? " checked" : ""}> ${label}</label>`).join("")}
        </div>
        ${item.screenshots.length ? `<div class="review-existing-files">${item.screenshots.map(file => `<span>${escape(file.name)}</span>`).join("")}</div>` : `<small>No screenshots are attached to this request.</small>`}
        <label class="submission-upload"><strong>Upload replacement screenshots</strong><small>Optional. Up to 3 images, 3 MB each.</small><input id="review-screenshots" type="file" accept="image/*" multiple><span class="submission-upload-list" id="review-screenshot-list"></span></label>
      </section>
    `;
  }

  function detailHtml(item) {
    if (!item) return `<section class="review-detail-empty"><span>${UI().icon("inbox")}</span><h3>Select a request</h3><p>Choose a submission from the review queue.</p></section>`;
    const isSop = item.updateType === "SOP Update";
    const targetId = item.verifiedTargetId || item.suggestedTargetId;
    const current = modelItem(targetId);
    const category = item.proposedRequestType || current?.appearsIn?.[0] || "";
    const parentId = item.proposedParentId || current?.parentIds?.[0] || "";
    const groups = category ? groupChoices(category) : [];
    const targets = category && (!groups.length || parentId) ? targetChoices(category, parentId) : [];
    if (item.updateType === "Related Item Suggestion") return relationDetailHtml(item, current);
    return `
      <section class="review-detail" data-review-record="${escape(item.recordId)}">
        <header class="review-detail__header">
          <div><span class="review-type-pill">${escape(item.updateType)}</span><h3>${escape(item.requestName || item.title)}</h3><p>Submitted ${escape(formatDate(item.submittedAt))}${item.submittedBy ? ` by ${escape(item.submittedBy)}` : ""}</p></div>
          <div><em class="review-status review-status--${statusClass(item.reviewStatus)}">${escape(item.reviewStatus)}</em><small>Apply: ${escape(item.applyStatus)}</small></div>
        </header>
        ${item.applyError ? `<div class="review-error-banner"><strong>Apply error</strong>${escape(item.applyError)}</div>` : ""}
        <form id="review-edit-form" class="submission-form">
          <input type="hidden" id="review-update-type" value="${escape(item.updateType)}">
          <div class="submission-grid">
            ${isSop ? `
              <label class="submission-field"><span>SOP Change Type</span><select id="review-submission-type">
                ${["New SOP", "Update Existing SOP", "Correction"].map(value => `<option value="${value}"${item.submissionType === value ? " selected" : ""}>${value}</option>`).join("")}
              </select></label>
              <div class="workflow-selector">
                <header><h3>Verified workflow and replacement target</h3><p>Each level becomes available after the preceding level is selected.</p></header>
                <div class="workflow-selector__fields">
                  <label class="submission-field"><span>Request Type / Section</span><select id="review-category">${options(categoryChoices(), "Select a request type", category)}</select></label>
                  <label class="submission-field"><span>Workflow Family</span><select id="review-group"${!groups.length ? " disabled" : ""}>${groups.length ? options(groups, "Select a workflow family", parentId, entry => entry.recordId, entry => entry.title) : `<option value="">No workflow family required</option>`}</select></label>
                  <label class="submission-field"><span>Existing Guidance</span><select id="review-target"${groups.length && !parentId ? " disabled" : ""}>${options(targets, groups.length && !parentId ? "Select a workflow family first" : "Select existing guidance", targetId, entry => entry.recordId, entry => entry.title)}</select></label>
                </div>
              </div>
            ` : `
              <label class="submission-field"><span>Publish Date</span><input id="review-publish-date" type="date" value="${escape(item.publishDate)}"></label>
              <label class="submission-field"><span>Resource Link</span><input id="review-url" type="url" value="${escape(item.url)}" placeholder="https://"></label>
            `}
            <label class="submission-field submission-field--wide"><span>Proposed Content Name</span><input id="review-title" value="${escape(item.title)}" required></label>
            <label class="submission-field submission-field--wide"><span>Proposed Content Summary</span><textarea id="review-summary">${escape(item.summary)}</textarea></label>
            <section class="review-comparison">
              <div><h3>Current Guidance</h3><div id="review-current-guidance">${currentGuidanceHtml(current)}</div></div>
              <div><h3>Proposed Guidance</h3><label class="submission-field"><span>Guidance / Message</span><textarea id="review-instruction" class="review-large-text">${escape(item.instruction)}</textarea></label><div id="review-proposed-guidance">${proposedGuidanceHtml(item)}</div></div>
            </section>
            ${isSop ? `
              <label class="submission-field submission-field--wide"><span>Closing Guidance</span><textarea id="review-closing">${escape(item.closingGuidance)}</textarea></label>
              <label class="submission-field submission-field--wide"><span>Ticket Tag Display</span><textarea id="review-ticket-tags">${escape(item.ticketTagDisplay || "Tag 1 | Tag 2 | Tag 3")}</textarea></label>
              ${screenshotChoiceHtml(item)}
            ` : ""}
            <label class="submission-field submission-field--wide"><span>Reason for Change</span><textarea id="review-reason">${escape(item.reason)}</textarea></label>
            <label class="submission-field submission-field--wide"><span>Reviewer Notes</span><textarea id="review-notes" placeholder="Required when requesting changes or rejecting">${escape(item.reviewNotes)}</textarea></label>
          </div>
          <div class="review-action-bar">
            <span id="review-action-status" class="submission-status"></span>
            <label class="review-notification-toggle"><input id="review-send-notification" type="checkbox"${item.sendNotification ? " checked" : ""}> Send notification message after approval</label>
            <button type="button" class="secondary-action" data-review-action="save">Save Changes</button>
            <button type="button" class="review-needs-action" data-review-action="needs_changes">Needs Changes</button>
            <button type="button" class="review-reject-action" data-review-action="reject">Reject</button>
            <button type="button" class="submission-submit review-approve-action" data-review-action="approve">${UI().icon("badge-check")} Approve</button>
          </div>
        </form>
      </section>
    `;
  }

  function render() {
    const target = document.getElementById("review-center-content");
    if (!target) return;
    const visible = visibleRequests();
    if (!state.selectedId || !state.requests.some(item => item.recordId === state.selectedId)) {
      state.selectedId = visible[0]?.recordId || state.requests[0]?.recordId || "";
    }
    const selected = state.requests.find(item => item.recordId === state.selectedId) || null;
    target.className = "review-center";
    target.innerHTML = `${queueRowsHtml()}<main class="review-detail-shell">${detailHtml(selected)}</main>`;
    bindRenderedPage(selected);
    UI().refreshIcons();
  }

  function setStatus(message, tone = "") {
    const element = document.getElementById("review-action-status");
    if (!element) return;
    element.textContent = message;
    element.className = `submission-status${tone ? ` is-${tone}` : ""}`;
  }

  function bindReviewWorkflow(item) {
    const category = document.getElementById("review-category");
    const group = document.getElementById("review-group");
    const target = document.getElementById("review-target");
    const current = document.getElementById("review-current-guidance");
    if (!category || !group || !target || !current) return;

    category.addEventListener("change", () => {
      const groups = groupChoices(category.value);
      group.innerHTML = groups.length
        ? options(groups, "Select a workflow family", "", entry => entry.recordId, entry => entry.title)
        : `<option value="">No workflow family required</option>`;
      group.disabled = !groups.length;
      const targets = groups.length ? [] : targetChoices(category.value);
      target.innerHTML = options(targets, groups.length ? "Select a workflow family first" : "Select existing guidance", "", entry => entry.recordId, entry => entry.title);
      target.disabled = Boolean(groups.length);
      current.innerHTML = currentGuidanceHtml(null);
    });

    group.addEventListener("change", () => {
      const targets = group.value ? targetChoices(category.value, group.value) : [];
      target.innerHTML = options(targets, "Select existing guidance", "", entry => entry.recordId, entry => entry.title);
      target.disabled = !group.value;
      current.innerHTML = currentGuidanceHtml(null);
    });

    target.addEventListener("change", () => {
      current.innerHTML = currentGuidanceHtml(modelItem(target.value));
    });
  }

  function bindRenderedPage(selected) {
    document.querySelectorAll("[data-review-filter]").forEach(button => button.addEventListener("click", () => {
      state.filter = button.dataset.reviewFilter;
      state.selectedId = "";
      render();
    }));
    document.querySelectorAll("[data-review-id]").forEach(button => button.addEventListener("click", () => {
      state.selectedId = button.dataset.reviewId;
      render();
    }));
    if (!selected) return;
    bindReviewWorkflow(selected);
    const proposedPreview = document.getElementById("review-proposed-guidance");
    const refreshProposedPreview = () => {
      if (!proposedPreview) return;
      proposedPreview.innerHTML = proposedGuidanceHtml({
        title: document.getElementById("review-title")?.value || "",
        summary: document.getElementById("review-summary")?.value || "",
        instruction: document.getElementById("review-instruction")?.value || "",
        closingGuidance: document.getElementById("review-closing")?.value || "",
        ticketTagDisplay: document.getElementById("review-ticket-tags")?.value || ""
      });
    };
    ["review-title", "review-summary", "review-instruction", "review-closing", "review-ticket-tags"].forEach(id => {
      document.getElementById(id)?.addEventListener("input", refreshProposedPreview);
    });
    const input = document.getElementById("review-screenshots");
    const list = document.getElementById("review-screenshot-list");
    input?.addEventListener("change", () => {
      const files = [...input.files];
      if (files.length) {
        const replace = document.querySelector('input[name="review-screenshot-action"][value="Replace Existing"]');
        if (replace) replace.checked = true;
      }
      if (list) list.innerHTML = files.map(file => `<span>${escape(file.name)} | ${Math.ceil(file.size / 1024)} KB</span>`).join("");
    });
    document.querySelectorAll("[data-review-action]").forEach(button => button.addEventListener("click", () => saveReview(button.dataset.reviewAction)));
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
      reader.onerror = () => reject(new Error(`Unable to read ${file.name}`));
      reader.readAsDataURL(file);
    });
  }

  async function uploadReviewScreenshots() {
    const input = document.getElementById("review-screenshots");
    const files = [...(input?.files || [])];
    if (!files.length) return [];
    if (files.length > 3) throw new Error("Please select no more than 3 screenshots.");
    const tokens = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      if (!file.type.startsWith("image/")) throw new Error(`${file.name} is not an image.`);
      if (file.size > 3 * 1024 * 1024) throw new Error(`${file.name} is larger than 3 MB.`);
      setStatus(`Uploading image ${index + 1} of ${files.length}...`);
      const result = await request("/api/submission-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "review", name: file.name, mimeType: file.type, data: await readFile(file) })
      });
      tokens.push(result.fileToken);
    }
    return tokens;
  }

  async function saveReview(action) {
    const item = state.requests.find(entry => entry.recordId === state.selectedId);
    if (!item) return;
    const notes = document.getElementById("review-notes")?.value || "";
    if (["needs_changes", "reject"].includes(action) && !notes.trim()) {
      setStatus("Add reviewer notes before requesting changes or rejecting.", "error");
      return;
    }
    const sendNotification = Boolean(document.getElementById("review-send-notification")?.checked);
    if (action === "approve" && !window.confirm(sendNotification
      ? "Approve this submission and send the notification message?"
      : "Approve this submission without sending a notification message?")) return;
    const buttons = [...document.querySelectorAll("[data-review-action]")];
    buttons.forEach(button => { button.disabled = true; });
    try {
      setStatus(action === "approve" ? "Saving final edits and approving..." : "Saving review...");
      const uploadedTokens = await uploadReviewScreenshots();
      const screenshotAction = document.querySelector('input[name="review-screenshot-action"]:checked')?.value || item.screenshotAction || "Keep Existing";
      const existingTokens = (item.screenshots || []).map(file => file.fileToken).filter(Boolean);
      const screenshotTokens = uploadedTokens.length ? uploadedTokens : existingTokens;
      await request("/api/review-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordId: item.recordId,
          action,
          values: {
            updateType: item.updateType,
            submissionType: document.getElementById("review-submission-type")?.value || item.submissionType,
            proposedRequestType: document.getElementById("review-category")?.value || item.proposedRequestType,
            proposedParentId: document.getElementById("review-group")?.value || "",
            verifiedTargetId: document.getElementById("review-target")?.value || "",
            title: document.getElementById("review-title")?.value || "",
            summary: document.getElementById("review-summary")?.value || "",
            instruction: document.getElementById("review-instruction")?.value || "",
            closingGuidance: document.getElementById("review-closing")?.value || "",
            ticketTagDisplay: document.getElementById("review-ticket-tags")?.value || "",
            reason: document.getElementById("review-reason")?.value || "",
            reviewNotes: notes,
            publishDate: document.getElementById("review-publish-date")?.value || item.publishDate,
            url: document.getElementById("review-url")?.value || item.url,
            relationSuggestionType: document.getElementById("review-relation-type")?.value || item.relationSuggestionType,
            suggestedResourceId: document.getElementById("review-related-resource")?.value || item.suggestedResourceId,
            suggestedTaskId: document.getElementById("review-related-task")?.value || item.suggestedTaskId,
            sendNotification,
            screenshotAction,
            screenshotTokens
          }
        })
      });
      window.BOTSOP_DATA_CACHE?.clear?.();
      setStatus(action === "approve" ? (sendNotification ? "Approved. The update can apply and the notification workflow can run." : "Approved without a notification message.") : "Review saved.", "success");
      await loadRequests(true);
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      buttons.forEach(button => { button.disabled = false; });
    }
  }

  async function loadRequests(preserveSelection = false) {
    const target = document.getElementById("review-center-content");
    if (target) {
      target.className = "review-center-loading";
      target.textContent = "Loading review requests...";
    }
    try {
      const payload = await request("/api/review-requests");
      state.requests = payload.requests || [];
      if (!preserveSelection) state.selectedId = visibleRequests()[0]?.recordId || state.requests[0]?.recordId || "";
      render();
    } catch (error) {
      if (target) target.innerHTML = `<section class="submission-access-message"><h3>Unable to load reviews</h3><p>${escape(error.message)}</p><button type="button" class="primary-action" id="retry-reviews">Try Again</button></section>`;
      document.getElementById("retry-reviews")?.addEventListener("click", () => loadRequests(preserveSelection));
    }
  }

  function bindPage() {
    loadRequests();
  }

  window.BOTSOP_REVIEWS = { panelHtml, bindPage, loadRequests };
})();
