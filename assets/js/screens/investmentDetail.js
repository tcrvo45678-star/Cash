import { store } from "./../store.js";
import { icon, TYPE_ICON } from "./../icons.js";
import { fmtMoney, fmtPct, fmtDate, escapeHtml, freshnessLabel } from "./../utils.js";
import {
  investmentStats, investmentHistory, monthlySeriesForInvestment, typeLabel,
} from "./../calc.js";
import { createValueVsContributionsChart, createBarChart } from "./../charts.js";
import { navigate } from "./../router.js";
import * as workflows from "./../workflows.js";
import { confirmDialog, showToast, openModal } from "./../ui.js";
import { parseNumberInput } from "./../utils.js";

const RANGES = ["1M", "3M", "6M", "YTD", "1Y", "3Y", "ALL"];
let activeTab = "overview";
let gainMode = "amount";

export function renderInvestmentDetail(container, { id }) {
  const inv = store.getInvestment(id);
  if (!inv) {
    container.innerHTML = `<div class="screen"><div class="card empty-state-card"><p>ההשקעה לא נמצאה.</p><button class="btn btn-primary" data-back>חזרה להשקעות</button></div></div>`;
    container.querySelector("[data-back]").addEventListener("click", () => navigate("/investments"));
    return;
  }
  const stats = investmentStats(inv.id);
  const range = store.settings.ui.investmentRange || "ALL";

  container.innerHTML = `
    <div class="screen investment-detail-screen">
      <button class="back-link" data-back>${icon("chevron-right", { size: 16 })} כל ההשקעות</button>

      <div class="detail-header" style="--inv-color:${inv.color || "#245E48"}">
        <div class="detail-header-icon">${icon(TYPE_ICON[inv.type] || "package", { size: 26 })}</div>
        <div class="detail-header-info">
          <div class="detail-name-row">
            <h2 id="detail-name">${escapeHtml(inv.name)}</h2>
            <button class="icon-btn" id="rename-btn" title="שנה שם">${icon("pencil", { size: 15 })}</button>
            ${inv.archived ? `<span class="badge badge-muted">בארכיון</span>` : ""}
            ${inv.excludeFromTotals ? `<span class="badge badge-muted">לא נכלל בסך ההון</span>` : ""}
          </div>
          <div class="detail-sub text-muted">${[inv.institution, typeLabel(inv.type), inv.currency].filter(Boolean).join(" · ")}</div>
        </div>
      </div>

      <div class="detail-value-row">
        <div class="detail-value">${fmtMoney(stats.value, inv.currency)}</div>
        <div class="detail-metrics">
          <span class="${stats.gain >= 0 ? "text-positive" : "text-negative"}">${fmtMoney(stats.gain, inv.currency, { forceSign: true })}</span>
          <span class="${(stats.returnPct ?? 0) >= 0 ? "text-positive" : "text-negative"}">${stats.returnPct != null ? fmtPct(stats.returnPct) : "—"}</span>
          <span class="text-muted small">${freshnessLabel(stats.lastUpdate)}</span>
        </div>
      </div>

      <div class="detail-actions">
        <button class="btn btn-outline" data-act="deposit">${icon("arrow-down-right", { size: 15 })} הפקדה</button>
        <button class="btn btn-outline" data-act="withdraw">${icon("arrow-up-right", { size: 15 })} משיכה</button>
        <button class="btn btn-outline" data-act="update">${icon("pencil", { size: 15 })} עדכן שווי</button>
        <button class="btn btn-outline" data-act="edit">${icon("sliders-horizontal", { size: 15 })} ערוך</button>
        <button class="icon-btn" data-act="more">${icon("ellipsis", { size: 18 })}</button>
      </div>

      <div class="tabs" id="detail-tabs">
        ${tabBtn("overview", "סקירה")}
        ${tabBtn("performance", "ביצועים")}
        ${tabBtn("activity", "פעילות")}
        ${tabBtn("details", "פרטים")}
      </div>
      <div id="detail-tab-body"></div>
    </div>
  `;

  container.querySelector("[data-back]").addEventListener("click", () => navigate("/investments"));
  container.querySelector("#rename-btn").addEventListener("click", () => workflows.openRenameDialog(inv.id));
  container.querySelector('[data-act="deposit"]').addEventListener("click", () => workflows.openMoneyMoveDialog(inv.id, "deposit"));
  container.querySelector('[data-act="withdraw"]').addEventListener("click", () => workflows.openMoneyMoveDialog(inv.id, "withdrawal"));
  container.querySelector('[data-act="update"]').addEventListener("click", () => workflows.openQuickUpdateValueDialog(inv.id));
  container.querySelector('[data-act="edit"]').addEventListener("click", () => workflows.openEditInvestmentDrawer(inv.id));
  container.querySelector('[data-act="more"]').addEventListener("click", () => workflows.openInvestmentMoreMenu(inv.id));

  container.querySelectorAll(".tab-btn").forEach((b) => b.addEventListener("click", () => {
    activeTab = b.dataset.tab;
    renderTabBody(container, inv);
  }));

  renderTabBody(container, inv);
}

