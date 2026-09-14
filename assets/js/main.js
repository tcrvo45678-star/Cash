import { store } from "./store.js";
import { icon } from "./icons.js";
import { registerRoute, startRouter, navigate, currentPath } from "./router.js";
import { initTheme } from "./theme.js";
import { maybeShowMigrationPrompt } from "./migrationPrompt.js";
import { openNewMenu } from "./workflows.js";
import { openCommandPalette } from "./commandPalette.js";
import { syncToSheets } from "./sheets.js";
import { debounce } from "./utils.js";
import { renderDashboard } from "./screens/dashboard.js";
import { renderInvestments } from "./screens/investments.js";
import { renderInvestmentDetail } from "./screens/investmentDetail.js";
import { renderActivity } from "./screens/activity.js";
import { renderAnalysis } from "./screens/analysis.js";
import { renderGoals } from "./screens/goals.js";
import { renderSettings } from "./screens/settings.js";

const NAV_ITEMS = [
  { path: "/overview", label: "סקירה", icon: "layout-dashboard" },
  { path: "/investments", label: "השקעות", icon: "wallet" },
  { path: "/activity", label: "פעילות", icon: "activity" },
  { path: "/analysis", label: "ניתוח", icon: "chart-column" },
  { path: "/goals", label: "יעדים", icon: "target" },
  { path: "/settings", label: "הגדרות", icon: "settings" },
];

function renderShell() {
  document.getElementById("app").innerHTML = `
    <header class="app-header">
      <div class="app-header-inner">
        <div class="brand">
          <span class="brand-mark">${icon("wallet-cards", { size: 20 })}</span>
          <span class="brand-name">הון</span>
        </div>
        <nav class="top-nav" id="top-nav">
          ${NAV_ITEMS.map((n) => `<a href="#${n.path}" class="top-nav-item" data-path="${n.path}">${icon(n.icon, { size: 16 })}<span>${n.label}</span></a>`).join("")}
        </nav>
        <div class="header-actions">
          <button class="icon-btn cmdk-btn" id="cmdk-btn" title="חיפוש (Ctrl+K)">${icon("search", { size: 18 })}</button>
          <button class="btn btn-primary btn-icon-label" id="global-new-btn">${icon("plus", { size: 16 })}<span>חדש</span></button>
        </div>
      </div>
    </header>
    <main id="screen-root"></main>
    <nav class="bottom-nav" id="bottom-nav">
      ${NAV_ITEMS.slice(0, 5).map((n) => `<a href="#${n.path}" class="bottom-nav-item" data-path="${n.path}">${icon(n.icon, { size: 20 })}<span>${n.label}</span></a>`).join("")}
    </nav>
    <button class="fab" id="fab-new-btn" aria-label="חדש">${icon("plus", { size: 24 })}</button>
    <div id="overlay-root"></div>
  `;

  document.getElementById("global-new-btn").addEventListener("click", () => openNewMenu());
  document.getElementById("fab-new-btn").addEventListener("click", () => openNewMenu());
  document.getElementById("cmdk-btn").addEventListener("click", () => openCommandPalette());
}

function updateActiveNav() {
  const path = "/" + currentPath().split("/")[1];
  document.querySelectorAll(".top-nav-item, .bottom-nav-item").forEach((a) => {
    a.classList.toggle("active", a.dataset.path === path);
  });
}

function mountScreen(renderFn, params, query) {
  const root = document.getElementById("screen-root");
  root.scrollTop = 0;
  window.scrollTo(0, 0);
  renderFn(root, params || {}, query);
  updateActiveNav();
}

function setupRoutes() {
  registerRoute("/overview", () => mountScreen(renderDashboard));
  registerRoute("/investments", () => mountScreen(renderInvestments));
  registerRoute("/investments/:id", (params) => mountScreen(renderInvestmentDetail, params));
  registerRoute("/activity", () => mountScreen(renderActivity));
  registerRoute("/analysis", () => mountScreen(renderAnalysis));
  registerRoute("/goals", () => mountScreen(renderGoals));
  registerRoute("/settings", () => mountScreen(renderSettings));
}

function setupGlobalKeyboard() {
  document.addEventListener("keydown", (e) => {
    const isMeta = e.metaKey || e.ctrlKey;
    if (isMeta && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openCommandPalette();
    }
  });
}

function subscribeReRender() {
  store.subscribe(() => {
    const root = document.getElementById("screen-root");
    const path = currentPath();
    const [base, idPart] = path.split("/").filter(Boolean);
    if (base === "investments" && idPart) renderInvestmentDetail(root, { id: idPart });
    else if (base === "investments") renderInvestments(root);
    else if (base === "overview" || !base) renderDashboard(root);
    else if (base === "activity") renderActivity(root);
    else if (base === "analysis") renderAnalysis(root);
    else if (base === "goals") renderGoals(root);
    else if (base === "settings") renderSettings(root);
  });
}

function setupAutoSync() {
  const debouncedSync = debounce(() => {
    if (store.settings.sheetsUrl) syncToSheets();
  }, 1000);
  store.subscribe(debouncedSync);
}

function boot() {
  store.load();
  initTheme();
  renderShell();
  setupRoutes();
  setupGlobalKeyboard();
  subscribeReRender();
  setupAutoSync();

  const shown = maybeShowMigrationPrompt(() => {
    startRouter();
  });
  if (!shown) startRouter();
}

boot();
