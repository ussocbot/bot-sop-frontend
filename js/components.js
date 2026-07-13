function getBreadcrumb(recordId) {
    const breadcrumb = [];

    let current = window.navigationItems.find(
        item => item.id === recordId
    );

    while (current) {
        breadcrumb.unshift(current);

        if (current.parent === null) {
            break;
        }

        current = window.navigationItems.find(
            item => item.id === current.parent
        );
    }

    return breadcrumb;
}

function getTopLevelParentId(record) {
    let currentRecord = record;

    while (currentRecord.parent !== null) {
        const parentRecord = window.navigationItems.find(
            item => item.id === currentRecord.parent
        );

        if (!parentRecord) {
            break;
        }

        currentRecord = parentRecord;
    }

    return currentRecord.id;
}

function getTopLevelIcon(recordId) {
    const icons = {
        "account": "user-round",
        "age-appeals": "badge-check",
        "audio": "music-2",
        "video": "video",
        "comment": "message-circle",
        "dm": "send",
        "gbs-ecommerce": "shopping-bag",
        "ags": "clipboard-list",
        "ert-legal": "scale",
        "ecc-workflow": "list-checks",
        "live": "radio",
        "abnormal-account-issues": "triangle-alert"
    };

    return icons[recordId] || "folder";
}

function getCategoryChildIcon(record) {
    const topLevelId = getTopLevelParentId(record);

    const icons = {
        "account": "user-round-cog",
        "age-appeals": "badge-help",
        "audio": "file-music",
        "video": "file-video",
        "comment": "message-square-text",
        "dm": "messages-square",
        "gbs-ecommerce": "package",
        "ags": "clipboard-check",
        "ert-legal": "file-warning",
        "ecc-workflow": "workflow",
        "live": "radio-tower",
        "abnormal-account-issues": "shield-alert"
    };

    return icons[topLevelId] || "file-text";
}

function getRecordIcon(record) {
    if (record.parent === null) {
        return getTopLevelIcon(record.id);
    }

    return getCategoryChildIcon(record);
}

function refreshIcons() {
    if (window.lucide) {
        window.lucide.createIcons();
    }
}
function getRecentlyViewedIds() {
    try {
        const savedIds = window.localStorage.getItem(
            "bot-sop-recently-viewed"
        );

        return savedIds
            ? JSON.parse(savedIds)
            : [];
    } catch (error) {
        console.error(
            "Unable to load recently viewed Entries:",
            error
        );

        return [];
    }
}

function saveRecentlyViewed(recordId) {
    const existingIds = getRecentlyViewedIds();

    const updatedIds = [
        recordId,
        ...existingIds.filter(id => id !== recordId)
    ].slice(0, 4);

    try {
        window.localStorage.setItem(
            "bot-sop-recently-viewed",
            JSON.stringify(updatedIds)
        );
    } catch (error) {
        console.error(
            "Unable to save recently viewed Entries:",
            error
        );
    }
}

function buildRecentlyViewedWidget() {
    const recentlyViewedItems = getRecentlyViewedIds()
        .map(recordId =>
            window.navigationItems.find(
                item => item.id === recordId
            )
        )
        .filter(Boolean);

    if (recentlyViewedItems.length === 0) {
        return `
            <section class="sidebar-widget">
                <div class="widget-header">
                    <h3>Recently Viewed</h3>
                </div>

                <div class="recently-viewed-empty">
                    <i data-lucide="history"></i>

                    <p>
                        Entries you open will appear here.
                    </p>
                </div>
            </section>
        `;
    }

    return `
        <section class="sidebar-widget">

            <div class="widget-header">
                <h3>Recently Viewed</h3>

                <button
                    class="widget-link"
                    type="button"
                    onclick="clearRecentlyViewed()"
                >
                    Clear
                </button>
            </div>

            <div class="recently-viewed-widget__items">

                ${recentlyViewedItems.map(item => `
                    <button
                        class="recently-viewed-widget__item"
                        type="button"
                        onclick="navigate('${item.id}')"
                    >
                        <span class="recently-viewed-widget__icon">
                            <i data-lucide="${getRecordIcon(item)}"></i>
                        </span>

                        <span class="recently-viewed-widget__text">
                            <strong>${item.title}</strong>

                            <small>
                                ${item.description || "Open Entry"}
                            </small>
                        </span>

                        <i
                            class="recently-viewed-widget__arrow"
                            data-lucide="chevron-right"
                        ></i>
                    </button>
                `).join("")}

            </div>

        </section>
    `;
}