function tabBtn(key, label) {
  return `<button class="tab-btn ${activeTab === key ? "active" : ""}" data-tab="${key}">${label}</button>`;
}

function renderTabBody(container, inv) {
  container.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === activeTab));
  const body = container.querySelector("#detail-tab-body");
  if (activeTab === "overview") renderOverviewTab(body, inv);
  if (activeTab === "performance") renderPerformanceTab(body, inv);
  if (activeTab === "activity") renderActivityTab(body, inv);
  if (activeTab === "details") renderDetailsTab(body, inv);
}

function renderOverviewTab(body, inv) {
  const range = store.settings.ui.investmentRange || "ALL";
  const hist = investmentHistory(inv.id, range);
  const stats = investmentStats(inv.id);
  const firstSnap = store.snapshotsFor(inv.id)[0];

  body.innerHTML = `
    <div class="card chart-card">
      <div class="card-head">
        <h3>שווי מול הפקדות</h3>
        <div class="range-picker" id="detail-range">${RANGES.map((r) => `<button class="range-btn ${r === range ? "active" : ""}" data-range="${r}">${r}</button>`).join("")}</div>
      </div>
      ${hist.length >= 2 ? `<div class="chart-wrap chart-wrap-lg"><canvas id="detail-main-chart"></canvas></div>` : chartEmptyState()}
    </div>
    <div class="card">
      <h3>סיכום ביצועים</h3>
      <div class="perf-summary">
        <div class="perf-row"><span>השקעה ראשונית</span><strong>${firstSnap ? fmtMoney(firstSnap.value, inv.currency) : "—"}</strong></div>
        <div class="perf-row"><span>הפקדה נטו (כולל)</span><strong>${fmtMoney(stats.contrib, inv.currency)}</strong></div>
        <div class="perf-row"><span>שווי נוכחי</span><strong>${fmtMoney(stats.value, inv.currency)}</strong></div>
        <div class="perf-row perf-row-highlight"><span>רווח</span><strong class="${stats.gain >= 0 ? "text-positive" : "text-negative"}">${fmtMoney(stats.gain, inv.currency, { forceSign: true })}</strong></div>
        <div class="perf-row perf-row-highlight"><span>תשואה <span class="info-tip" title="התשואה מחושבת ביחס להפקדות נטו, בנפרד מהפקדות ומשיכות.">${icon("info", { size: 12 })}</span></span><strong class="${(stats.returnPct ?? 0) >= 0 ? "text-positive" : "text-negative"}">${stats.returnPct != null ? fmtPct(stats.returnPct) : "—"}</strong></div>
      </div>
    </div>
  `;
  body.querySelectorAll(".range-btn").forEach((btn) => btn.addEventListener("click", () => {
    store.setUiPref("investmentRange", btn.dataset.range);
    renderOverviewTab(body, inv);
  }));
  const canvas = body.querySelector("#detail-main-chart");
  if (canvas) {
    createValueVsContributionsChart(canvas, {
      labels: hist.map((h) => fmtDate(h.date, { style: "short" })),
      dateLabels: hist.map((h) => fmtDate(h.date)),
      values: hist.map((h) => h.value),
      contributions: hist.map((h) => h.contrib),
      currency: inv.currency,
    });
  }
}

