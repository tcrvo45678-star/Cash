import { store, INVESTMENT_TYPES } from "./store.js";
import { monthKey, addMonthsToKey, todayISO, daysAgo } from "./utils.js";

export const TX_TYPE_META = {
  deposit: { label: "הפקדה", sign: 1, contributes: true },
  withdrawal: { label: "משיכה", sign: -1, contributes: true },
  buy: { label: "קנייה", sign: 1, contributes: true },
  sell: { label: "מכירה", sign: -1, contributes: true },
  transfer_in: { label: "העברה נכנסת", sign: 1, contributes: true },
  transfer_out: { label: "העברה יוצאת", sign: -1, contributes: true },
  dividend: { label: "דיבידנד", sign: 1, contributes: false },
  interest: { label: "ריבית", sign: 1, contributes: false },
  fee: { label: "עמלה", sign: -1, contributes: false },
  tax: { label: "מס", sign: -1, contributes: false },
};

export function valueOfInvestmentAt(investmentId, dateISO) {
  const snap = store.latestSnapshot(investmentId, dateISO);
  return snap ? snap.value : 0;
}

export function currentValue(investmentId) {
  return valueOfInvestmentAt(investmentId, todayISO());
}

export function netContributionsAt(investmentId, dateISO) {
  const txs = store.transactionsFor(investmentId).filter((t) => t.date <= dateISO);
  let sum = 0;
  txs.forEach((t) => {
    const meta = TX_TYPE_META[t.type];
    if (meta && meta.contributes) sum += meta.sign * t.amount;
  });
  return sum;
}

export function currentNetContributions(investmentId) {
  return netContributionsAt(investmentId, todayISO());
}

export function investmentGain(investmentId, dateISO = todayISO()) {
  const value = valueOfInvestmentAt(investmentId, dateISO);
  const contrib = netContributionsAt(investmentId, dateISO);
  return value - contrib;
}

export function investmentReturnPct(investmentId, dateISO = todayISO()) {
  const contrib = netContributionsAt(investmentId, dateISO);
  const gain = investmentGain(investmentId, dateISO);
  if (Math.abs(contrib) < 1) return null;
  return (gain / contrib) * 100;
}

export function investmentStats(investmentId) {
  const value = currentValue(investmentId);
  const contrib = currentNetContributions(investmentId);
  const gain = value - contrib;
  const returnPct = Math.abs(contrib) < 1 ? null : (gain / contrib) * 100;
  const lastSnap = store.latestSnapshot(investmentId, todayISO());
  return { value, contrib, gain, returnPct, lastUpdate: lastSnap ? lastSnap.date : null };
}

function includedInvestments(opts = {}) {
  const { includeArchived = false, includeExcluded = false } = opts;
  return store.data.investments.filter((i) => (includeArchived || !i.archived) && (includeExcluded || !i.excludeFromTotals));
}

export function portfolioValueAt(dateISO, opts = {}) {
  const invs = includedInvestments(opts);
  let total = 0;
  invs.forEach((inv) => {
    if (inv.archived && inv.archivedAt && inv.archivedAt.slice(0, 10) < dateISO) return;
    const snap = store.latestSnapshot(inv.id, dateISO);
    if (snap) total += snap.value;
  });
  return total;
}

export function portfolioNetContributionsAt(dateISO, opts = {}) {
  const invs = includedInvestments(opts);
  let total = 0;
  invs.forEach((inv) => {
    if (inv.archived && inv.archivedAt && inv.archivedAt.slice(0, 10) < dateISO) return;
    total += netContributionsAt(inv.id, dateISO);
  });
  return total;
}

const CAPITAL_GAINS_TAX_RATE = 0.25;

export function usdIlsRate() {
  return store.settings.fxRateUsdIls || 3.7;
}

export function valueInILS(inv, value) {
  if (inv.currency === "USD") return value * usdIlsRate();
  return value;
}

export function estimatedTax(investmentId, dateISO = todayISO()) {
  const inv = store.getInvestment(investmentId);
  if (!inv || inv.taxType !== "taxable") return 0;
  const gain = investmentGain(investmentId, dateISO);
  return Math.max(0, gain) * CAPITAL_GAINS_TAX_RATE;
}

export function portfolioEstimatedTax(dateISO = todayISO(), opts = {}) {
  const invs = includedInvestments(opts);
  let total = 0;
  invs.forEach((inv) => {
    if (inv.archived && inv.archivedAt && inv.archivedAt.slice(0, 10) < dateISO) return;
    total += estimatedTax(inv.id, dateISO);
  });
  return total;
}

export function currentPortfolioStats() {
  const today = todayISO();
  const value = portfolioValueAt(today);
  const contrib = portfolioNetContributionsAt(today);
  const gain = value - contrib;
  const returnPct = Math.abs(contrib) < 1 ? null : (gain / contrib) * 100;
  const tax = portfolioEstimatedTax(today);
  const netValue = value - tax;
  return { value, contrib, gain, returnPct, tax, netValue };
}