function renderRecentlyViewedWidget() {
    const widgetContainer = document.getElementById(
        "recently-viewed-widget"
    );

    if (!widgetContainer) {
        return;
    }

    widgetContainer.innerHTML =
        buildRecentlyViewedWidget();

    refreshIcons();
}

function clearRecentlyViewed() {
    try {
        window.localStorage.removeItem(
            "bot-sop-recently-viewed"
        );
    } catch (error) {
        console.error(
            "Unable to clear recently viewed Entries:",
            error
        );
    }

    renderRecentlyViewedWidget();
}
function buildRequestCard(item, highlightedDescription = null) {
    const iconName = getRecordIcon(item);

    return `
        <button
            class="request-card"
            type="button"
            onclick="navigate('${item.id}')"
        >
            <span
                class="request-card__icon"
                aria-hidden="true"
            >
                <i data-lucide="${iconName}"></i>
            </span>

            <span class="request-card__text">
                <strong>${item.title}</strong>
                <small>
    ${highlightedDescription || item.description || ""}
</small>
            </span>

            <span
                class="request-card__arrow"
                aria-hidden="true"
            >
                →
            </span>
        </button>
    `;
}

function buildInfoPanel({
    id,
    icon,
    title,
    subtitle,
    items
}) {
    return `
        <section
            id="${id}"
            class="info-panel collapsed"
        >
            <button
                class="info-panel__header"
                type="button"
                onclick="toggleInfoPanel('${id}')"
                aria-expanded="false"
            >
                <span class="info-panel__title">
                    <span
                        class="info-panel__icon"
                        aria-hidden="true"
                    >
                        <i data-lucide="${icon}"></i>
                    </span>

                    <span>
                        <strong>${title}</strong>
                        <small>${subtitle}</small>
                    </span>
                </span>

                <i
                    class="info-panel__chevron"
                    data-lucide="chevron-down"
                ></i>
            </button>

            <div
                class="info-panel__content"
                hidden
            >
                <ul>
                    ${items.map(item => `
                        <li>${item}</li>
                    `).join("")}
                </ul>
            </div>
        </section>
    `;
}

function buildGlobalInfoPanels() {
    return `
        <div class="home-info-panels">

            ${buildInfoPanel({
                id: "bot-expectations",
                icon: "clipboard-check",
                title: "BOT Expectations",
                subtitle: "Core expectations for reviewing and resolving BOT requests.",
                items: [
                    "Follow the approved BOT SOP guidance for the request type.",
                    "Confirm the correct review path before taking action.",
                    "Document the decision clearly and completely.",
                    "Use the appropriate escalation or routing process when needed."
                ]
            })}

            ${buildInfoPanel({
                id: "best-practices",
                icon: "sparkles",
                title: "Best Practices",
                subtitle: "Recommended habits that improve review quality and consistency.",
                items: [
                    "Review the full context before making a decision.",
                    "Check related guidance when handling uncommon scenarios.",
                    "Document escalations clearly for the next reviewer.",
                    "Take advantage of linked resources when available."
                ]
            })}

        </div>
    `;
}

function buildEntryOverviewCard({
    icon,
    label,
    value
}) {
    return `
        <div class="entry-overview-card">

            <div class="entry-overview-icon">
                <i data-lucide="${icon}"></i>
            </div>

            <div class="entry-overview-content">
                <span class="entry-overview-label">
                    ${label}
                </span>

                <strong class="entry-overview-value">
                    ${value}
                </strong>
            </div>

        </div>
    `;
}

function buildExpandableEntrySection({
    id,
    icon,
    eyebrow,
    title,
    description,
    content
}) {
    const isOpenByDefault = id === "review-guidance";

    return `
        <section
            id="${id}"
            class="entry-section ${
                isOpenByDefault
                    ? ""
                    : "collapsed"
            }"
        >
            <button
                class="entry-section__header"
                type="button"
                onclick="toggleEntrySection('${id}')"
                aria-expanded="${isOpenByDefault}"
            >
                <span
                    class="entry-section__icon"
                    aria-hidden="true"
                >
                    <i data-lucide="${icon}"></i>
                </span>

                <span class="entry-section__heading">
                    <span class="entry-section__eyebrow">
                        ${eyebrow}
                    </span>

                    <strong>${title}</strong>

                    <small>${description}</small>
                </span>

                <span class="entry-section__action">
                    <span class="entry-section__action-label">
                        ${
                            isOpenByDefault
                                ? "Close Guidance"
                                : "Open Guidance"
                        }
                    </span>

                    <i
                        class="entry-section__chevron"
                        data-lucide="${
                            isOpenByDefault
                                ? "chevron-up"
                                : "chevron-down"
                        }"
                    ></i>
                </span>
            </button>

            <div
                class="entry-section__content"
                ${isOpenByDefault ? "" : "hidden"}
            >
                ${content}
            </div>
        </section>
    `;
}