function renderPerformanceTab(body, inv) {
  const series = monthlySeriesForInvestment(inv.id);
  const hist = investmentHistory(inv.id, "ALL");
  if (series.length < 2 || hist.length < 2) {
    body.innerHTML = `<div class="card">${chartEmptyState()}</div>`;
    return;
  }
  const labels = series.map((s) => monthShortLabel(s.month));
  body.innerHTML = `
    <div class="card chart-card">
      <div class="card-head">
        <h3>רווח / הפסד לאורך זמן</h3>
        <div class="toggle-pair" id="gain-toggle">
          <button class="${gainMode === "amount" ? "on" : ""}" data-mode="amount">₪</button>
          <button class="${gainMode === "pct" ? "on" : ""}" data-mode="pct">%</button>
        </div>
      </div>
      <div class="chart-wrap"><canvas id="gain-chart"></canvas></div>
    </div>
    <div class="card chart-card">
      <h3>תשואה חודשית</h3>
      <div class="chart-wrap"><canvas id="return-chart"></canvas></div>
    </div>
    <div class="card chart-card">
      <h3>שינוי בשווי לפי חודש</h3>
      <div class="chart-wrap"><canvas id="change-chart"></canvas></div>
    </div>
    <div class="card chart-card">
      <h3>הפקדות לאורך זמן</h3>
      <div class="chart-wrap"><canvas id="deposits-chart"></canvas></div>
    </div>
  `;

  const gainLabels = hist.map((h) => fmtDate(h.date, { style: "short" }));
  const drawGain = () => {
    const canvas = body.querySelector("#gain-chart");
    const data = gainMode === "amount" ? hist.map((h) => h.gain) : hist.map((h) => h.returnPct ?? 0);
    createBarChart(canvas, {
      labels: gainLabels, values: data, currency: inv.currency,
      valueFormatter: (v) => (gainMode === "amount" ? fmtMoney(v, inv.currency, { forceSign: true }) : fmtPct(v)),
    });
  };
  drawGain();
  body.querySelectorAll("#gain-toggle button").forEach((btn) => btn.addEventListener("click", () => {
    gainMode = btn.dataset.mode;
    body.querySelectorAll("#gain-toggle button").forEach((b) => b.classList.toggle("on", b === btn));
    drawGain();
  }));

  createBarChart(body.querySelector("#return-chart"), {
    labels, values: series.map((s) => s.returnPct ?? 0), valueFormatter: (v) => fmtPct(v),
  });
  createBarChart(body.querySelector("#change-chart"), {
    labels, values: series.map((s) => s.change), currency: inv.currency,
  });
  createBarChart(body.querySelector("#deposits-chart"), {
    labels, values: series.map((s) => s.depositsInMonth), currency: inv.currency,
    positiveColor: "#5C7A94", negativeColor: "#B94A4A",
  });
}

function monthShortLabel(m) {
  const [y, mo] = m.split("-");
  const names = ["ינו", "פבר", "מרץ", "אפר", "מאי", "יונ", "יול", "אוג", "ספט", "אוק", "נוב", "דצמ"];
  return `${names[parseInt(mo, 10) - 1]} ${y.slice(2)}`;
}

function chartEmptyState() {
  return `<p class="text-muted empty-note">עדיין אין מספיק היסטוריה לגרף הזה. לאחר שני עדכוני שווי נוכל להציג את ההתפתחות.</p>`;
}

