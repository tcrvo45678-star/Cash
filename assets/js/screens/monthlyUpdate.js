import { store, CASH_SOURCE_OPTIONS } from "./../store.js";
import { icon, TYPE_ICON } from "./../icons.js";
import { fmtMoney, escapeHtml, freshnessLabel, parseNumberInput, todayISO } from "./../utils.js";
import { currentValue, freshnessDays, isTrackingReturns, typeLabel } from "./../calc.js";
import { showToast } from "./../ui.js";

export function renderMonthlyUpdate(container) {
  const invs = store.activeInvestments();

  container.innerHTML = `
    <div class="screen monthly-screen">
      <div class="screen-head">
        <h2>עדכון חודשי</h2>
      </div>
      ${!invs.length ? `
        <div class="card empty-state-card">
          <div class="empty-state-icon">${icon("pencil", { size: 36 })}</div>
          <p class="text-muted">אין עדיין השקעות פעילות לעדכן.</p>
        </div>` : `
      <p class="text-muted monthly-intro">עדכן/י את השווי הנוכחי של כל השקעה. אפשר לדלג בין השדות עם Tab או Enter - שדה ריק נשאר ללא שינוי.</p>
      <div class="card monthly-card" id="monthly-card"></div>
      `}
    </div>
  `;

  if (!invs.length) return;
  renderTable(container);
}

function groupInvestments(invs) {
  const groups = new Map();
  invs.forEach((inv) => {
    const key = inv.institution || "ללא מוסד";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(inv);
  });
  const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
    if (a === "ללא מוסד") return 1;
    if (b === "ללא מוסד") return -1;
    return a.localeCompare(b, "he");
  });
  return sortedKeys.map((key) => ({
    institution: key,
    items: groups.get(key).sort((a, b) => freshnessDays(b.id) - freshnessDays(a.id)),
  }));
}