function allDatesForInvestments(invIds) {
  const set = new Set();
  invIds.forEach((id) => {
    store.snapshotsFor(id).forEach((s) => set.add(s.date));
    store.transactionsFor(id).forEach((t) => set.add(t.date));
  });
  return Array.from(set).sort();
}

const RANGE_DAYS = { "1M": 31, "3M": 93, "6M": 186, YTD: null, "1Y": 366, "3Y": 1097, "5Y": 1828, ALL: null };

export function filterDatesByRange(dates, range) {
  if (!dates.length) return dates;
  if (range === "ALL") return dates;
  const today = new Date();
  if (range === "YTD") {
    const jan1 = `${today.getFullYear()}-01-01`;
    return dates.filter((d) => d >= jan1);
  }
  const days = RANGE_DAYS[range] || 366;
  const cutoff = new Date(today.getTime() - days * 86400000);
  const cutoffISO = cutoff.toISOString().slice(0, 10);
  const filtered = dates.filter((d) => d >= cutoffISO);
  return filtered.length ? filtered : dates.slice(-2);
}

export function portfolioHistory(range = "ALL", opts = {}) {
  const invs = includedInvestments(opts);
  const invIds = invs.map((i) => i.id);
  let dates = allDatesForInvestments(invIds);
  if (!dates.includes(todayISO()) && dates.length) dates.push(todayISO());
  dates = filterDatesByRange(dates, range);
  return dates.map((date) => {
    const value = portfolioValueAt(date, opts);
    const contrib = portfolioNetContributionsAt(date, opts);
    return { date, value, contrib, gain: value - contrib, returnPct: Math.abs(contrib) < 1 ? null : ((value - contrib) / contrib) * 100 };
  });
}

export function investmentHistory(investmentId, range = "ALL") {
  let dates = allDatesForInvestments([investmentId]);
  if (!dates.length) return [];
  if (!dates.includes(todayISO())) dates.push(todayISO());
  dates = filterDatesByRange(dates, range);
  return dates.map((date) => {
    const value = valueOfInvestmentAt(investmentId, date);
    const contrib = netContributionsAt(investmentId, date);
    return { date, value, contrib, gain: value - contrib, returnPct: Math.abs(contrib) < 1 ? null : ((value - contrib) / contrib) * 100 };
  });
}

function monthRangeCovering(dates) {
  if (!dates.length) return [];
  const first = monthKey(dates[0]);
  const last = monthKey(todayISO());
  const months = [];
  let cur = first;
  let guard = 0;
  while (cur <= last && guard < 1000) {
    months.push(cur);
    cur = addMonthsToKey(cur, 1);
    guard++;
  }
  return months;
}

export function monthlySeriesForInvestments(invIds) {
  const dates = allDatesForInvestments(invIds);
  const months = monthRangeCovering(dates);
  return months.map((m) => {
    const endOfMonth = addMonthsToKey(m, 1) + "-01";
    const cutoff = endOfMonth <= todayISO() ? new Date(new Date(endOfMonth).getTime() - 86400000).toISOString().slice(0, 10) : todayISO();
    let value = 0, contrib = 0, prevValue = 0, prevContrib = 0;
    const prevMonth = addMonthsToKey(m, -1);
    const prevCutoff = m + "-01";
    const prevCutoffFinal = new Date(new Date(prevCutoff).getTime() - 86400000).toISOString().slice(0, 10);
    invIds.forEach((id) => {
      value += valueOfInvestmentAt(id, cutoff);
      contrib += netContributionsAt(id, cutoff);
      prevValue += valueOfInvestmentAt(id, prevCutoffFinal);
      prevContrib += netContributionsAt(id, prevCutoffFinal);
    });
    const depositsInMonth = contrib - prevContrib;
    const change = value - prevValue;
    const performance = change - depositsInMonth;
    const base = prevValue > 1 ? prevValue : (Math.abs(prevContrib) > 1 ? prevContrib : null);
    const returnPct = base ? (performance / base) * 100 : null;
    return { month: m, value, prevValue, change, depositsInMonth, performance, returnPct };
  });
}

export function monthlySeriesForPortfolio(opts = {}) {
  const invIds = includedInvestments(opts).map((i) => i.id);
  return monthlySeriesForInvestments(invIds);
}

export function monthlySeriesForInvestment(investmentId) {
  return monthlySeriesForInvestments([investmentId]);
}

