function navigate(recordId) {
    const record = window.navigationItems.find(
        item => item.id === recordId
    );

    if (!record) {
        console.error(`Record not found: ${recordId}`);
        return;
    }

    const hasChildren = window.navigationItems.some(
        item => item.parent === recordId
    );

    window.appState.history.push({
        view: window.appState.currentView,
        section: window.appState.currentSection
    });

    window.appState.currentSection = recordId;

    if (hasChildren) {
        window.appState.currentView = "section";
        showSection(recordId);
    } else {
        window.appState.currentView = "record";
        showRecord(recordId);
    }

    buildLeftNavigation();
}

function goBack() {
    const previousLocation = window.appState.history.pop();

    if (!previousLocation) {
        goHome();
        return;
    }

    window.appState.currentView = previousLocation.view;
    window.appState.currentSection = previousLocation.section;

    if (previousLocation.view === "home") {
        showHome();
    } else if (previousLocation.view === "section") {
        showSection(previousLocation.section);
    } else if (previousLocation.view === "record") {
        showRecord(previousLocation.section);
    }

    buildLeftNavigation();
}

function goHome() {
    window.appState.currentView = "home";
    window.appState.currentSection = null;
    window.appState.history = [];

    showHome();
    buildLeftNavigation();
}