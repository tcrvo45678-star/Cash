import { store } from "./../store.js";
import { icon } from "./../icons.js";
import { fmtMoney, escapeHtml } from "./../utils.js";
import { allocationBy, monthlyReturnHeatmap, investmentHistory, hasMarketSectorData, breakdownByField, fxGainLossByInvestment } from "./../calc.js";
import { createDonutChart, createComparisonChart, createBarChart, renderHeatmap } from "./../charts.js";
import { CHART_PALETTE } from "./../store.js";

let compareIds = [];
let normalized = false;
let allocField = "investment";

export function renderAnalysis(container) {
  const invs = store.activeInvestments().filter((i) => !i.excludeFromTotals);
  if (compareIds.length === 0 && invs.length) compareIds = invs.slice(0, Math.min(3, invs.length)).map((i) => i.id);
  const showMarketSector = hasMarketSectorData();
  const fxItems = fxGainLossByInvestment();

  container.innerHTML = `
    <div class="screen analysis-screen">
      <div class="screen-head"><h2>ניתוח</h2></div>

      <div class="card">
        <div class="card-head">
          <h3>חלוקת התיק</h3>
          <div class="filter-chips" id="alloc-field-chips">
            ${allocChip("investment", "השקעה")}
            ${allocChip("type", "סוג")}
            ${allocChip("institution", "מוסד")}
            ${allocChip("currency", "מטבע")}
          </div>
        </div>
        <div class="donut-layout">
          <div class="chart-wrap chart-wrap-sm"><canvas id="alloc-donut"></canvas></div>
          <div class="legend-list" id="alloc-legend"></div>
        </div>
      </div>

      ${showMarketSector ? `
      <div class="card">
        <div class="card-head"><h3>פירוט אחזקות - שוק, תחום ומטבע</h3></div>
        <p class="text-muted small" style="margin-bottom:12px;">מבוסס על השקעות עם שוק/תחום מוגדרים (למשל פירוט אחזקות בתוך תיק השקעות). ערכים דולריים מומרים לשקלים לפי השער בהגדרות.</p>
        <div class="market-sector-grid">
          <div class="ms-block"><div class="ms-title">לפי שוק</div><div class="chart-wrap chart-wrap-sm"><canvas id="market-donut"></canvas></div><div class="legend-list" id="market-legend"></div></div>
          <div class="ms-block"><div class="ms-title">לפי תחום</div><div class="chart-wrap chart-wrap-sm"><canvas id="sector-donut"></canvas></div><div class="legend-list" id="sector-legend"></div></div>
          <div class="ms-block"><div class="ms-title">חשיפה מטבעית</div><div class="chart-wrap chart-wrap-sm"><canvas id="currency-donut"></canvas></div><div class="legend-list" id="currency-legend"></div></div>
        </div>
        ${fxItems.length ? `
        <div class="card-head" style="margin-top:20px;"><h3>רווח / הפסד משער חליפין</h3></div>
        <div class="chart-wrap"><canvas id="fx-chart"></canvas></div>` : ""}
      </div>` : ""}

      <div class="card">
        <div class="card-head">
          <h3>השוואת השקעות</h3>
          <label class="toggle-inline"><input type="checkbox" id="normalize-toggle" ${normalized ? "checked" : ""}> נרמל לתשואה (בסיס 100)</label>
        </div>
        <div class="compare-picker" id="compare-picker">
          ${invs.map((i) => `<label class="compare-chip"><input type="checkbox" value="${i.id}" ${compareIds.includes(i.id) ? "checked" : ""}> ${escapeHtml(i.name)}</label>`).join("")}
        </div>
        <div class="chart-wrap chart-wrap-lg" id="compare-chart-wrap"><canvas id="compare-chart"></canvas></div>
      </div>

      <div class="card">
        <h3>מפת חום - תשואה חודשית</h3>
        <div class="table-scroll" id="heatmap-root"></div>
      </div>
    </div>
  `;

  container.querySelectorAll("[data-alloc-field]").forEach((b) => b.addEventListener("click", () => { allocField = b.dataset.allocField; renderAnalysis(container); }));

  drawAllocation(container);

  if (showMarketSector) {
    drawMiniDonut(container, "market-donut", "market-legend", breakdownByField("market"));
    drawMiniDonut(container, "sector-donut", "sector-legend", breakdownByField("sector"));
    drawMiniDonut(container, "currency-donut", "currency-legend", breakdownByField("currency"));
    if (fxItems.length) {
      createBarChart(container.querySelector("#fx-chart"), {
        labels: fxItems.map((x) => x.name), values: fxItems.map((x) => x.value),
      });
    }
  }

  container.querySelector("#normalize-toggle").addEventListener("change", (e) => { normalized = e.target.checked; drawCompare(container); });
  container.querySelectorAll('#compare-picker input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener("change", () => {
      const checked = Array.from(container.querySelectorAll('#compare-picker input:checked')).map((c) => c.value);
      if (checked.length > 4) { cb.checked = false; return; }
      compareIds = checked;
      drawCompare(container);
    });
  });
  drawCompare(container);

  const byYear = monthlyReturnHeatmap();
  const heatmapRoot = container.querySelector("#heatmap-root");
  if (byYear.size) renderHeatmap(heatmapRoot, byYear);
  else heatmapRoot.innerHTML = `<p class="text-muted empty-note">עדיין אין מספיק היסטוריה חודשית להצגת מפת חום.</p>`;
}

