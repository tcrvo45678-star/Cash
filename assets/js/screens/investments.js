import { store, INVESTMENT_TYPES } from "./../store.js";
import { icon, TYPE_ICON } from "./../icons.js";
import { fmtMoney, fmtPct, escapeHtml, freshnessLabel } from "./../utils.js";
import { investmentStats, typeLabel, allocationBy } from "./../calc.js";
import { navigate } from "./../router.js";
import * as workflows from "./../workflows.js";

let searchTerm = "";
let filterKey = "active";
let sortKey = "value";

export function renderInvestments(container) {
  const view = store.settings.ui.investmentsView || "cards";
  container.innerHTML = `
    <div class="screen investments-screen">
      <div class="screen-head">
        <h2>ההשקעות שלי</h2>
        <button class="btn btn-primary btn-icon-label" id="inv-add-btn">${icon("plus", { size: 16 })}<span>השקעה חדשה</span></button>
      </div>
      <div class="toolbar">
        <div class="search-box">
          ${icon("search", { size: 16 })}
          <input type="search" id="inv-search" placeholder="חפש השקעה, מוסד, טיקר..." value="${escapeHtml(searchTerm)}">
        </div>
        <div class="filter-chips" id="inv-filters">
          ${filterChip("active", "פעיל")}
          ${filterChip("archived", "ארכיון")}
          ${filterChip("all", "הכל")}
        </div>
        <div class="view-toggle">
          <button class="view-btn ${view === "cards" ? "active" : ""}" data-view="cards" title="תצוגת כרטיסים">${icon("grid-3x3", { size: 16 })}</button>
          <button class="view-btn ${view === "table" ? "active" : ""}" data-view="table" title="תצוגת טבלה">${icon("list", { size: 16 })}</button>
        </div>
        <select id="inv-sort" class="sort-select">
          <option value="value" ${sortKey === "value" ? "selected" : ""}>מיין: שווי</option>
          <option value="return" ${sortKey === "return" ? "selected" : ""}>מיין: תשואה</option>
          <option value="gain" ${sortKey === "gain" ? "selected" : ""}>מיין: רווח</option>
          <option value="name" ${sortKey === "name" ? "selected" : ""}>מיין: שם</option>
          <option value="updated" ${sortKey === "updated" ? "selected" : ""}>מיין: עדכון אחרון</option>
        </select>
      </div>
      <div id="inv-list-root"></div>
    </div>
  `;

  container.querySelector("#inv-add-btn").addEventListener("click", () => workflows.openAddInvestmentFlow());
  container.querySelector("#inv-search").addEventListener("input", (e) => { searchTerm = e.target.value; renderList(container); });
  container.querySelectorAll("[data-filter]").forEach((b) => b.addEventListener("click", () => { filterKey = b.dataset.filter; renderInvestments(container); }));
  container.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => { store.setUiPref("investmentsView", b.dataset.view); renderInvestments(container); }));
  container.querySelector("#inv-sort").addEventListener("change", (e) => { sortKey = e.target.value; renderList(container); });

  renderList(container);
}

function filterChip(key, label) {
  return `<button class="chip ${filterKey === key ? "active" : ""}" data-filter="${key}">${label}</button>`;
}

function getFilteredSorted() {
  let list = store.data.investments.slice();
  if (filterKey === "active") list = list.filter((i) => !i.archived);
  if (filterKey === "archived") list = list.filter((i) => i.archived);
  if (searchTerm.trim()) {
    const q = searchTerm.trim().toLowerCase();
    list = list.filter((i) => [i.name, i.institution, i.ticker, typeLabel(i.type)].some((f) => (f || "").toLowerCase().includes(q)));
  }
  const withStats = list.map((inv) => ({ inv, stats: investmentStats(inv.id) }));
  withStats.sort((a, b) => {
    if (sortKey === "value") return b.stats.value - a.stats.value;
    if (sortKey === "return") return (b.stats.returnPct ?? -Infinity) - (a.stats.returnPct ?? -Infinity);
    if (sortKey === "gain") return b.stats.gain - a.stats.gain;
    if (sortKey === "name") return a.inv.name.localeCompare(b.inv.name, "he");
    if (sortKey === "updated") return (b.stats.lastUpdate || "").localeCompare(a.stats.lastUpdate || "");
    return 0;
  });
  return withStats;
}

