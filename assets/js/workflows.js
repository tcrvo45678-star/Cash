import { store, INVESTMENT_TYPES, CHART_PALETTE } from "./store.js";
import { icon, TYPE_ICON } from "./icons.js";
import { openModal, openDrawer, showToast, openActionSheet, confirmDialog, closeAllOverlays } from "./ui.js";
import { uid, todayISO, fmtMoney, fmtDate, parseNumberInput, el } from "./utils.js";
import { currentValue, currentNetContributions, typeLabel } from "./calc.js";
import { navigate } from "./router.js";

function recentInvestmentIds() {
  return store.settings.ui.recentInvestments || [];
}
function touchRecent(id) {
  const list = recentInvestmentIds().filter((x) => x !== id);
  list.unshift(id);
  store.setUiPref("recentInvestments", list.slice(0, 8));
}
function orderedActiveInvestments() {
  const active = store.activeInvestments();
  const recent = recentInvestmentIds();
  return [...active].sort((a, b) => {
    const ai = recent.indexOf(a.id), bi = recent.indexOf(b.id);
    if (ai === -1 && bi === -1) return a.name.localeCompare(b.name, "he");
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

// ---------- Global "+ New" menu ----------
export async function openNewMenu(defaultInvestmentId) {
  const key = await openActionSheet({
    title: "מה תרצה לעשות?",
    items: [
      { key: "new_investment", label: "השקעה חדשה", icon: "plus" },
      { key: "deposit", label: "הפקדה", icon: "arrow-down-right" },
      { key: "withdraw", label: "משיכה", icon: "arrow-up-right" },
      { key: "transfer", label: "העברה בין השקעות", icon: "arrow-left-right" },
      { key: "update_value", label: "עדכון שווי", icon: "pencil" },
    ],
  });
  if (!key) return;
  if (key === "new_investment") return openAddInvestmentFlow();
  if (key === "deposit") return openMoneyMoveFlow("deposit", defaultInvestmentId);
  if (key === "withdraw") return openMoneyMoveFlow("withdrawal", defaultInvestmentId);
  if (key === "transfer") return openTransferDialog(defaultInvestmentId);
  if (key === "update_value") return openUpdateValueFlow(defaultInvestmentId);
}

async function pickInvestment(title = "בחר השקעה") {
  const invs = orderedActiveInvestments();
  if (!invs.length) {
    showToast("אין עדיין השקעות פעילות");
    return null;
  }
  const key = await openActionSheet({
    title,
    items: invs.map((i) => ({ key: i.id, label: i.name, icon: TYPE_ICON[i.type] || "package" })),
  });
  return key;
}

async function openMoneyMoveFlow(type, investmentId) {
  const id = investmentId || (await pickInvestment(type === "deposit" ? "הפקדה לאיזו השקעה?" : "משיכה מאיזו השקעה?"));
  if (!id) return;
  openMoneyMoveDialog(id, type);
}

async function openUpdateValueFlow(investmentId) {
  const id = investmentId || (await pickInvestment("איזו השקעה לעדכן?"));
  if (!id) return;
  openQuickUpdateValueDialog(id);
}

export const quickDeposit = (investmentId) => openMoneyMoveFlow("deposit", investmentId);
export const quickWithdraw = (investmentId) => openMoneyMoveFlow("withdrawal", investmentId);
export const quickUpdateValue = (investmentId) => openUpdateValueFlow(investmentId);

// ---------- Add investment ----------
export function openAddInvestmentFlow() {
  const { close } = openModal({
    title: "איזו השקעה זו?",
    size: "md",
    body: renderTypePicker(),
  });
  document.querySelectorAll(".type-pick-card").forEach((card) => {
    card.addEventListener("click", () => {
      const type = card.dataset.type;
      close();
      openAddInvestmentDetailsForm(type);
    });
  });
}

function renderTypePicker() {
  return `<div class="type-grid">
    ${INVESTMENT_TYPES.map((t) => `
      <button class="type-pick-card" data-type="${t.id}">
        <span class="type-pick-icon">${icon(t.icon, { size: 26 })}</span>
        <span>${t.label}</span>
      </button>`).join("")}
  </div>`;
}

const TYPE_FIELDS = {
  stock_etf: ["ticker", "institution", "currency"],
  pension_fund: ["institution", "track"],
  study_fund: ["institution", "track"],
  cash_deposit: ["institution", "currency"],
  crypto: ["ticker", "currency"],
  real_estate: [],
  other: [],
};

function fieldHtml(key) {
  switch (key) {
    case "ticker": return `<div class="field"><label>Ticker</label><input type="text" name="ticker" placeholder="AAPL, VOO..."></div>`;
    case "institution": return `<div class="field"><label>גוף מנהל / ברוקר</label><input type="text" name="institution" placeholder="לדוגמה: אקסלנס, הפניקס..."></div>`;
    case "track": return `<div class="field"><label>מסלול</label><input type="text" name="track" placeholder="לדוגמה: מניות, כללי..."></div>`;
    case "currency": return `<div class="field"><label>מטבע</label>
      <select name="currency"><option value="ILS">שקל (₪)</option><option value="USD">דולר ($)</option><option value="EUR">יורו (€)</option></select></div>`;
    default: return "";
  }
}

function openAddInvestmentDetailsForm(type) {
  const typeMeta = INVESTMENT_TYPES.find((t) => t.id === type);
  const extraFields = TYPE_FIELDS[type] || [];
  const body = el(`<form class="stack-form">
    <div class="field"><label>שם ההשקעה *</label><input type="text" name="name" required placeholder="${typeMeta.label}" autofocus></div>
    ${extraFields.map(fieldHtml).join("")}
    <div class="field-row">
      <div class="field"><label>שווי נוכחי *</label><input type="number" inputmode="decimal" name="initialValue" required placeholder="0"></div>
      <div class="field"><label>סה״כ שהופקד (אופציונלי)</label><input type="number" inputmode="decimal" name="initialContribution" placeholder="0"></div>
    </div>
    <div class="field"><label>תאריך</label><input type="date" name="date" value="${todayISO()}"></div>
    <p class="field-hint">אפשר להשלים פרטים נוספים (מוסד, דמי ניהול, הערות) מאוחר יותר דרך "ערוך השקעה".</p>
  </form>`);

  const { close, el: modalEl } = openModal({
    title: `${typeMeta.label} חדשה`,
    size: "md",
    body,
    footer: `<button class="btn btn-ghost" data-act="back">חזור</button>
      <button class="btn btn-primary" data-act="save">שמור השקעה</button>`,
  });
  modalEl.querySelector('[data-act="back"]').onclick = () => { close(); openAddInvestmentFlow(); };
  modalEl.querySelector('[data-act="save"]').onclick = () => {
    const fd = new FormData(body);
    const name = (fd.get("name") || "").trim();
    const initialValue = fd.get("initialValue");
    if (!name) { showToast("צריך להזין שם להשקעה"); return; }
    if (initialValue === "" || initialValue == null) { showToast("צריך להזין שווי נוכחי"); return; }
    const inv = store.createInvestment({
      name, type,
      institution: fd.get("institution") || "",
      track: fd.get("track") || "",
      ticker: fd.get("ticker") || "",
      currency: fd.get("currency") || "ILS",
      initialValue: parseNumberInput(initialValue),
      initialContribution: fd.get("initialContribution") ? parseNumberInput(fd.get("initialContribution")) : null,
      date: fd.get("date") || todayISO(),
    });
    close();
    showToast(`${inv.name} נוספה להשקעות שלך`);
    navigate(`/investments/${inv.id}`);
  };
}

// ---------- Rename ----------
export function openRenameDialog(investmentId) {
  const inv = store.getInvestment(investmentId);
  if (!inv) return;
  const body = el(`<form class="stack-form">
    <div class="field"><label>שם ההשקעה</label><input type="text" name="name" value="${inv.name.replace(/"/g, "&quot;")}" autofocus></div>
  </form>`);
  const { close, el: modalEl } = openModal({
    title: "שינוי שם", size: "sm", body,
    footer: `<button class="btn btn-ghost" data-act="cancel">ביטול</button><button class="btn btn-primary" data-act="save">שמור</button>`,
  });
  const input = body.querySelector("input");
  input.focus();
  input.select();
  const submit = () => {
    const val = input.value.trim();
    if (!val) { showToast("השם לא יכול להיות ריק"); return; }
    store.renameInvestment(investmentId, val);
    close();
  };
  modalEl.querySelector('[data-act="save"]').onclick = submit;
  modalEl.querySelector('[data-act="cancel"]').onclick = () => close();
  body.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } });
}

