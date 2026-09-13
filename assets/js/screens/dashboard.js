import { store } from "./../store.js";
import { icon } from "./../icons.js";
import { fmtMoney, fmtPct, escapeHtml } from "./../utils.js";
import { currentPortfolioStats, portfolioHistory, buildInsights, allocationBy, staleInvestments, liquiditySplit, taxSplit } from "./../calc.js";
import { createValueVsContributionsChart, createDonutChart } from "./../charts.js";
import { fmtDate } from "./../utils.js";
import * as workflows from "./../workflows.js";
import { navigate } from "./../router.js";

const RANGES = ["1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y", "ALL"];

export function renderDashboard(container) {
  const stats = currentPortfolioStats();
  const invs = store.activeInvestments().filter((i) => !i.excludeFromTotals);
  const range = store.settings.ui.dashboardRange || "1Y";
  const insights = buildInsights();
  const stale = staleInvestments(30);

  container.innerHTML = `
    <div class="screen dashboard-screen">
      <div class="hero-card">
        <div class="hero-label">ההון שלי</div>
        <div class="hero-value" id="hero-value">${fmtMoney(stats.value)}</div>
        <div class="hero-delta" id="hero-delta"></div>
        <div class="hero-substats">
          <div class="substat"><span class="substat-label">הפקדתי</span><span class="substat-value">${fmtMoney(stats.contrib)}</span></div>
          <div class="substat"><span class="substat-label">רווח מצטבר</span><span class="substat-value ${stats.gain >= 0 ? "text-positive" : "text-negative"}">${fmtMoney(stats.gain, "ILS", { forceSign: true })}</span></div>
          <div class="substat"><span class="substat-label">תשואה</span><span class="substat-value ${stats.returnPct >= 0 ? "text-positive" : "text-negative"}">${stats.returnPct != null ? fmtPct(stats.returnPct) : "—"}</span></div>
        </div>
        <div class="quick-actions">
          <button class="qa-btn" data-qa="new_investment">${icon("plus", { size: 16 })}<span>השקעה</span></button>
          <button class="qa-btn" data-qa="deposit">${icon("arrow-down-right", { size: 16 })}<span>הפקדה</span></button>
          <button class="qa-btn" data-qa="withdraw">${icon("arrow-up-right", { size: 16 })}<span>משיכה</span></button>
          <button class="qa-btn" data-qa="update_value">${icon("pencil", { size: 16 })}<span>עדכון שווי</span></button>
        </div>
      </div>

      ${!invs.length ? emptyStateHtml() : `
      <div class="card chart-card">
        <div class="card-head">
          <h3>שווי התיק לאורך זמן</h3>
          <div class="range-picker" id="dash-range">
            ${RANGES.map((r) => `<button class="range-btn ${r === range ? "active" : ""}" data-range="${r}">${r}</button>`).join("")}
          </div>
        </div>
        <div class="chart-wrap chart-wrap-lg"><canvas id="dash-chart"></canvas></div>
      </div>

      ${insights.length ? `
      <div class="card insights-card">
        <h3>${icon("info", { size: 16 })} תובנות</h3>
        <ul class="insights-list">${insights.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>
      </div>` : ""}

      <div class="card">
        <div class="card-head"><h3>פילוח התיק</h3></div>
        <div class="split-bars">
          ${splitBarHtml(liquiditySplit(), [["liquid", "נזיל", "var(--positive)"], ["illiquid", "לא נזיל", "var(--accent-gold)"]])}
          ${splitBarHtml(taxSplit(), [["taxable", "חייב במס", "var(--accent-gold)"], ["exempt", "פטור ממס", "var(--brand-secondary)"]])}
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-head"><h3>חלוקת התיק</h3></div>
          <div class="donut-layout">
            <div class="chart-wrap chart-wrap-sm"><canvas id="dash-donut"></canvas></div>
            <div class="legend-list" id="dash-donut-legend"></div>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h3>דורש תשומת לב</h3></div>
          ${stale.length ? `<ul class="stale-list">${stale.slice(0, 6).map((i) => `<li><button class="link-item" data-nav="/investments/${i.id}"><span>${escapeHtml(i.name)}</span><span class="text-muted">${icon("clock", { size: 14 })} דורש עדכון</span></button></li>`).join("")}</ul>` : `<p class="text-muted empty-note">כל ההשקעות מעודכנות 👍</p>`}
        </div>
      </div>`}
    </div>
  `;

  container.querySelectorAll("[data-qa]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const qa = btn.dataset.qa;
      if (qa === "new_investment") workflows.openAddInvestmentFlow();
      if (qa === "deposit") workflows.quickDeposit();
      if (qa === "withdraw") workflows.quickWithdraw();
      if (qa === "update_value") workflows.openMonthlyUpdateCenter();
    });
  });

  container.querySelectorAll("[data-nav]").forEach((b) => b.addEventListener("click", () => navigate(b.dataset.nav)));

  if (!invs.length) {
    container.querySelector("[data-empty-add]")?.addEventListener("click", () => workflows.openAddInvestmentFlow());
    return;
  }

  container.querySelectorAll(".range-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      store.setUiPref("dashboardRange", btn.dataset.range);
      renderDashboard(container);
    });
  });

  const hist = portfolioHistory(range);
  const canvas = container.querySelector("#dash-chart");
  if (canvas && hist.length) {
    createValueVsContributionsChart(canvas, {
      labels: hist.map((h) => shortLabel(h.date, range)),
      dateLabels: hist.map((h) => fmtDate(h.date)),
      values: hist.map((h) => h.value),
      contributions: hist.map((h) => h.contrib),
      currency: "ILS",
    });
  } else if (canvas) {
    canvas.parentElement.innerHTML = `<p class="text-muted empty-note">עדיין אין מספיק היסטוריה לגרף הזה. לאחר שני עדכוני שווי נוכל להציג את ההתפתחות.</p>`;
  }

  const donutCanvas = container.querySelector("#dash-donut");
  const alloc = allocationBy("investment").map((a, i) => ({ ...a, color: a.color || paletteColor(i) }));
  if (donutCanvas && alloc.length) {
    createDonutChart(donutCanvas, { items: alloc });
    const legend = container.querySelector("#dash-donut-legend");
    const total = alloc.reduce((s, a) => s + a.value, 0);
    legend.innerHTML = alloc.slice(0, 6).map((a) => `
      <button class="legend-item" data-nav="/investments/${findInvestmentIdByName(a.name) || ""}">
        <span class="legend-dot" style="background:${a.color}"></span>
        <span class="legend-name">${escapeHtml(a.name)}</span>
        <span class="legend-value">${Math.round((a.value / total) * 100)}%</span>
      </button>`).join("");
    legend.querySelectorAll("[data-nav]").forEach((b) => { if (b.dataset.nav !== "/investments/") b.addEventListener("click", () => navigate(b.dataset.nav)); });
  }

  computeHeroDelta(container);
}

