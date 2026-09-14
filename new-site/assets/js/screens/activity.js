import { store } from "./../store.js";
import { icon } from "./../icons.js";
import { fmtMoney, fmtDate, escapeHtml } from "./../utils.js";
import { navigate } from "./../router.js";
import { confirmDialog, showToast } from "./../ui.js";

const TX_LABELS = { deposit: "הפקדה", withdrawal: "משיכה", buy: "קנייה", sell: "מכירה", transfer_in: "העברה נכנסת", transfer_out: "העברה יוצאת", dividend: "דיבידנד", interest: "ריבית", fee: "עמלה", tax: "מס" };
const TX_ICONS = { deposit: "arrow-down-right", withdrawal: "arrow-up-right", buy: "arrow-down-right", sell: "arrow-up-right", transfer_in: "arrow-left-right", transfer_out: "arrow-left-right", dividend: "coins", interest: "coins", fee: "banknote", tax: "banknote" };

let filterType = "all";

export function renderActivity(container) {
  const items = store.allActivity();
  container.innerHTML = `
    <div class="screen activity-screen">
      <div class="screen-head"><h2>פעילות</h2></div>
      <div class="filter-chips">
        ${chip("all", "הכל")}
        ${chip("deposit", "הפקדות")}
        ${chip("withdrawal", "משיכות")}
        ${chip("snapshot", "עדכוני שווי")}
        ${chip("transfer", "העברות")}
      </div>
      <div id="activity-list-root"></div>
    </div>
  `;
  container.querySelectorAll("[data-filter]").forEach((b) => b.addEventListener("click", () => { filterType = b.dataset.filter; renderActivity(container); }));
  renderList(container, items);
}

function chip(key, label) {
  return `<button class="chip ${filterType === key ? "active" : ""}" data-filter="${key}">${label}</button>`;
}

function matchesFilter(it) {
  if (filterType === "all") return true;
  if (filterType === "snapshot") return it.kind === "snapshot";
  if (filterType === "transfer") return it.type === "transfer_in" || it.type === "transfer_out";
  return it.type === filterType;
}

function groupByDate(items) {
  const groups = [];
  let lastDate = null;
  items.forEach((it) => {
    const label = dateGroupLabel(it.date);
    if (label !== lastDate) { groups.push({ label, items: [] }); lastDate = label; }
    groups[groups.length - 1].items.push(it);
  });
  return groups;
}

function dateGroupLabel(dateISO) {
  const today = new Date().toISOString().slice(0, 10);
  const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (dateISO === today) return "היום";
  if (dateISO === yest) return "אתמול";
  return fmtDate(dateISO, { style: "monthYear" });
}

function renderList(container, items) {
  const root = container.querySelector("#activity-list-root");
  const filtered = items.filter(matchesFilter);
  if (!filtered.length) {
    root.innerHTML = `<div class="card empty-state-card"><div class="empty-state-icon">${icon("inbox", { size: 36 })}</div><p class="text-muted">אין עדיין פעילות להצגה.</p></div>`;
    return;
  }
  const groups = groupByDate(filtered);
  root.innerHTML = groups.map((g) => `
    <div class="activity-group">
      <div class="activity-group-label">${g.label}</div>
      <div class="card activity-card"><div class="activity-list">
        ${g.items.map((it) => itemHtml(it)).join("")}
      </div></div>
    </div>`).join("");

  root.querySelectorAll("[data-nav]").forEach((b) => b.addEventListener("click", () => navigate(b.dataset.nav)));
  root.querySelectorAll("[data-del-tx]").forEach((b) => b.addEventListener("click", async (e) => {
    e.stopPropagation();
    const ok = await confirmDialog({ title: "מחיקת פעולה", message: "למחוק את הפעולה?", confirmLabel: "מחק", danger: true });
    if (ok) { store.deleteTransaction(b.dataset.delTx); showToast("הפעולה נמחקה"); renderActivity(container); }
  }));
  root.querySelectorAll("[data-del-snap]").forEach((b) => b.addEventListener("click", async (e) => {
    e.stopPropagation();
    const ok = await confirmDialog({ title: "מחיקת נקודת מעקב", message: "למחוק את נקודת המעקב?", confirmLabel: "מחק", danger: true });
    if (ok) { store.deleteSnapshot(b.dataset.delSnap); showToast("נקודת המעקב נמחקה"); renderActivity(container); }
  }));
}

function itemHtml(it) {
  const inv = store.getInvestment(it.investmentId);
  const invName = inv ? escapeHtml(inv.name) : "השקעה שנמחקה";
  if (it.kind === "transaction") {
    const negative = ["withdrawal", "sell", "transfer_out", "fee", "tax"].includes(it.type);
    return `<div class="activity-item" data-nav="/investments/${it.investmentId}">
      <div class="activity-icon">${icon(TX_ICONS[it.type] || "coins", { size: 16 })}</div>
      <div class="activity-main">
        <div class="activity-title">${TX_LABELS[it.type] || it.type} · ${invName}</div>
        <div class="activity-sub text-muted">${fmtDate(it.date)}${it.note ? " · " + escapeHtml(it.note) : ""}</div>
      </div>
      <div class="activity-amount ${negative ? "text-negative" : "text-positive"}">${negative ? "-" : "+"}${fmtMoney(it.amount, it.currency)}</div>
      <div class="activity-actions"><button class="icon-btn" data-del-tx="${it.id}">${icon("trash-2", { size: 14 })}</button></div>
    </div>`;
  }
  return `<div class="activity-item" data-nav="/investments/${it.investmentId}">
    <div class="activity-icon">${icon("pencil", { size: 16 })}</div>
    <div class="activity-main">
      <div class="activity-title">עדכון שווי · ${invName}</div>
      <div class="activity-sub text-muted">${fmtDate(it.date)}</div>
    </div>
    <div class="activity-amount">${fmtMoney(it.value, inv?.currency)}</div>
    <div class="activity-actions"><button class="icon-btn" data-del-snap="${it.id}">${icon("trash-2", { size: 14 })}</button></div>
  </div>`;
}