// ---------- Deposit / Withdraw ----------
export function openMoneyMoveDialog(investmentId, type) {
  const inv = store.getInvestment(investmentId);
  if (!inv) return;
  const isDeposit = type === "deposit";
  const value = currentValue(investmentId);
  const body = el(`<form class="stack-form">
    <p class="dialog-sub">${isDeposit ? "הוספה ל" : "משיכה מ"}${inv.name}</p>
    <div class="field"><label>סכום (${inv.currency})</label><input type="number" inputmode="decimal" name="amount" required placeholder="0" autofocus></div>
    <div class="field"><label>תאריך</label><input type="date" name="date" value="${todayISO()}"></div>
    <div class="field toggle-field">
      <label>${isDeposit ? "השווי גדל בסכום ההפקדה?" : "השווי קטן בסכום המשיכה?"}</label>
      <div class="toggle-pair" data-toggle="applyToValue">
        <button type="button" class="on" data-val="yes">כן</button>
        <button type="button" data-val="no">לא</button>
      </div>
    </div>
    <div class="field"><label>הערה (אופציונלי)</label><input type="text" name="note" placeholder="הערה חופשית"></div>
    <p class="field-hint value-preview">שווי נוכחי: <strong>${fmtMoney(value, inv.currency)}</strong></p>
  </form>`);

  wireToggle(body, "applyToValue");

  const { close, el: modalEl } = openModal({
    title: isDeposit ? "הוספת כסף" : "משיכת כסף", size: "sm", body,
    footer: `<button class="btn btn-ghost" data-act="cancel">ביטול</button><button class="btn btn-primary" data-act="save">שמור</button>`,
  });
  modalEl.querySelector('[data-act="cancel"]').onclick = () => close();
  modalEl.querySelector('[data-act="save"]').onclick = () => {
    const fd = new FormData(body);
    const amount = parseNumberInput(fd.get("amount"));
    if (!amount) { showToast("צריך להזין סכום"); return; }
    const applyToValue = body.querySelector('[data-toggle="applyToValue"] .on').dataset.val === "yes";
    const date = fd.get("date") || todayISO();
    const note = fd.get("note") || "";
    let newValue = null;
    if (applyToValue) {
      newValue = isDeposit ? value + amount : Math.max(0, value - amount);
    }
    if (!isDeposit && amount > value * 1.001 && value > 0) {
      showToast(`שים לב: הסכום גבוה מהשווי הנוכחי (${fmtMoney(value, inv.currency)})`, { duration: 4000 });
    }
    const tx = store.addTransaction(investmentId, { type: isDeposit ? "deposit" : "withdrawal", date, amount, note, newValue });
    touchRecent(investmentId);
    close();
    const label = isDeposit ? "הפקדה" : "משיכה";
    showToast(`${label} של ${fmtMoney(amount, inv.currency)} נוספה`, {
      actionLabel: "בטל",
      onAction: () => { store.deleteTransaction(tx.id); showToast("הפעולה בוטלה"); },
    });
  };
}