function toggleInfoPanel(panelId) {
    const panel = document.getElementById(panelId);

    if (!panel) {
        return;
    }

    const content = panel.querySelector(
        ".info-panel__content"
    );

    const button = panel.querySelector(
        ".info-panel__header"
    );

    const chevron = panel.querySelector(
        ".info-panel__chevron"
    );

    if (!content || !button || !chevron) {
        return;
    }

    const isCollapsed = panel.classList.toggle(
        "collapsed"
    );

    content.hidden = isCollapsed;

    button.setAttribute(
        "aria-expanded",
        String(!isCollapsed)
    );

    chevron.setAttribute(
        "data-lucide",
        isCollapsed
            ? "chevron-down"
            : "chevron-up"
    );

    refreshIcons();
}

function openInfoPanel(panelId) {
    const panel = document.getElementById(panelId);

    if (!panel) {
        return;
    }

    const content = panel.querySelector(
        ".info-panel__content"
    );

    const button = panel.querySelector(
        ".info-panel__header"
    );

    const chevron = panel.querySelector(
        ".info-panel__chevron"
    );

    if (!content || !button || !chevron) {
        return;
    }

    panel.classList.remove("collapsed");

    content.hidden = false;

    button.setAttribute(
        "aria-expanded",
        "true"
    );

    chevron.setAttribute(
        "data-lucide",
        "chevron-up"
    );

    refreshIcons();

    panel.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

function toggleEntrySection(sectionId) {
    const section = document.getElementById(sectionId);

    if (!section) {
        return;
    }

    const content = section.querySelector(
        ".entry-section__content"
    );

    const button = section.querySelector(
        ".entry-section__header"
    );

    const chevron = section.querySelector(
        ".entry-section__chevron"
    );

    const actionLabel = section.querySelector(
        ".entry-section__action-label"
    );

    if (
        !content ||
        !button ||
        !chevron ||
        !actionLabel
    ) {
        return;
    }

    const isCollapsed = section.classList.toggle(
        "collapsed"
    );

    content.hidden = isCollapsed;

    button.setAttribute(
        "aria-expanded",
        String(!isCollapsed)
    );

    chevron.setAttribute(
        "data-lucide",
        isCollapsed
            ? "chevron-down"
            : "chevron-up"
    );

    actionLabel.textContent = isCollapsed
        ? "Open Guidance"
        : "Close Guidance";

    refreshIcons();
}

function showHome() {
    const contentView = document.getElementById(
        "content-view"
    );

    if (!contentView) {
        return;
    }

    const homeItems = window.navigationItems
        .filter(item => item.parent === null)
        .sort((a, b) => a.sortOrder - b.sortOrder);

    contentView.innerHTML = `
       ${buildGlobalInfoPanels()}

<section class="content-header">
            <h2>Review by Request Type</h2>
            <p>Select a request type to begin.</p>
        </section>

        <section class="request-grid">
            ${homeItems.map(buildRequestCard).join("")}
        </section>
    `;

    refreshIcons();
}
function highlightSearchMatch(text, query) {
    if (!text || !query) {
        return text;
    }

    const escapedQuery = query.replace(
        /[-\/\\^$*+?.()|[\]{}]/g,
        "\\$&"
    );

    const regex = new RegExp(
        `(${escapedQuery})`,
        "ig"
    );

    return text.replace(
        regex,
        "<mark>$1</mark>"
    );
}
function showSearchResults(searchQuery) {
    const contentView = document.getElementById(
        "content-view"
    );

    if (!contentView) {
        return;
    }

    const normalizedQuery = searchQuery
        .trim()
        .toLowerCase();

    if (!normalizedQuery) {
        showHome();
        return;
    }

    const matchingItems = window.navigationItems
        .filter(item => {
            const searchableText = [
                item.title,
                item.description,
                ...(item.appearsIn || [])
            ]
                .join(" ")
                .toLowerCase();

            return searchableText.includes(
                normalizedQuery
            );
        })
        .sort((a, b) => {
            const titleA = a.title.toLowerCase();
            const titleB = b.title.toLowerCase();

            const aStartsWithQuery =
                titleA.startsWith(normalizedQuery);

            const bStartsWithQuery =
                titleB.startsWith(normalizedQuery);

            if (
                aStartsWithQuery &&
                !bStartsWithQuery
            ) {
                return -1;
            }

            if (
                !aStartsWithQuery &&
                bStartsWithQuery
            ) {
                return 1;
            }

            return titleA.localeCompare(titleB);
        });

    contentView.innerHTML = `
        ${buildGlobalInfoPanels()}

        <section class="content-header">
            <h2>Search Results</h2>

            <p>
                ${matchingItems.length}
                ${
                    matchingItems.length === 1
                        ? "result"
                        : "results"
                }
                for “${searchQuery.trim()}”
            </p>
        </section>

        ${
            matchingItems.length > 0
                ? `
                    <section class="request-grid">
                       ${matchingItems.map(item =>
    buildRequestCard(
        item,
        highlightSearchMatch(
            item.description,
            normalizedQuery
        )
    )
).join("")}
                    </section>
                `
                : `
                    <section class="search-empty-state">
                        <span
                            class="search-empty-state__icon"
                            aria-hidden="true"
                        >
                            <i data-lucide="search-x"></i>
                        </span>

                        <h3>No matching Entries found</h3>

                        <p>
                            Try searching for a request type,
                            workflow, or keyword.
                        </p>
                    </section>
                `
        }
    `;

    refreshIcons();
}

function showSection(sectionId) {
    const contentView = document.getElementById(
        "content-view"
    );

    if (!contentView) {
        return;
    }

    const currentSection = window.navigationItems.find(
        item => item.id === sectionId
    );

    if (!currentSection) {
        console.error(`Section not found: ${sectionId}`);
        return;
    }

    const sectionItems = window.navigationItems
        .filter(item => item.parent === sectionId)
        .sort((a, b) => a.sortOrder - b.sortOrder);

    contentView.innerHTML = `
        ${buildGlobalInfoPanels()}

        <div class="section-view">
            <div class="section-toolbar">
                <button
                    class="back-button"
                    type="button"
                    onclick="goBack()"
                >
                    ← Back
                </button>

                <nav
                    class="breadcrumb"
                    aria-label="Breadcrumb"
                >
                    <span>Home</span>

                    ${getBreadcrumb(currentSection.id).map(item => `
                        <span aria-hidden="true">›</span>
                        <span>${item.title}</span>
                    `).join("")}
                </nav>
            </div>

            <div class="content-header">
                <h2>${currentSection.title}</h2>
                <p>Select a workflow to continue.</p>
            </div>

            <div class="request-grid">
                ${sectionItems.map(buildRequestCard).join("")}
            </div>
        </div>
    `;

    refreshIcons();
}

function showRecord(recordId) {
    const contentView = document.getElementById(
        "content-view"
    );

    if (!contentView) {
        return;
    }

    const record = window.navigationItems.find(
        item => item.id === recordId
    );

    if (!record) {
        console.error(`Record not found: ${recordId}`);
        return;
    }
    saveRecentlyViewed(record.id);
    renderRecentlyViewedWidget();
const topLevelRecord = window.navigationItems.find(
    item => item.id === getTopLevelParentId(record)
);

const requestType =
    topLevelRecord?.title || "Not specified";

const status =
    record.status || "Active";

const workflow =
    record.workflow || "BOT";

const resourceCount =
    record.resourceCount || 0;

const lastUpdated =
    record.lastUpdated || "Not available";
    contentView.innerHTML = `
        ${buildGlobalInfoPanels()}

        <div class="entry-page">

            <div class="section-toolbar">
                <button
                    class="back-button"
                    type="button"
                    onclick="goBack()"
                >
                    ← Back
                </button>

                <nav
                    class="breadcrumb"
                    aria-label="Breadcrumb"
                >
                    <span>Home</span>

                    ${getBreadcrumb(record.id).map(item => `
                        <span aria-hidden="true">›</span>
                        <span>${item.title}</span>
                    `).join("")}
                </nav>
            </div>

            <header class="entry-header">

                <div>
                    <h1>${record.title}</h1>

                    <p>
                        ${record.description || ""}
                    </p>
                </div>

                <div class="entry-meta">
    <span class="entry-status ${status.toLowerCase()}">
        ${status}
    </span>

    <span class="entry-updated">
        Updated ${lastUpdated}
    </span>
                </div>

            </header>

            <section class="entry-overview">

${buildEntryOverviewCard({
    icon: "folder",
    label: "Request Type",
    value: requestType
})}

${buildEntryOverviewCard({
    icon: "workflow",
    label: "Workflow",
    value: workflow
})}

${buildEntryOverviewCard({
    icon: "calendar-clock",
    label: "Last Updated",
    value: lastUpdated
})}

${buildEntryOverviewCard({
    icon: "link",
    label: "Resources",
    value: `${resourceCount} Linked`
})}

            </section>

            ${buildExpandableEntrySection({
                id: "review-guidance",
                icon: "clipboard-list",
                eyebrow: "Review Guidance",
                title: "Confirmed ATO Review",
                description: "Follow the approved review path for confirmed account takeover cases.",
                content: `
                    <ol class="review-guidance-steps">
                        <li>
                            Review the request and confirm the reported account issue.
                        </li>

                        <li>
                            Check for indicators that support a confirmed account takeover.
                        </li>

                        <li>
                            Validate the available account ownership information.
                        </li>

                        <li>
                            Follow the approved BOT guidance and document the decision.
                        </li>

                        <li>
                            Use the appropriate escalation path when additional review is required.
                        </li>
                    </ol>
                `
            })}

            ${buildExpandableEntrySection({
                id: "related-resources",
                icon: "link",
                eyebrow: "Supporting Information",
                title: "Related Resources",
                description: "Open supporting tools and reference materials for this review.",
                content: `
                    <div class="related-resource-list">

                        <a
                            href="#"
                            class="related-resource-item"
                        >
                            <span class="related-resource-item__icon">
                                <i data-lucide="book-open"></i>
                            </span>

                            <span class="related-resource-item__text">
                                <strong>BOT SOP</strong>
                                <small>
                                    Primary operational guidance
                                </small>
                            </span>

                            <i
                                class="related-resource-item__arrow"
                                data-lucide="arrow-up-right"
                            ></i>
                        </a>

                        <a
                            href="#"
                            class="related-resource-item"
                        >
                            <span class="related-resource-item__icon">
                                <i data-lucide="shield-check"></i>
                            </span>

                            <span class="related-resource-item__text">
                                <strong>
                                    Account Security Guidance
                                </strong>

                                <small>
                                    Supporting account review information
                                </small>
                            </span>

                            <i
                                class="related-resource-item__arrow"
                                data-lucide="arrow-up-right"
                            ></i>
                        </a>

                        <a
                            href="#"
                            class="related-resource-item"
                        >
                            <span class="related-resource-item__icon">
                                <i data-lucide="message-square-text"></i>
                            </span>

                            <span class="related-resource-item__text">
                                <strong>ATO Review Macro</strong>

                                <small>
                                    Approved response and documentation language
                                </small>
                            </span>

                            <i
                                class="related-resource-item__arrow"
                                data-lucide="arrow-up-right"
                            ></i>
                        </a>

                    </div>
                `
            })}
${buildExpandableEntrySection({
    id: "related-entries",
    icon: "network",
    eyebrow: "Connected Guidance",
    title: "Related Entries",
    description: "Explore additional workflows and guidance connected to this review.",
    content: `
        <div class="related-entry-list">

            <button
                class="related-entry-item"
                type="button"
                onclick="navigate('ato-escalations')"
            >
                <span class="related-entry-item__icon">
                    <i data-lucide="arrow-up-right"></i>
                </span>

                <span class="related-entry-item__text">
                    <strong>ATO Escalations</strong>

                    <small>
                        Escalation guidance for account takeover cases.
                    </small>
                </span>

                <i
                    class="related-entry-item__arrow"
                    data-lucide="chevron-right"
                ></i>
            </button>

            <button
                class="related-entry-item"
                type="button"
                onclick="navigate('core-account')"
            >
                <span class="related-entry-item__icon">
                    <i data-lucide="user-round-cog"></i>
                </span>

                <span class="related-entry-item__text">
                    <strong>Core Account</strong>

                    <small>
                        Core account review guidance and workflows.
                    </small>
                </span>

                <i
                    class="related-entry-item__arrow"
                    data-lucide="chevron-right"
                ></i>
            </button>

            <button
                class="related-entry-item"
                type="button"
                onclick="navigate('account')"
            >
                <span class="related-entry-item__icon">
                    <i data-lucide="folder-open"></i>
                </span>

                <span class="related-entry-item__text">
                    <strong>Account</strong>

                    <small>
                        Return to all account-related workflows.
                    </small>
                </span>

                <i
                    class="related-entry-item__arrow"
                    data-lucide="chevron-right"
                ></i>
            </button>

        </div>
    `
})}
${buildExpandableEntrySection({
    id: "recent-changes",
    icon: "history",
    eyebrow: "Update History",
    title: "Recent Changes",
    description: "Review the latest updates made to this guidance.",
    content: `
        <div class="recent-changes-list">

            <div class="recent-change-item">

                <div class="recent-change-item__date">
                    <span>Jul</span>
                    <strong>12</strong>
                </div>

                <div class="recent-change-item__content">
                    <div class="recent-change-item__header">
                        <strong>Review guidance updated</strong>

                        <span class="recent-change-badge updated">
                            Updated
                        </span>
                    </div>

                    <p>
                        Clarified the account ownership validation requirements.
                    </p>
                </div>

            </div>

            <div class="recent-change-item">

                <div class="recent-change-item__date">
                    <span>Jul</span>
                    <strong>08</strong>
                </div>

                <div class="recent-change-item__content">
                    <div class="recent-change-item__header">
                        <strong>Resource added</strong>

                        <span class="recent-change-badge new">
                            New
                        </span>
                    </div>

                    <p>
                        Added the Account Security Guidance resource.
                    </p>
                </div>

            </div>

            <div class="recent-change-item">

                <div class="recent-change-item__date">
                    <span>Jun</span>
                    <strong>28</strong>
                </div>

                <div class="recent-change-item__content">
                    <div class="recent-change-item__header">
                        <strong>Escalation language revised</strong>

                        <span class="recent-change-badge updated">
                            Updated
                        </span>
                    </div>

                    <p>
                        Revised the escalation requirement for unresolved cases.
                    </p>
                </div>

            </div>

        </div>
    `
})}
            <section class="entry-card">
                ${
                    record.content ||
                    "<p>Content coming soon.</p>"
                }
            </section>

        </div>
    `;

    refreshIcons();
}

function handleSidebarParentClick(recordId) {
    const isAlreadyExpanded =
        window.appState.expandedSection === recordId;

    window.appState.expandedSection =
        isAlreadyExpanded
            ? null
            : recordId;

    const currentRecord = window.navigationItems.find(
        item =>
            item.id === window.appState.currentSection
    );

    const currentTopLevelId = currentRecord
        ? getTopLevelParentId(currentRecord)
        : null;

    if (
        window.appState.currentView === "home" ||
        currentTopLevelId !== recordId
    ) {
        navigate(recordId);
        return;
    }

    buildLeftNavigation();
}

function toggleRequestTypesSection() {
    window.appState.requestTypesExpanded =
        !window.appState.requestTypesExpanded;

    buildLeftNavigation();
}

function buildSidebarUtilityItem(
    icon,
    label,
    clickAction = ""
) {
    return `
        <button
            class="left-navigation__utility"
            type="button"
            ${clickAction}
        >
            <i data-lucide="${icon}"></i>
            <span>${label}</span>
        </button>
    `;
}

function buildLeftNavigation() {
    const navigation = document.getElementById(
        "left-navigation"
    );

    if (!navigation) {
        return;
    }

    const topLevelItems = window.navigationItems
        .filter(item => item.parent === null)
        .sort((a, b) => a.sortOrder - b.sortOrder);

    const currentRecord = window.navigationItems.find(
        item =>
            item.id === window.appState.currentSection
    );

    const activeTopLevelId = currentRecord
        ? getTopLevelParentId(currentRecord)
        : null;

    if (
        !Object.prototype.hasOwnProperty.call(
            window.appState,
            "expandedSection"
        )
    ) {
        window.appState.expandedSection =
            activeTopLevelId;
    }

    if (
        !Object.prototype.hasOwnProperty.call(
            window.appState,
            "requestTypesExpanded"
        )
    ) {
        window.appState.requestTypesExpanded = true;
    }

    if (window.appState.currentView === "home") {
        window.appState.expandedSection = null;
    } else if (
        activeTopLevelId &&
        window.appState.lastActiveTopLevelId !==
            activeTopLevelId
    ) {
        window.appState.expandedSection =
            activeTopLevelId;
    }

    window.appState.lastActiveTopLevelId =
        activeTopLevelId;

    navigation.innerHTML = `
        <button
            class="left-navigation__home ${
                window.appState.currentView === "home"
                    ? "active"
                    : ""
            }"
            type="button"
            onclick="goHome()"
        >
            <i data-lucide="house"></i>
            <span>Home</span>
        </button>

        <div class="left-navigation__divider"></div>

        <div class="left-navigation__section">
            <h2 class="left-navigation__heading">
                On This Page
            </h2>

            <div class="left-navigation__utilities">

                ${buildSidebarUtilityItem(
                    "clipboard-check",
                    "BOT Expectations",
                    `onclick="openInfoPanel('bot-expectations')"`
                )}

                ${buildSidebarUtilityItem(
                    "sparkles",
                    "Best Practices",
                    `onclick="openInfoPanel('best-practices')"`
                )}

            </div>
        </div>

        <div class="left-navigation__divider"></div>

        <div class="left-navigation__section">

            <button
                class="left-navigation__section-toggle"
                type="button"
                onclick="toggleRequestTypesSection()"
                aria-expanded="${
                    window.appState.requestTypesExpanded
                }"
            >
                <span>View by Request Type</span>

                <i
                    data-lucide="${
                        window.appState.requestTypesExpanded
                            ? "chevron-down"
                            : "chevron-right"
                    }"
                ></i>
            </button>

            ${
                window.appState.requestTypesExpanded
                    ? `
                        <div class="left-navigation__items">

                            ${topLevelItems.map(item => {
                                const children =
                                    window.navigationItems
                                        .filter(
                                            child =>
                                                child.parent === item.id
                                        )
                                        .sort(
                                            (a, b) =>
                                                a.sortOrder -
                                                b.sortOrder
                                        );

                                const isActive =
                                    item.id === activeTopLevelId;

                                const isExpanded =
                                    item.id ===
                                    window.appState.expandedSection;

                                return `
                                    <div class="left-navigation__group">

                                        <button
                                            class="left-navigation__item ${
                                                isActive
                                                    ? "active"
                                                    : ""
                                            }"
                                            type="button"
                                            onclick="handleSidebarParentClick('${item.id}')"
                                            aria-expanded="${isExpanded}"
                                        >
                                            <span class="left-navigation__label">
                                                ${item.title}
                                            </span>

                                            ${
                                                children.length > 0
                                                    ? `
                                                        <i
                                                            class="left-navigation__chevron"
                                                            data-lucide="${
                                                                isExpanded
                                                                    ? "chevron-down"
                                                                    : "chevron-right"
                                                            }"
                                                        ></i>
                                                    `
                                                    : ""
                                            }
                                        </button>

                                        ${
                                            isExpanded &&
                                            children.length > 0
                                                ? `
                                                    <div class="left-navigation__children">

                                                        ${children.map(child => `
                                                            <button
                                                                class="left-navigation__child ${
                                                                    window.appState.currentSection === child.id
                                                                        ? "active"
                                                                        : ""
                                                                }"
                                                                type="button"
                                                                onclick="navigate('${child.id}')"
                                                            >
                                                                <span>
                                                                    ${child.title}
                                                                </span>
                                                            </button>
                                                        `).join("")}

                                                    </div>
                                                `
                                                : ""
                                        }

                                    </div>
                                `;
                            }).join("")}

                        </div>
                    `
                    : ""
            }

        </div>

        <div class="left-navigation__divider"></div>

        <div class="left-navigation__section">

            <h2 class="left-navigation__heading">
                Tools &amp; Resources
            </h2>

            <div class="left-navigation__utilities">

                ${buildSidebarUtilityItem(
                    "chart-no-axes-column",
                    "Quality Score"
                )}

                ${buildSidebarUtilityItem(
                    "route",
                    "OOS Routing"
                )}

                ${buildSidebarUtilityItem(
                    "newspaper",
                    "Important News"
                )}

                ${buildSidebarUtilityItem(
                    "bell",
                    "SOP Updates"
                )}

                ${buildSidebarUtilityItem(
                    "circle-help",
                    "Internal Notes & Help"
                )}

            </div>
        </div>
    `;

    refreshIcons();
}

function updateActiveNavigation() {
    buildLeftNavigation();
}