function renderTable(container) {
  const invs = store.activeInvestments();
  const groups = groupInvestments(invs);
  const rows = invs.map((inv) => ({ inv, prev: currentValue(inv.id), cash: !isTrackingReturns(inv) }));
  const rowById = new Map(rows.map((r) => [r.inv.id, r]));

  const card = container.querySelector("#monthly-card");
  card.innerHTML = `
    <div class="monthly-table">
      ${groups.map((g) => `
        <div class="monthly-group">
          <div class="monthly-group-label">${escapeHtml(g.institution)}</div>
          ${g.items.map((inv) => rowHtml(rowById.get(inv.id))).join("")}
        </div>
      `).join("")}
    </div>
    <div class="monthly-preview" id="monthly-preview"></div>
  `;

  const inputs = Array.from(card.querySelectorAll(".mu-input"));
  const preview = card.querySelector("#monthly-preview");

  function updatePreview() {
    let prevTotal = 0, newTotal = 0, cashDelta = 0, investDelta = 0, changed = 0;
    rows.forEach((r) => {
      const input = card.querySelector(`.mu-input[data-id="${r.inv.id}"]`);
      const raw = input ? input.value : "";
      const newVal = raw !== "" ? parseNumberInput(raw) : r.prev;
      prevTotal += r.prev;
      newTotal += newVal;
      if (raw !== "") {
        changed++;
        const delta = newVal - r.prev;
        if (r.cash) cashDelta += delta; else investDelta += delta;
      }
    });
    const change = newTotal - prevTotal;
    preview.innerHTML = changed ? `
      <div class="mu-preview-row"><span>שווי קודם</span><strong>${fmtMoney(prevTotal)}</strong></div>
      <div class="mu-preview-row"><span>שווי חדש</span><strong>${fmtMoney(newTotal)}</strong></div>
      <div class="mu-preview-row mu-preview-highlight"><span>שינוי כולל</span><strong class="${change >= 0 ? "text-positive" : "text-negative"}">${fmtMoney(change, "ILS", { forceSign: true })}</strong></div>
      ${(cashDelta !== 0 || investDelta !== 0) ? `
      <div class="mu-preview-split">
        ${investDelta !== 0 ? `<span>שינוי בהשקעות (שוק): <strong class="${investDelta >= 0 ? "text-positive" : "text-negative"}">${fmtMoney(investDelta, "ILS", { forceSign: true })}</strong></span>` : ""}
        ${cashDelta !== 0 ? `<span>תזרים מזומן (עו״ש וכד׳): <strong class="${cashDelta >= 0 ? "text-positive" : "text-negative"}">${fmtMoney(cashDelta, "ILS", { forceSign: true })}</strong></span>` : ""}
      </div>` : ""}
    ` : `<p class="text-muted">מלא/י שווי חדש לפחות בהשקעה אחת כדי לראות תצוגה מקדימה.</p>`;
    const bar = card.querySelector("#monthly-save-bar");
    const btn = bar.querySelector("[data-act=save]");
    btn.textContent = changed ? `שמור ${changed} עדכונים` : "שמור עדכונים";
    btn.disabled = !changed;
  }

  card.insertAdjacentHTML("beforeend", `
    <div class="monthly-save-bar" id="monthly-save-bar">
      <button class="btn btn-primary btn-full" data-act="save" disabled>שמור עדכונים</button>
    </div>
  `);

  inputs.forEach((inp, idx) => {
    inp.addEventListener("input", updatePreview);
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const next = inputs[idx + 1];
        if (next) next.focus(); else card.querySelector("[data-act=save]").focus();
      }
    });
  });

  card.querySelector("[data-act=save]").addEventListener("click", () => {
    const date = todayISO();
    let count = 0;
    rows.forEach((r) => {
      const input = card.querySelector(`.mu-input[data-id="${r.inv.id}"]`);
      const raw = input ? input.value : "";
      if (raw === "") return;
      const newVal = parseNumberInput(raw);
      const delta = newVal - r.prev;
      store.addSnapshot(r.inv.id, date, newVal, { silent: true });
      if (r.cash && Math.abs(delta) > 0.01) {
        const sourceSel = card.querySelector(`.mu-source[data-id="${r.inv.id}"]`);
        const source = sourceSel ? sourceSel.value : "deposit";
        const sourceLabel = CASH_SOURCE_OPTIONS.find((s) => s.id === source)?.label || "הפקדה";
        store.addTransaction(r.inv.id, {
          type: delta > 0 ? "deposit" : "withdrawal",
          date, amount: Math.abs(delta), source, note: sourceLabel,
        }, { silent: true });
      }
      count++;
    });
    store.saveAndEmit();
    showToast(`${count} עדכונים נשמרו`);
  });

  updatePreview();
  if (inputs[0]) inputs[0].focus();
}

function rowHtml(r) {
  const { inv, prev, cash } = r;
  const stale = freshnessDays(inv.id) > 30;
  return `
    <div class="mu-row2 ${cash ? "mu-row2-cash" : ""}">
      <div class="mu-row2-info">
        <span class="mu-row2-icon">${icon(TYPE_ICON[inv.type] || "package", { size: 15 })}</span>
        <div class="mu-row2-text">
          <div class="mu-row2-name">${escapeHtml(inv.name)}</div>
          <div class="mu-row2-meta text-muted small">
            ${cash ? "מזומן" : typeLabel(inv.type)} · ${fmtMoney(prev, inv.currency)}
            ${stale ? `<span class="mu-stale-badge">דורש עדכון</span>` : `<span>· ${freshnessLabel(store.latestSnapshot(inv.id, todayISO())?.date)}</span>`}
          </div>
        </div>
      </div>
      <div class="mu-row2-input">
        <input type="number" inputmode="decimal" class="mu-input" data-id="${inv.id}" placeholder="${Math.round(prev)}">
        ${cash ? `<select class="mu-source" data-id="${inv.id}">${CASH_SOURCE_OPTIONS.map((s) => `<option value="${s.id}">${s.label}</option>`).join("")}</select>` : ""}
      </div>
    </div>`;
}