function wireToggle(container, name) {
  const group = container.querySelector(`[data-toggle="${name}"]`);
  if (!group) return;
  group.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      group.querySelectorAll("button").forEach((b) => b.classList.remove("on"));
      btn.classList.add("on");
    });
  });
}

// ---------- Quick update value ----------
export function openQuickUpdateValueDialog(investmentId) {
  const inv = store.getInvestment(investmentId);
  if (!inv) return;
  const prevValue = currentValue(investmentId);
  const body = el(`<form class="stack-form">
    <p class="dialog-sub">עדכון שווי — ${inv.name}</p>
    <div class="field"><label>שווי קודם</label><input type="text" value="${fmtMoney(prevValue, inv.currency)}" disabled></div>
    <div class="field"><label>שווי חדש</label><input type="number" inputmode="decimal" name="newValue" required placeholder="0" value="${prevValue || ""}" autofocus></div>
    <div class="field"><label>תאריך</label><input type="date" name="date" value="${todayISO()}"></div>
    <p class="field-hint change-preview"></p>
  </form>`);

  const newValueInput = body.querySelector('[name="newValue"]');
  const preview = body.querySelector(".change-preview");
  const updatePreview = () => {
    const nv = parseNumberInput(newValueInput.value);
    const delta = nv - prevValue;
    preview.innerHTML = `שינוי: <strong class="${delta >= 0 ? "text-positive" : "text-negative"}">${fmtMoney(delta, inv.currency, { forceSign: true })}</strong>`;
  };
  newValueInput.addEventListener("input", updatePreview);
  updatePreview();
  newValueInput.select();

  const { close, el: modalEl } = openModal({
    title: "עדכון שווי", size: "sm", body,
    footer: `<button class="btn btn-ghost" data-act="cancel">ביטול</button><button class="btn btn-primary" data-act="save">עדכן</button>`,
  });
  modalEl.querySelector('[data-act="cancel"]').onclick = () => close();
  modalEl.querySelector('[data-act="save"]').onclick = () => {
    const fd = new FormData(body);
    const newValue = parseNumberInput(fd.get("newValue"));
    const date = fd.get("date") || todayISO();
    store.addSnapshot(investmentId, date, newValue);
    touchRecent(investmentId);
    close();
    showToast("השווי עודכן");
  };
}

