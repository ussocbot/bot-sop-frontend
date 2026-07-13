window.appState = {
  currentView: "home",
  currentSection: null,
  history: []
};

function configureSearch() {
  const headerSearchInput = document.querySelector(".header-search input");
  if (!headerSearchInput) return;

  let searchTimer;

  headerSearchInput.addEventListener("input", event => {
    window.clearTimeout(searchTimer);
    const searchQuery = event.target.value;

    searchTimer = window.setTimeout(() => {
      showSearchResults(searchQuery);
    }, 200);
  });

  headerSearchInput.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;

    headerSearchInput.value = "";
    showHome();
    headerSearchInput.blur();
  });
}

function showStartupError(error) {
  const contentView = document.getElementById("content-view");
  if (!contentView) return;

  const safeMessage = String(error.message || error)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  contentView.innerHTML = `
    <section class="entry-page">
      <header class="entry-header">
        <div>
          <h1>Unable to load BOT SOP</h1>
          <p>${safeMessage}</p>
        </div>
      </header>
      <button class="back-button" type="button" onclick="window.location.reload()">
        Try again
      </button>
    </section>
  `;
}

async function initializeApp() {
  try {
    await window.baseDataReady;
    window.installBaseRecordRenderer?.();
    buildLeftNavigation();
    showHome();
    renderRecentlyViewedWidget();
    configureSearch();
  } catch (error) {
    console.error("BOT SOP startup failed", error);
    showStartupError(error);
  }
}

initializeApp();
