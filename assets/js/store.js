import { uid, nowISO, todayISO } from "./utils.js";

export const DATA_KEY = "wealth:v1:data";
export const SETTINGS_KEY = "wealth:v1:settings";

export const INVESTMENT_TYPES = [
  { id: "stock_etf", label: "מניה / ETF", icon: "trending-up" },
  { id: "pension_fund", label: "קופת גמל / פנסיה", icon: "landmark" },
  { id: "study_fund", label: "קרן השתלמות", icon: "piggy-bank" },
  { id: "cash_deposit", label: "מזומן / פיקדון", icon: "banknote" },
  { id: "crypto", label: "קריפטו", icon: "bitcoin" },
  { id: "real_estate", label: "נדל״ן", icon: "house" },
  { id: "other", label: "אחר", icon: "package" },
];

export const CHART_PALETTE = [
  "#245E48", "#B69560", "#5C7A94", "#8C4A38", "#4F8C82",
  "#9B6B5C", "#7A8FA6", "#A0895A", "#6B8F71", "#B0567A",
];

function defaultData() {
  return {
    version: 1,
    investments: [],
    transactions: [],
    snapshots: [],
    goals: [],
    meta: { createdAt: nowISO(), migratedFromLegacy: false, migratedAt: null },
  };
}

function defaultSettings() {
  return {
    theme: "system",
    sheetsUrl: "",
    ui: {
      investmentsView: "cards",
      dashboardRange: "1Y",
      investmentRange: "ALL",
      lastFilters: {},
    },
  };
}

class Store {
  constructor() {
    this.data = defaultData();
    this.settings = defaultSettings();
    this.listeners = new Set();
  }

  load() {
    try {
      const raw = localStorage.getItem(DATA_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.data = { ...defaultData(), ...parsed };
      }
    } catch (e) {
      console.error("failed to load data", e);
    }
    try {
      const rawS = localStorage.getItem(SETTINGS_KEY);
      if (rawS) {
        const parsed = JSON.parse(rawS);
        this.settings = { ...defaultSettings(), ...parsed, ui: { ...defaultSettings().ui, ...(parsed.ui || {}) } };
      }
    } catch (e) {
      console.error("failed to load settings", e);
    }
  }

  persist() {
    localStorage.setItem(DATA_KEY, JSON.stringify(this.data));
  }

  persistSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    this.listeners.forEach((fn) => fn());
  }

  saveAndEmit() {
    this.persist();
    this.emit();
  }

  // ---------- Investments ----------
  activeInvestments() {
    return this.data.investments.filter((i) => !i.archived);
  }

  archivedInvestments() {
    return this.data.investments.filter((i) => i.archived);
  }

  getInvestment(id) {
    return this.data.investments.find((i) => i.id === id) || null;
  }

  createInvestment(fields) {
    const inv = {
      id: uid(),
      name: fields.name || "השקעה חדשה",
      type: fields.type || "other",
      institution: fields.institution || "",
      accountLabel: fields.accountLabel || "",
      currency: fields.currency || "ILS",
      feeRate: fields.feeRate ?? null,
      track: fields.track || "",
      ticker: fields.ticker || "",
      taxType: fields.taxType || "taxable",
      liquidity: fields.liquidity || "liquid",
      category: fields.category || "",
      exposure: fields.exposure || "",
      icon: fields.icon || null,
      color: fields.color || CHART_PALETTE[this.data.investments.length % CHART_PALETTE.length],
      notes: fields.notes || "",
      excludeFromTotals: !!fields.excludeFromTotals,
      archived: false,
      archivedAt: null,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    this.data.investments.push(inv);

    const initialValue = fields.initialValue;
    if (initialValue != null && initialValue !== "") {
      this.addSnapshot(inv.id, fields.date || todayISO(), Number(initialValue), { silent: true });
    }
    const initialContribution = fields.initialContribution;
    if (initialContribution != null && initialContribution !== "" && Number(initialContribution) !== 0) {
      this.addTransaction(inv.id, {
        type: "deposit",
        date: fields.date || todayISO(),
        amount: Number(initialContribution),
        note: "יתרת פתיחה",
      }, { silent: true });
    }
    this.saveAndEmit();
    return inv;
  }

  updateInvestment(id, patch) {
    const inv = this.getInvestment(id);
    if (!inv) return;
    Object.assign(inv, patch, { updatedAt: nowISO() });
    this.saveAndEmit();
  }

  renameInvestment(id, name) {
    this.updateInvestment(id, { name });
  }

  archiveInvestment(id) {
    this.updateInvestment(id, { archived: true, archivedAt: nowISO() });
  }

  unarchiveInvestment(id) {
    this.updateInvestment(id, { archived: false, archivedAt: null });
  }

  deleteInvestment(id) {
    this.data.investments = this.data.investments.filter((i) => i.id !== id);
    this.data.transactions = this.data.transactions.filter((t) => t.investmentId !== id);
    this.data.snapshots = this.data.snapshots.filter((s) => s.investmentId !== id);
    this.saveAndEmit();
  }

  // ---------- Snapshots ----------
  snapshotsFor(investmentId) {
    return this.data.snapshots
      .filter((s) => s.investmentId === investmentId)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  latestSnapshot(investmentId, onOrBefore) {
    const list = this.snapshotsFor(investmentId).filter((s) => !onOrBefore || s.date <= onOrBefore);
    return list.length ? list[list.length - 1] : null;
  }

  addSnapshot(investmentId, date, value, opts = {}) {
    const existing = this.data.snapshots.find((s) => s.investmentId === investmentId && s.date === date);
    let snap;
    if (existing) {
      existing.value = value;
      snap = existing;
    } else {
      snap = { id: uid(), investmentId, date, value, createdAt: nowISO() };
      this.data.snapshots.push(snap);
    }
    this.updateInvestment(investmentId, {});
    if (!opts.silent) this.saveAndEmit();
    return snap;
  }

  updateSnapshot(id, patch) {
    const s = this.data.snapshots.find((x) => x.id === id);
    if (!s) return;
    Object.assign(s, patch);
    this.saveAndEmit();
  }

  deleteSnapshot(id) {
    this.data.snapshots = this.data.snapshots.filter((s) => s.id !== id);
    this.saveAndEmit();
  }

  // ---------- Transactions ----------
  transactionsFor(investmentId) {
    return this.data.transactions
      .filter((t) => t.investmentId === investmentId)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  addTransaction(investmentId, fields, opts = {}) {
    const inv = this.getInvestment(investmentId);
    const tx = {
      id: uid(),
      investmentId,
      type: fields.type,
      date: fields.date || todayISO(),
      amount: Math.abs(Number(fields.amount) || 0),
      currency: fields.currency || (inv ? inv.currency : "ILS"),
      note: fields.note || "",
      linkedTransactionId: fields.linkedTransactionId || null,
      createdAt: nowISO(),
    };
    this.data.transactions.push(tx);
    if (fields.newValue != null && fields.newValue !== "") {
      this.addSnapshot(investmentId, tx.date, Number(fields.newValue), { silent: true });
    }
    if (!opts.silent) this.saveAndEmit();
    return tx;
  }

  updateTransaction(id, patch) {
    const t = this.data.transactions.find((x) => x.id === id);
    if (!t) return;
    Object.assign(t, patch);
    this.saveAndEmit();
  }

  deleteTransaction(id) {
    this.data.transactions = this.data.transactions.filter((t) => t.id !== id);
    this.saveAndEmit();
  }

  transfer({ fromId, toId, amount, date, note }) {
    const wd = this.addTransaction(fromId, { type: "transfer_out", date, amount, note: note || "העברה" }, { silent: true });
    const dep = this.addTransaction(toId, { type: "transfer_in", date, amount, note: note || "העברה", linkedTransactionId: wd.id }, { silent: true });
    this.updateTransaction(wd.id, { linkedTransactionId: dep.id });
    this.saveAndEmit();
    return { wd, dep };
  }

  allActivity() {
    const txs = this.data.transactions.map((t) => ({ kind: "transaction", ...t }));
    const snaps = this.data.snapshots.map((s) => ({ kind: "snapshot", ...s, date: s.date }));
    return [...txs, ...snaps].sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || "").localeCompare(a.createdAt || ""));
  }

  // ---------- Goals ----------
  addGoal(fields) {
    const g = { id: uid(), name: fields.name, targetAmount: Number(fields.targetAmount) || 0, targetDate: fields.targetDate || null, createdAt: nowISO() };
    this.data.goals.push(g);
    this.saveAndEmit();
    return g;
  }

  updateGoal(id, patch) {
    const g = this.data.goals.find((x) => x.id === id);
    if (!g) return;
    Object.assign(g, patch);
    this.saveAndEmit();
  }

  deleteGoal(id) {
    this.data.goals = this.data.goals.filter((g) => g.id !== id);
    this.saveAndEmit();
  }

  // ---------- Settings ----------
  setTheme(theme) {
    this.settings.theme = theme;
    this.persistSettings();
    this.emit();
  }

  setUiPref(key, value) {
    this.settings.ui[key] = value;
    this.persistSettings();
  }

  setSheetsUrl(url) {
    this.settings.sheetsUrl = url;
    this.persistSettings();
  }

  replaceAllData(newData) {
    this.data = { ...defaultData(), ...newData };
    this.saveAndEmit();
  }
}

export const store = new Store();