// ---------- Transfer ----------
export function openTransferDialog(defaultFromId) {
  const invs = orderedActiveInvestments();
  if (invs.length < 2) { showToast("צריך לפחות שתי השקעות פעילות כדי להעביר ביניהן"); return; }
  const options = (selectedId) => invs.map((i) => `<option value="${i.id}" ${i.id === selectedId ? "selected" : ""}>${i.name}</option>`).join("");
  const body = el(`<form class="stack-form">
    <div class="field"><label>מ-</label><select name="fromId">${options(defaultFromId || invs[0].id)}</select></div>
    <div class="field"><label>אל</label><select name="toId">${options(invs[1].id)}</select></div>
    <div class="field"><label>סכום</label><input type="number" inputmode="decimal" name="amount" required placeholder="0" autofocus></div>
    <div class="field"><label>תאריך</label><input type="date" name="date" value="${todayISO()}"></div>
    <div class="field"><label>הערה (אופציונלי)</label><input type="text" name="note"></div>
  </form>`);
  const { close, el: modalEl } = openModal({
    title: "העברה בין השקעות", size: "sm", body,
    footer: `<button class="btn btn-ghost" data-act="cancel">ביטול</button><button class="btn btn-primary" data-act="save">בצע העברה</button>`,
  });
  modalEl.querySelector('[data-act="cancel"]').onclick = () => close();
  modalEl.querySelector('[data-act="save"]').onclick = () => {
    const fd = new FormData(body);
    const fromId = fd.get("fromId"), toId = fd.get("toId");
    const amount = parseNumberInput(fd.get("amount"));
    if (fromId === toId) { showToast("צריך לבחור שתי השקעות שונות"); return; }
    if (!amount) { showToast("צריך להזין סכום"); return; }
    store.transfer({ fromId, toId, amount, date: fd.get("date") || todayISO(), note: fd.get("note") });
    close();
    showToast("ההעברה בוצעה");
  };
}

