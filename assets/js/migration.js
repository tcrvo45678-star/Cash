import { uid, nowISO } from "./utils.js";

export const LEGACY_KEY = "finance-tracker-v7";
export const LEGACY_SHEETS_KEY = "finance-tracker-sheets-url";
const LEGACY_BACKUP_PREFIX = "wealth:legacy-backup:";

function guessType(name) {
  const n = name || "";
  if (/גמל|פנסי/.test(n)) return "pension_fund";
  if (/השתלמות/.test(n)) return "study_fund";
  if (/מזומן|עובר ושב|פיקדון/.test(n)) return "cash_deposit";
  if (/מניה|אקסלנס|תיק|מדד|ETF|S&P|נאסד/i.test(n)) return "stock_etf";
  if (/ביטקוין|קריפטו|BTC|ETH/i.test(n)) return "crypto";
  if (/נדל/i.test(n)) return "real_estate";
  return "other";
}

export function readLegacyRaw() {
  let legacy = null;
  let sheetsUrl = "";
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (raw) legacy = JSON.parse(raw);
  } catch (e) { /* ignore */ }
  try {
    sheetsUrl = localStorage.getItem(LEGACY_SHEETS_KEY) || "";
  } catch (e) { /* ignore */ }
  return { legacy, sheetsUrl };
}

export function detectLegacyData() {
  const { legacy } = readLegacyRaw();
  if (!legacy || !legacy.channels || !legacy.channels.length) return null;
  let snapshotCount = 0;
  Object.values(legacy.entries || {}).forEach((list) => { snapshotCount += (list || []).length; });
  return {
    channelsCount: legacy.channels.length,
    snapshotsCount: snapshotCount,
    holdingsCount: (legacy.holdings || []).length,
  };
}

export function alreadyMigrated() {
  return Object.keys(localStorage).some((k) => k.startsWith(LEGACY_BACKUP_PREFIX));
}

function buildDepositTransactionsFromCumulative(investmentId, entries) {
  const txs = [];
  const sorted = [...entries].sort((a, b) => a.month.localeCompare(b.month));
  let prevDeposited = 0;
  sorted.forEach((e, idx) => {
    const cumulative = Number(e.deposited) || 0;
    const delta = cumulative - prevDeposited;
    const date = `${e.month}-01`;
    if (idx === 0 && cumulative > 0) {
      txs.push({
        id: uid(), investmentId, type: "deposit", date, amount: cumulative, currency: "ILS",
        note: "יובא מהמערכת הקודמת - סך הפקדות מצטבר עד לחודש זה", linkedTransactionId: null, createdAt: nowISO(),
      });
    } else if (delta > 0.01) {
      txs.push({
        id: uid(), investmentId, type: "deposit", date, amount: delta, currency: "ILS",
        note: "יובא מהמערכת הקודמת", linkedTransactionId: null, createdAt: nowISO(),
      });
    } else if (delta < -0.01) {
      txs.push({
        id: uid(), investmentId, type: "withdrawal", date, amount: Math.abs(delta), currency: "ILS",
        note: "יובא מהמערכת הקודמת", linkedTransactionId: null, createdAt: nowISO(),
      });
    }
    prevDeposited = cumulative;
  });
  return txs;
}

function buildSnapshotsFromEntries(investmentId, entries, valueField) {
  return entries.map((e) => ({
    id: uid(), investmentId, date: `${e.month}-01`, value: Number(e[valueField]) || 0, createdAt: nowISO(),
  }));
}