export function allocationBy(field) {
  const invs = includedInvestments();
  const today = todayISO();
  const map = new Map();
  invs.forEach((inv) => {
    const value = valueOfInvestmentAt(inv.id, today);
    if (!value) return;
    let key;
    if (field === "investment") key = inv.name;
    else if (field === "type") key = typeLabel(inv.type);
    else if (field === "institution") key = inv.institution || "לא צוין";
    else if (field === "currency") key = inv.currency;
    else key = "אחר";
    const prev = map.get(key) || { name: key, value: 0, color: inv.color };
    prev.value += value;
    map.set(key, prev);
  });
  return Array.from(map.values()).sort((a, b) => b.value - a.value);
}

export function liquiditySplit() {
  const invs = includedInvestments();
  const today = todayISO();
  let liquid = 0, illiquid = 0;
  invs.forEach((inv) => {
    const value = valueOfInvestmentAt(inv.id, today);
    if (inv.liquidity === "liquid") liquid += value; else illiquid += value;
  });
  return { liquid, illiquid, total: liquid + illiquid };
}

export function taxSplit() {
  const invs = includedInvestments();
  const today = todayISO();
  let taxable = 0, exempt = 0;
  invs.forEach((inv) => {
    const value = valueOfInvestmentAt(inv.id, today);
    if (inv.taxType === "taxable") taxable += value; else exempt += value;
  });
  return { taxable, exempt, total: taxable + exempt };
}

export function hasMarketSectorData() {
  return store.activeInvestments().some((i) => i.market || i.sector);
}

export function breakdownByField(field) {
  const invs = store.activeInvestments();
  const today = todayISO();
  const map = new Map();
  invs.forEach((inv) => {
    const raw = valueOfInvestmentAt(inv.id, today);
    if (!raw) return;
    let key;
    if (field === "market") key = inv.market || "";
    else if (field === "sector") key = inv.sector || "";
    else if (field === "currency") key = inv.currency;
    if (field !== "currency" && !key) return;
    const valueILS = valueInILS(inv, raw);
    const prev = map.get(key) || { name: key, value: 0, color: inv.color };
    prev.value += valueILS;
    map.set(key, prev);
  });
  return Array.from(map.values()).sort((a, b) => b.value - a.value);
}

export function fxGainLossByInvestment() {
  const rate = usdIlsRate();
  return store.activeInvestments()
    .filter((inv) => inv.currency === "USD" && inv.purchaseRate)
    .map((inv) => ({ name: inv.name, value: currentValue(inv.id) * (rate - inv.purchaseRate) }))
    .filter((x) => Math.abs(x.value) > 0.5);
}

export function typeLabel(type) {
  const t = INVESTMENT_TYPES.find((x) => x.id === type);
  return t ? t.label : "אחר";
}

export function freshnessDays(investmentId) {
  const snap = store.latestSnapshot(investmentId, todayISO());
  return snap ? daysAgo(snap.date) : Infinity;
}

export function staleInvestments(thresholdDays = 30) {
  return store.activeInvestments().filter((i) => !i.excludeFromTotals && freshnessDays(i.id) > thresholdDays);
}

export function buildInsights() {
  const insights = [];
  const invs = includedInvestments();
  if (!invs.length) return insights;

  const hist30 = portfolioHistory("1M");
  if (hist30.length >= 2) {
    const first = hist30[0], last = hist30[hist30.length - 1];
    const totalChange = last.value - first.value;
    const depositsChange = last.contrib - first.contrib;
    if (Math.abs(totalChange) > 1) {
      insights.push(`התיק ${totalChange >= 0 ? "עלה" : "ירד"} ב-${Math.round(Math.abs(totalChange)).toLocaleString("he-IL")} ₪ ב-30 הימים האחרונים.`);
      if (Math.abs(depositsChange) > 1) {
        insights.push(`מתוך ${totalChange >= 0 ? "העלייה" : "הירידה"}, ${Math.round(Math.abs(depositsChange)).toLocaleString("he-IL")} ₪ הגיעו מ${depositsChange >= 0 ? "הפקדות" : "משיכות"}.`);
      }
    }
  }

  const byInvestment = allocationBy("investment");
  const total = byInvestment.reduce((s, x) => s + x.value, 0);
  if (byInvestment.length && total > 0) {
    const top = byInvestment[0];
    const pct = Math.round((top.value / total) * 100);
    if (pct >= 20) {
      insights.push(`${top.name} היא ההשקעה הגדולה ביותר שלך ומהווה ${pct}% מהתיק.`);
    }
  }

  const stale = staleInvestments(30);
  if (stale.length) {
    insights.push(`${stale.length} השקעות לא עודכנו יותר מחודש.`);
  }

  return insights.slice(0, 4);
}

export function monthlyReturnHeatmap(opts = {}) {
  const series = monthlySeriesForPortfolio(opts);
  const byYear = new Map();
  series.forEach((s) => {
    const [y, m] = s.month.split("-");
    if (!byYear.has(y)) byYear.set(y, {});
    byYear.get(y)[m] = s;
  });
  return byYear;
}