// ---------- Edit investment (drawer) ----------
export function openEditInvestmentDrawer(investmentId) {
  const inv = store.getInvestment(investmentId);
  if (!inv) return;
  const body = el(`<form class="stack-form drawer-form">
    <section class="form-section">
      <h4>בסיסי</h4>
      <div class="field"><label>שם ההשקעה</label><input type="text" name="name" value="${escAttr(inv.name)}"></div>
      <div class="field"><label>סוג</label><select name="type">${INVESTMENT_TYPES.map((t) => `<option value="${t.id}" ${t.id === inv.type ? "selected" : ""}>${t.label}</option>`).join("")}</select></div>
      <div class="field-row">
        <div class="field"><label>גוף מנהל</label><input type="text" name="institution" value="${escAttr(inv.institution)}"></div>
        <div class="field"><label>חשבון</label><input type="text" name="accountLabel" value="${escAttr(inv.accountLabel)}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>מטבע</label><select name="currency"><option value="ILS" ${inv.currency === "ILS" ? "selected" : ""}>שקל (₪)</option><option value="USD" ${inv.currency === "USD" ? "selected" : ""}>דולר ($)</option><option value="EUR" ${inv.currency === "EUR" ? "selected" : ""}>יורו (€)</option></select></div>
        <div class="field"><label>Ticker</label><input type="text" name="ticker" value="${escAttr(inv.ticker)}"></div>
      </div>
    </section>
    <section class="form-section">
      <h4>סיווג ומיסוי</h4>
      <div class="field-row">
        <div class="field"><label>מיסוי</label><select name="taxType"><option value="taxable" ${inv.taxType === "taxable" ? "selected" : ""}>חייב במס</option><option value="exempt" ${inv.taxType === "exempt" ? "selected" : ""}>פטור ממס</option></select></div>
        <div class="field"><label>נזילות</label><select name="liquidity"><option value="liquid" ${inv.liquidity === "liquid" ? "selected" : ""}>נזיל</option><option value="illiquid" ${inv.liquidity === "illiquid" ? "selected" : ""}>לא נזיל</option></select></div>
      </div>
      <div class="field-row">
        <div class="field"><label>מסלול</label><input type="text" name="track" value="${escAttr(inv.track)}"></div>
        <div class="field"><label>דמי ניהול (%)</label><input type="number" step="0.01" inputmode="decimal" name="feeRate" value="${inv.feeRate ?? ""}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>קטגוריה</label><input type="text" name="category" value="${escAttr(inv.category)}"></div>
        <div class="field"><label>חשיפה</label><input type="text" name="exposure" value="${escAttr(inv.exposure)}" placeholder="S&P 500, ישראל..."></div>
      </div>
    </section>
    <section class="form-section">
      <h4>שוק, תחום ושער חליפין</h4>
      <p class="field-hint">אופציונלי — משמש לפילוחים ולגרף רווח/הפסד משער חליפין במסך הניתוח (שימושי בעיקר לאחזקות בודדות כמו מניות/ETF).</p>
      <div class="field-row">
        <div class="field"><label>שוק</label><input type="text" name="market" value="${escAttr(inv.market)}" placeholder="ארה״ב, ישראל..."></div>
        <div class="field"><label>תחום</label><input type="text" name="sector" value="${escAttr(inv.sector)}" placeholder="טכנולוגיה, מדד רחב..."></div>
      </div>
      <div class="field"><label>שער דולר-שקל ברכישה</label><input type="number" step="0.001" inputmode="decimal" name="purchaseRate" value="${inv.purchaseRate ?? ""}" placeholder="רלוונטי רק למטבע דולר"></div>
    </section>
    <section class="form-section">
      <h4>עיצוב ותצוגה</h4>
      <div class="field"><label>צבע בגרפים</label>
        <div class="color-swatches" data-select="color">
          ${CHART_PALETTE.map((c) => `<button type="button" class="color-swatch ${c === inv.color ? "selected" : ""}" data-color="${c}" style="background:${c}"></button>`).join("")}
        </div>
      </div>
      <div class="field checkbox-field">
        <label><input type="checkbox" name="excludeFromTotals" ${inv.excludeFromTotals ? "checked" : ""}> להחריג מסך ההון הכולל (מעקב בלבד)</label>
      </div>
    </section>
    <section class="form-section">
      <h4>הערות</h4>
      <div class="field"><textarea name="notes" rows="3">${inv.notes || ""}</textarea></div>
    </section>
  </form>`);

  let selectedColor = inv.color;
  body.querySelectorAll(".color-swatch").forEach((sw) => {
    sw.addEventListener("click", () => {
      body.querySelectorAll(".color-swatch").forEach((s) => s.classList.remove("selected"));
      sw.classList.add("selected");
      selectedColor = sw.dataset.color;
    });
  });

  const { close, el: drawerEl } = openDrawer({
    title: "עריכת השקעה",
    body,
    footer: `<button class="btn btn-ghost" data-act="cancel">ביטול</button><button class="btn btn-primary" data-act="save">שמור שינויים</button>`,
  });
  drawerEl.querySelector('[data-act="cancel"]').onclick = () => close();
  drawerEl.querySelector('[data-act="save"]').onclick = () => {
    const fd = new FormData(body);
    store.updateInvestment(investmentId, {
      name: (fd.get("name") || inv.name).trim() || inv.name,
      type: fd.get("type"),
      institution: fd.get("institution") || "",
      accountLabel: fd.get("accountLabel") || "",
      currency: fd.get("currency") || "ILS",
      ticker: fd.get("ticker") || "",
      taxType: fd.get("taxType"),
      liquidity: fd.get("liquidity"),
      track: fd.get("track") || "",
      feeRate: fd.get("feeRate") ? parseNumberInput(fd.get("feeRate")) : null,
      category: fd.get("category") || "",
      exposure: fd.get("exposure") || "",
      market: fd.get("market") || "",
      sector: fd.get("sector") || "",
      purchaseRate: fd.get("purchaseRate") ? parseNumberInput(fd.get("purchaseRate")) : null,
      color: selectedColor,
      excludeFromTotals: fd.get("excludeFromTotals") === "on",
      notes: fd.get("notes") || "",
    });
    close();
    showToast("ההשקעה עודכנה");
  };
}