function renderActivityTab(body, inv) {
  const txs = store.transactionsFor(inv.id).map((t) => ({ kind: "transaction", ...t }));
  const snaps = store.snapshotsFor(inv.id).map((s) => ({ kind: "snapshot", ...s }));
  const items = [...txs, ...snaps].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  if (!items.length) {
    body.innerHTML = `<div class="card"><p class="text-muted empty-note">אין עדיין פעילות. הוסף הפקדה או עדכן שווי כדי להתחיל.</p></div>`;
    return;
  }

  body.innerHTML = `<div class="card activity-card"><div class="activity-list">
    ${items.map((it) => activityItemHtml(it, inv)).join("")}
  </div></div>`;

  body.querySelectorAll("[data-edit-tx]").forEach((b) => b.addEventListener("click", () => openEditTransaction(b.dataset.editTx, inv, body)));
  body.querySelectorAll("[data-del-tx]").forEach((b) => b.addEventListener("click", async () => {
    const ok = await confirmDialog({ title: "מחיקת פעולה", message: "למחוק את הפעולה? כל החישובים והגרפים יתעדכנו.", confirmLabel: "מחק", danger: true });
    if (ok) { store.deleteTransaction(b.dataset.delTx); renderActivityTab(body, inv); showToast("הפעולה נמחקה"); }
  }));
  body.querySelectorAll("[data-edit-snap]").forEach((b) => b.addEventListener("click", () => openEditSnapshot(b.dataset.editSnap, inv, body)));
  body.querySelectorAll("[data-del-snap]").forEach((b) => b.addEventListener("click", async () => {
    const ok = await confirmDialog({ title: "מחיקת נקודת מעקב", message: "למחוק את נקודת המעקב? כל החישובים והגרפים יתעדכנו.", confirmLabel: "מחק", danger: true });
    if (ok) { store.deleteSnapshot(b.dataset.delSnap); renderActivityTab(body, inv); showToast("נקודת המעקב נמחקה"); }
  }));
}

const TX_LABELS = { deposit: "הפקדה", withdrawal: "משיכה", buy: "קנייה", sell: "מכירה", transfer_in: "העברה נכנסת", transfer_out: "העברה יוצאת", dividend: "דיבידנד", interest: "ריבית", fee: "עמלה", tax: "מס" };
const TX_ICONS = { deposit: "arrow-down-right", withdrawal: "arrow-up-right", buy: "arrow-down-right", sell: "arrow-up-right", transfer_in: "arrow-left-right", transfer_out: "arrow-left-right", dividend: "coins", interest: "coins", fee: "banknote", tax: "banknote" };

function activityItemHtml(it, inv) {
  if (it.kind === "transaction") {
    const negative = ["withdrawal", "sell", "transfer_out", "fee", "tax"].includes(it.type);
    return `<div class="activity-item">
      <div class="activity-icon">${icon(TX_ICONS[it.type] || "coins", { size: 16 })}</div>
      <div class="activity-main">
        <div class="activity-title">${TX_LABELS[it.type] || it.type}</div>
        <div class="activity-sub text-muted">${fmtDate(it.date)}${it.note ? " · " + escapeHtml(it.note) : ""}</div>
      </div>
      <div class="activity-amount ${negative ? "text-negative" : "text-positive"}">${negative ? "-" : "+"}${fmtMoney(it.amount, it.currency || inv.currency)}</div>
      <div class="activity-actions">
        <button class="icon-btn" data-edit-tx="${it.id}">${icon("pencil", { size: 14 })}</button>
        <button class="icon-btn" data-del-tx="${it.id}">${icon("trash-2", { size: 14 })}</button>
      </div>
    </div>`;
  }
  return `<div class="activity-item">
    <div class="activity-icon">${icon("pencil", { size: 16 })}</div>
    <div class="activity-main">
      <div class="activity-title">עדכון שווי</div>
      <div class="activity-sub text-muted">${fmtDate(it.date)}</div>
    </div>
    <div class="activity-amount">${fmtMoney(it.value, inv.currency)}</div>
    <div class="activity-actions">
      <button class="icon-btn" data-edit-snap="${it.id}">${icon("pencil", { size: 14 })}</button>
      <button class="icon-btn" data-del-snap="${it.id}">${icon("trash-2", { size: 14 })}</button>
    </div>
  </div>`;
}