function renderList(container) {
  const root = container.querySelector("#inv-list-root");
  const view = store.settings.ui.investmentsView || "cards";
  const items = getFilteredSorted();
  const total = items.reduce((s, x) => s + (x.inv.excludeFromTotals ? 0 : x.stats.value), 0);

  if (!items.length) {
    root.innerHTML = `<div class="card empty-state-card"><div class="empty-state-icon">${icon("inbox", { size: 36 })}</div><p class="text-muted">לא נמצאו השקעות תואמות.</p></div>`;
    return;
  }

  if (view === "table") {
    root.innerHTML = `<div class="table-scroll"><table class="inv-table">
      <thead><tr><th>השקעה</th><th>סוג</th><th>שווי</th><th>רווח</th><th>תשואה</th><th>% מהתיק</th><th>עודכן</th><th></th></tr></thead>
      <tbody>
        ${items.map(({ inv, stats }) => `
          <tr data-nav="/investments/${inv.id}">
            <td><span class="inv-name-cell">${icon(TYPE_ICON[inv.type] || "package", { size: 16 })}${escapeHtml(inv.name)}</span></td>
            <td class="text-muted">${typeLabel(inv.type)}</td>
            <td>${fmtMoney(stats.value, inv.currency)}</td>
            <td class="${stats.gain >= 0 ? "text-positive" : "text-negative"}">${fmtMoney(stats.gain, inv.currency, { forceSign: true })}</td>
            <td class="${(stats.returnPct ?? 0) >= 0 ? "text-positive" : "text-negative"}">${stats.returnPct != null ? fmtPct(stats.returnPct) : "—"}</td>
            <td class="text-muted">${total && !inv.excludeFromTotals ? Math.round((stats.value / total) * 100) + "%" : "—"}</td>
            <td class="text-muted small">${freshnessLabel(stats.lastUpdate)}</td>
            <td><button class="icon-btn row-menu" data-menu="${inv.id}">${icon("ellipsis", { size: 16 })}</button></td>
          </tr>`).join("")}
      </tbody>
    </table></div>`;
  } else {
    root.innerHTML = `<div class="inv-card-grid">
      ${items.map(({ inv, stats }) => investmentCardHtml(inv, stats, total)).join("")}
    </div>`;
  }

  root.querySelectorAll("[data-nav]").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest("[data-menu]") || e.target.closest(".inv-card-actions")) return;
      navigate(el.dataset.nav);
    });
  });
  root.querySelectorAll("[data-menu]").forEach((btn) => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); workflows.openInvestmentMoreMenu(btn.dataset.menu); });
  });
  root.querySelectorAll("[data-quick]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const { quick, id } = btn.dataset;
      if (quick === "update") workflows.openQuickUpdateValueDialog(id);
      if (quick === "deposit") workflows.openMoneyMoveDialog(id, "deposit");
      if (quick === "withdraw") workflows.openMoneyMoveDialog(id, "withdrawal");
      if (quick === "edit") workflows.openEditInvestmentDrawer(id);
      if (quick === "more") workflows.openInvestmentQuickActions(id);
    });
  });
}

function investmentCardHtml(inv, stats, total) {
  const pctOfPortfolio = total && !inv.excludeFromTotals ? Math.round((stats.value / total) * 100) : null;
  return `
    <article class="inv-card" data-nav="/investments/${inv.id}" style="--inv-color:${inv.color || "#245E48"}">
      <div class="inv-card-top">
        <div class="inv-card-icon">${icon(TYPE_ICON[inv.type] || "package", { size: 20 })}</div>
        <div class="inv-card-title">
          <div class="inv-card-name">${escapeHtml(inv.name)}</div>
          <div class="inv-card-sub text-muted">${escapeHtml(inv.institution || typeLabel(inv.type))}</div>
        </div>
        <button class="icon-btn row-menu" data-menu="${inv.id}">${icon("ellipsis", { size: 16 })}</button>
      </div>
      <div class="inv-card-value">${fmtMoney(stats.value, inv.currency)}</div>
      <div class="inv-card-metrics">
        <span class="${stats.gain >= 0 ? "text-positive" : "text-negative"}">${fmtMoney(stats.gain, inv.currency, { forceSign: true })}</span>
        <span class="${(stats.returnPct ?? 0) >= 0 ? "text-positive" : "text-negative"}">${stats.returnPct != null ? fmtPct(stats.returnPct) : "—"}</span>
      </div>
      ${pctOfPortfolio != null ? `<div class="inv-card-bar"><div class="inv-card-bar-fill" style="width:${pctOfPortfolio}%"></div></div><div class="inv-card-pct text-muted">${pctOfPortfolio}% מהתיק</div>` : ""}
      <div class="inv-card-footer">
        <span class="text-muted small">${freshnessLabel(stats.lastUpdate)}</span>
        <div class="inv-card-actions">
          <button class="icon-btn" title="עדכן שווי" data-quick="update" data-id="${inv.id}">${icon("pencil", { size: 15 })}</button>
          <button class="icon-btn" title="הוסף כסף" data-quick="deposit" data-id="${inv.id}">${icon("arrow-down-right", { size: 15 })}</button>
          <button class="icon-btn" title="משוך כסף" data-quick="withdraw" data-id="${inv.id}">${icon("arrow-up-right", { size: 15 })}</button>
          <button class="icon-btn" title="עוד" data-quick="more" data-id="${inv.id}">${icon("ellipsis", { size: 15 })}</button>
        </div>
      </div>
    </article>`;
}