function escAttr(s) {
  return (s || "").replace(/"/g, "&quot;");
}

// ---------- Archive / Delete ----------
export async function openInvestmentMoreMenu(investmentId) {
  const inv = store.getInvestment(investmentId);
  if (!inv) return;
  const key = await openActionSheet({
    title: inv.name,
    items: [
      { key: "edit", label: "ערוך השקעה", icon: "pencil" },
      { key: "archive", label: inv.archived ? "הוצא מארכיון" : "העבר לארכיון", icon: "archive" },
      { key: "delete", label: "מחיקה מלאה", icon: "trash-2", danger: true },
    ],
  });
  if (key === "edit") openEditInvestmentDrawer(investmentId);
  if (key === "archive") {
    if (inv.archived) { store.unarchiveInvestment(investmentId); showToast("ההשקעה הוחזרה לפעילות"); }
    else {
      const ok = await confirmDialog({
        title: "העברה לארכיון",
        message: `"${inv.name}" תועבר לארכיון. ההיסטוריה תישמר במלואה ואפשר להחזיר בכל עת.`,
        confirmLabel: "העבר לארכיון",
      });
      if (ok) { store.archiveInvestment(investmentId); showToast("ההשקעה הועברה לארכיון"); navigate("/investments"); }
    }
  }
  if (key === "delete") {
    const ok = await confirmDialog({
      title: "מחיקה מלאה",
      message: `פעולה זו תמחק לצמיתות את "${inv.name}" וכל ההיסטוריה, העסקאות והגרפים שלה. לא ניתן לשחזר. מומלץ להשתמש בארכוב במקום, אלא אם ההשקעה הוזנה בטעות.`,
      confirmLabel: "מחק לצמיתות",
      danger: true,
    });
    if (ok) { store.deleteInvestment(investmentId); showToast("ההשקעה נמחקה"); navigate("/investments"); }
  }
}

export function openInvestmentQuickActions(investmentId) {
  openActionSheet({
    title: store.getInvestment(investmentId)?.name,
    items: [
      { key: "update_value", label: "עדכן שווי", icon: "pencil" },
      { key: "deposit", label: "הוסף כסף", icon: "arrow-down-right" },
      { key: "withdraw", label: "משוך כסף", icon: "arrow-up-right" },
      { key: "edit", label: "ערוך השקעה", icon: "sliders-horizontal" },
      { key: "more", label: "עוד אפשרויות", icon: "ellipsis" },
    ],
  }).then((key) => {
    if (key === "update_value") openQuickUpdateValueDialog(investmentId);
    if (key === "deposit") openMoneyMoveDialog(investmentId, "deposit");
    if (key === "withdraw") openMoneyMoveDialog(investmentId, "withdrawal");
    if (key === "edit") openEditInvestmentDrawer(investmentId);
    if (key === "more") openInvestmentMoreMenu(investmentId);
  });
}

// ---------- Monthly update center ----------
export function openMonthlyUpdateCenter() {
  const invs = orderedActiveInvestments().filter((i) => !i.excludeFromTotals);
  if (!invs.length) { showToast("אין השקעות פעילות לעדכן"); return; }

  const rows = invs.map((inv) => {
    const prev = currentValue(inv.id);
    return { inv, prev };
  });

  const body = el(`<div class="monthly-update">
    <p class="dialog-sub">עדכן את השווי הנוכחי לכל השקעה. אפשר לדלג על שדה עם Tab / Enter.</p>
    <div class="monthly-update-table">
      <div class="mu-row mu-head"><div>השקעה</div><div>שווי קודם</div><div>שווי חדש</div></div>
      ${rows.map((r, idx) => `
        <div class="mu-row" data-id="${r.inv.id}">
          <div class="mu-name">${r.inv.name}</div>
          <div class="mu-prev">${fmtMoney(r.prev, r.inv.currency)}</div>
          <div><input type="number" inputmode="decimal" class="mu-input" data-idx="${idx}" placeholder="${fmtMoney(r.prev, r.inv.currency)}"></div>
        </div>`).join("")}
    </div>
    <div class="monthly-update-preview"></div>
  </div>`);

  const inputs = Array.from(body.querySelectorAll(".mu-input"));
  const preview = body.querySelector(".monthly-update-preview");

  function updatePreview() {
    let prevTotal = 0, newTotal = 0, changedCount = 0;
    rows.forEach((r, idx) => {
      prevTotal += r.prev;
      const raw = inputs[idx].value;
      newTotal += raw !== "" ? parseNumberInput(raw) : r.prev;
      if (raw !== "") changedCount++;
    });
    const change = newTotal - prevTotal;
    preview.innerHTML = changedCount ? `
      <div class="mu-preview-row"><span>שווי קודם</span><strong>${fmtMoney(prevTotal)}</strong></div>
      <div class="mu-preview-row"><span>שווי חדש</span><strong>${fmtMoney(newTotal)}</strong></div>
      <div class="mu-preview-row"><span>שינוי</span><strong class="${change >= 0 ? "text-positive" : "text-negative"}">${fmtMoney(change, "ILS", { forceSign: true })}</strong></div>
    ` : "";
    saveBtn.textContent = changedCount ? `שמור ${changedCount} עדכונים` : "שמור עדכונים";
    saveBtn.disabled = !changedCount;
  }

  inputs.forEach((inp, idx) => {
    inp.addEventListener("input", updatePreview);
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const next = inputs[idx + 1];
        if (next) next.focus(); else saveBtn.focus();
      }
    });
  });

  const { close, el: modalEl } = openModal({
    title: "עדכון חודשי", size: "lg", body,
    footer: `<button class="btn btn-ghost" data-act="cancel">ביטול</button><button class="btn btn-primary" data-act="save" disabled>שמור עדכונים</button>`,
  });
  const saveBtn = modalEl.querySelector('[data-act="save"]');
  modalEl.querySelector('[data-act="cancel"]').onclick = () => close();
  saveBtn.onclick = () => {
    const date = todayISO();
    let count = 0;
    rows.forEach((r, idx) => {
      const raw = inputs[idx].value;
      if (raw !== "") { store.addSnapshot(r.inv.id, date, parseNumberInput(raw), { silent: true }); count++; }
    });
    store.saveAndEmit();
    close();
    showToast(`${count} עדכונים נשמרו`);
  };
  updatePreview();
  if (inputs[0]) inputs[0].focus();
}