function allocChip(key, label) {
  return `<button class="chip ${allocField === key ? "active" : ""}" data-alloc-field="${key}">${label}</button>`;
}

function drawAllocation(container) {
  const items = allocationBy(allocField).map((a, i) => ({ ...a, color: a.color || CHART_PALETTE[i % CHART_PALETTE.length] }));
  const canvas = container.querySelector("#alloc-donut");
  const legend = container.querySelector("#alloc-legend");
  if (!items.length) {
    canvas.parentElement.innerHTML = `<p class="text-muted empty-note">אין עדיין נתונים.</p>`;
    legend.innerHTML = "";
    return;
  }
  createDonutChart(canvas, { items });
  const total = items.reduce((s, a) => s + a.value, 0);
  legend.innerHTML = items.map((a) => `
    <div class="legend-item">
      <span class="legend-dot" style="background:${a.color}"></span>
      <span class="legend-name">${escapeHtml(a.name)}</span>
      <span class="legend-value">${fmtMoney(a.value)} · ${total ? Math.round((a.value / total) * 100) : 0}%</span>
    </div>`).join("");
}

function drawMiniDonut(container, canvasId, legendId, rawItems) {
  const items = rawItems.map((a, i) => ({ ...a, color: a.color || CHART_PALETTE[i % CHART_PALETTE.length] }));
  const canvas = container.querySelector(`#${canvasId}`);
  const legend = container.querySelector(`#${legendId}`);
  if (!canvas) return;
  if (!items.length) {
    canvas.parentElement.innerHTML = `<p class="text-muted empty-note">אין נתונים.</p>`;
    if (legend) legend.innerHTML = "";
    return;
  }
  createDonutChart(canvas, { items });
  const total = items.reduce((s, a) => s + a.value, 0);
  if (legend) {
    legend.innerHTML = items.map((a) => `
      <div class="legend-item">
        <span class="legend-dot" style="background:${a.color}"></span>
        <span class="legend-name">${escapeHtml(a.name)}</span>
        <span class="legend-value">${total ? Math.round((a.value / total) * 100) : 0}%</span>
      </div>`).join("");
  }
}

function drawCompare(container) {
  const wrap = container.querySelector("#compare-chart-wrap");
  if (!compareIds.length) {
    wrap.innerHTML = `<p class="text-muted empty-note">בחר עד 4 השקעות להשוואה.</p>`;
    return;
  }
  if (!wrap.querySelector("canvas")) wrap.innerHTML = `<canvas id="compare-chart"></canvas>`;
  const canvas = wrap.querySelector("#compare-chart");

  const histories = compareIds.map((id) => ({ inv: store.getInvestment(id), hist: investmentHistory(id, "ALL") }))
    .filter((x) => x.inv && x.hist.length);
  if (!histories.length) { wrap.innerHTML = `<p class="text-muted empty-note">אין מספיק היסטוריה להשקעות שנבחרו.</p>`; return; }

  const allDates = Array.from(new Set(histories.flatMap((h) => h.hist.map((p) => p.date)))).sort();
  const labels = allDates.map((d) => new Date(d).toLocaleDateString("he-IL", { month: "short", year: "2-digit" }));

  const series = histories.map((h, i) => {
    const byDate = new Map(h.hist.map((p) => [p.date, p.value]));
    let lastVal = null;
    const rawValues = allDates.map((d) => { if (byDate.has(d)) lastVal = byDate.get(d); return lastVal; });
    let values = rawValues;
    if (normalized) {
      const base = rawValues.find((v) => v != null && v > 0);
      values = rawValues.map((v) => (v == null || !base ? null : (v / base) * 100));
    }
    return { name: h.inv.name, color: h.inv.color || CHART_PALETTE[i % CHART_PALETTE.length], values };
  });

  createComparisonChart(canvas, { labels, series, normalized, dateLabels: allDates.map((d) => new Date(d).toLocaleDateString("he-IL")) });
}