export function convertLegacyToNewData(legacy) {
  const investments = [];
  const transactions = [];
  const snapshots = [];
  const idMap = {};

  const hasHoldingsForExcellence = (legacy.holdings || []).length > 0;

  legacy.channels.forEach((ch) => {
    const newId = uid();
    idMap[ch.id] = newId;
    const entries = (legacy.entries && legacy.entries[ch.id]) || [];
    const isExcellenceWithHoldings = ch.isMulti && hasHoldingsForExcellence;

    const inv = {
      id: newId,
      name: ch.name,
      type: guessType(ch.name),
      institution: "",
      accountLabel: "",
      currency: "ILS",
      feeRate: ch.feePct ?? null,
      track: "",
      ticker: "",
      taxType: ch.taxable ? "taxable" : "exempt",
      liquidity: ch.liquid ? "liquid" : "illiquid",
      category: ch.classification === "maintenance" ? "בתחזוקה" : ch.classification === "inactive" ? "לא פעיל (יובא)" : "",
      exposure: "",
      icon: null,
      color: null,
      notes: ch.description || "",
      excludeFromTotals: false,
      archived: isExcellenceWithHoldings,
      archivedAt: isExcellenceWithHoldings ? nowISO() : null,
      createdAt: nowISO(),
      updatedAt: nowISO(),
      legacyId: ch.id,
    };
    if (isExcellenceWithHoldings) {
      inv.notes = (inv.notes ? inv.notes + " · " : "") + "מוזג לפירוט אחזקות בעת המעבר למערכת החדשה";
    }
    investments.push(inv);

    if (entries.length) {
      snapshots.push(...buildSnapshotsFromEntries(newId, entries, "balance"));
      transactions.push(...buildDepositTransactionsFromCumulative(newId, entries));
    }
  });

  (legacy.holdings || []).forEach((h) => {
    const newId = uid();
    idMap[h.id] = newId;
    const entries = (legacy.entries && legacy.entries[h.id]) || [];
    const isUSD = h.currency === "USD";
    const rate = 3.7;

    const inv = {
      id: newId,
      name: h.name,
      type: "stock_etf",
      institution: "אקסלנס",
      accountLabel: "אקסלנס",
      currency: h.currency || "ILS",
      feeRate: h.feePct ?? null,
      track: "",
      ticker: "",
      taxType: "taxable",
      liquidity: "liquid",
      category: [h.market, h.sector].filter(Boolean).join(" · "),
      exposure: h.sector || "",
      icon: null,
      color: null,
      notes: "יובא כפירוט אחזקה מתוך אקסלנס (מעקב בלבד, לא נכלל אוטומטית בסך ההון עד לאישור)",
      excludeFromTotals: true,
      archived: false,
      archivedAt: null,
      createdAt: nowISO(),
      updatedAt: nowISO(),
      legacyId: h.id,
    };
    investments.push(inv);

    const sorted = [...entries].sort((a, b) => a.month.localeCompare(b.month));
    let prevDeposited = 0;
    sorted.forEach((e, idx) => {
      const rawBalance = Number(e.rawBalance) || 0;
      const balanceILS = isUSD ? rawBalance * rate : rawBalance;
      const pctChange = e.pctChange;
      const deposited = (pctChange != null && pctChange !== -100) ? balanceILS / (1 + pctChange / 100) : balanceILS;
      const date = `${e.month}-01`;
      snapshots.push({ id: uid(), investmentId: newId, date, value: Math.round(balanceILS), createdAt: nowISO() });
      const delta = deposited - prevDeposited;
      if (idx === 0 && deposited > 0) {
        transactions.push({ id: uid(), investmentId: newId, type: "deposit", date, amount: Math.round(deposited), currency: "ILS", note: "יובא מהמערכת הקודמת (משוער מאחוז שינוי)", linkedTransactionId: null, createdAt: nowISO() });
      } else if (delta > 0.5) {
        transactions.push({ id: uid(), investmentId: newId, type: "deposit", date, amount: Math.round(delta), currency: "ILS", note: "יובא מהמערכת הקודמת (משוער)", linkedTransactionId: null, createdAt: nowISO() });
      } else if (delta < -0.5) {
        transactions.push({ id: uid(), investmentId: newId, type: "withdrawal", date, amount: Math.round(Math.abs(delta)), currency: "ILS", note: "יובא מהמערכת הקודמת (משוער)", linkedTransactionId: null, createdAt: nowISO() });
      }
      prevDeposited = deposited;
    });
  });

  return {
    version: 1,
    investments,
    transactions,
    snapshots,
    goals: [],
    meta: { createdAt: nowISO(), migratedFromLegacy: true, migratedAt: nowISO() },
  };
}

export function performMigration() {
  const { legacy, sheetsUrl } = readLegacyRaw();
  if (!legacy) return null;
  const backupKey = LEGACY_BACKUP_PREFIX + Date.now();
  localStorage.setItem(backupKey, JSON.stringify(legacy));
  const newData = convertLegacyToNewData(legacy);
  return { newData, sheetsUrl };
}

export function downloadLegacyBackup() {
  const { legacy } = readLegacyRaw();
  if (!legacy) return;
  const blob = new Blob([JSON.stringify(legacy, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `legacy-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
