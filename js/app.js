window.appState = {
    currentView: "home",
    currentSection: null,
    history: []
};

buildLeftNavigation();
showHome();
renderRecentlyViewedWidget();

const headerSearchInput = document.querySelector(
    ".header-search input"
);

if (headerSearchInput) {
    let searchTimer;

    headerSearchInput.addEventListener(
        "input",
        event => {
            window.clearTimeout(searchTimer);

            const searchQuery =
                event.target.value;

            searchTimer = window.setTimeout(
                () => {
                    showSearchResults(searchQuery);
                },
                200
            );
        }
    );

    headerSearchInput.addEventListener(
        "keydown",
        event => {
            if (event.key !== "Escape") {
                return;
            }

            headerSearchInput.value = "";
            showHome();
            headerSearchInput.blur();
        }
    );
}