function findInvestmentIdByName(name) {
  const inv = store.data.investments.find((i) => i.name === name);
  return inv ? inv.id : null;
}

function paletteColor(i) {
  const palette = ["#245E48", "#B69560", "#5C7A94", "#8C4A38", "#4F8C82", "#9B6B5C", "#7A8FA6", "#A0895A"];
  return palette[i % palette.length];
}

function shortLabel(dateISO, range) {
  const d = new Date(dateISO);
  if (["1M", "3M"].includes(range)) return d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
  return d.toLocaleDateString("he-IL", { month: "short", year: "2-digit" });
}

function computeHeroDelta(container) {
  const hist = portfolioHistory("1M");
  const deltaEl = container.querySelector("#hero-delta");
  if (!deltaEl) return;
  if (hist.length < 2) { deltaEl.textContent = ""; return; }
  const first = hist[0], last = hist[hist.length - 1];
  const change = last.value - first.value;
  const pct = first.value ? (change / first.value) * 100 : 0;
  deltaEl.innerHTML = `<span class="${change >= 0 ? "text-positive" : "text-negative"}">${fmtMoney(change, "ILS", { forceSign: true })} החודש · ${fmtPct(pct)}</span>`;
}

function splitBarHtml(split, [[keyA, labelA, colorA], [keyB, labelB, colorB]]) {
  const total = split.total || 0;
  const a = split[keyA] || 0, b = split[keyB] || 0;
  const pctA = total ? Math.round((a / total) * 100) : 0;
  const pctB = 100 - pctA;
  return `<div class="split-bar-box">
    <div class="split-bar-track">
      <div class="split-bar-seg" style="width:${pctA}%; background:${colorA}">${pctA > 12 ? pctA + "%" : ""}</div>
      <div class="split-bar-seg" style="width:${pctB}%; background:${colorB}">${pctB > 12 ? pctB + "%" : ""}</div>
    </div>
    <div class="split-bar-legend">
      <span><span class="legend-dot" style="background:${colorA}"></span>${labelA} · ${fmtMoney(a)}</span>
      <span><span class="legend-dot" style="background:${colorB}"></span>${labelB} · ${fmtMoney(b)}</span>
    </div>
  </div>`;
}

function emptyStateHtml() {
  return `<div class="card empty-state-card">
    <div class="empty-state-icon">${icon("wallet", { size: 40 })}</div>
    <h3>עדיין אין לך השקעות</h3>
    <p class="text-muted">הוסף את ההשקעה הראשונה שלך, והמערכת תתחיל לבנות עבורך תמונת הון.</p>
    <button class="btn btn-primary" data-empty-add>${icon("plus", { size: 16 })} הוסף השקעה</button>
  </div>`;
}