function openEditTransaction(id, inv, body) {
  const t = store.data.transactions.find((x) => x.id === id);
  if (!t) return;
  const form = document.createElement("form");
  form.className = "stack-form";
  form.innerHTML = `
    <div class="field"><label>סכום</label><input type="number" inputmode="decimal" name="amount" value="${t.amount}"></div>
    <div class="field"><label>תאריך</label><input type="date" name="date" value="${t.date}"></div>
    <div class="field"><label>הערה</label><input type="text" name="note" value="${escapeHtml(t.note || "")}"></div>
  `;
  const { close, el } = openModal({
    title: `עריכת ${TX_LABELS[t.type] || "פעולה"}`, size: "sm", body: form,
    footer: `<button class="btn btn-ghost" data-act="cancel">ביטול</button><button class="btn btn-primary" data-act="save">שמור</button>`,
  });
  el.querySelector('[data-act="cancel"]').onclick = () => close();
  el.querySelector('[data-act="save"]').onclick = () => {
    const fd = new FormData(form);
    store.updateTransaction(id, { amount: parseNumberInput(fd.get("amount")), date: fd.get("date"), note: fd.get("note") });
    close();
    renderActivityTab(body, inv);
    showToast("הפעולה עודכנה");
  };
}

function openEditSnapshot(id, inv, body) {
  const s = store.data.snapshots.find((x) => x.id === id);
  if (!s) return;
  const form = document.createElement("form");
  form.className = "stack-form";
  form.innerHTML = `
    <div class="field"><label>שווי</label><input type="number" inputmode="decimal" name="value" value="${s.value}"></div>
    <div class="field"><label>תאריך</label><input type="date" name="date" value="${s.date}"></div>
  `;
  const { close, el } = openModal({
    title: "עריכת נקודת מעקב", size: "sm", body: form,
    footer: `<button class="btn btn-ghost" data-act="cancel">ביטול</button><button class="btn btn-primary" data-act="save">שמור</button>`,
  });
  el.querySelector('[data-act="cancel"]').onclick = () => close();
  el.querySelector('[data-act="save"]').onclick = () => {
    const fd = new FormData(form);
    store.updateSnapshot(id, { value: parseNumberInput(fd.get("value")), date: fd.get("date") });
    close();
    renderActivityTab(body, inv);
    showToast("נקודת המעקב עודכנה");
  };
}

function renderDetailsTab(body, inv) {
  const rows = [
    ["סוג", typeLabel(inv.type)],
    ["גוף מנהל", inv.institution || "—"],
    ["חשבון", inv.accountLabel || "—"],
    ["מטבע", inv.currency],
    ["Ticker", inv.ticker || "—"],
    ["מסלול", inv.track || "—"],
    ["דמי ניהול", inv.feeRate != null ? inv.feeRate + "%" : "—"],
    ["מיסוי", inv.taxType === "taxable" ? "חייב במס" : "פטור ממס"],
    ["נזילות", inv.liquidity === "liquid" ? "נזיל" : "לא נזיל"],
    ["קטגוריה", inv.category || "—"],
    ["חשיפה", inv.exposure || "—"],
    ["נכלל בסך ההון", inv.excludeFromTotals ? "לא" : "כן"],
    ["נוצר בתאריך", fmtDate(inv.createdAt.slice(0, 10))],
  ];
  body.innerHTML = `
    <div class="card">
      <div class="card-head"><h3>פרטי ההשקעה</h3><button class="btn btn-outline btn-small" data-edit>${icon("pencil", { size: 14 })} ערוך</button></div>
      <div class="details-grid">
        ${rows.map(([k, v]) => `<div class="details-row"><span class="text-muted">${k}</span><span>${escapeHtml(String(v))}</span></div>`).join("")}
      </div>
      ${inv.notes ? `<div class="details-notes"><span class="text-muted">הערות</span><p>${escapeHtml(inv.notes)}</p></div>` : ""}
    </div>
  `;
  body.querySelector("[data-edit]").addEventListener("click", () => workflows.openEditInvestmentDrawer(inv.id));
}
