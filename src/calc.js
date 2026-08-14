const { heToBool } = require('./utils');

function monthEnd(month) {
  // month is 'YYYY-MM' -> last day of that month as ISO date string
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
}

function totalDepositsUpTo(deposits, channelId, month) {
  const cutoff = monthEnd(month);
  return deposits
    .filter((d) => String(d.channelId) === String(channelId) && String(d.date).slice(0, 10) <= cutoff)
    .reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
}

function balanceForMonth(balances, channelId, month) {
  // exact match for the requested month; if missing, fall back to the latest
  // available balance at or before that month (so the dashboard still shows something)
  const forChannel = balances
    .filter((b) => String(b.channelId) === String(channelId))
    .sort((a, b) => String(a.month).localeCompare(String(b.month)));
  const exact = forChannel.find((b) => String(b.month) === String(month));
  if (exact) return { balance: Number(exact.balance) || 0, month: exact.month, exact: true };
  const prior = [...forChannel].reverse().find((b) => String(b.month) <= String(month));
  if (prior) return { balance: Number(prior.balance) || 0, month: prior.month, exact: false };
  return { balance: 0, month: null, exact: false };
}

function computeChannelSummary(channel, deposits, balances, month, taxRate) {
  const totalDeposits = totalDepositsUpTo(deposits, channel.id, month);
  const bal = balanceForMonth(balances, channel.id, month);
  const currentBalance = bal.balance;
  const grossGain = currentBalance - totalDeposits;
  const taxable = heToBool(channel.taxable);
  const taxableGain = taxable ? Math.max(0, grossGain) : 0;
  const tax = taxableGain * (Number(taxRate) / 100);
  const netAfterTax = currentBalance - tax;
  const feeAccumAnnualCost = currentBalance * ((Number(channel.feeAccumPct) || 0) / 100);
  const feeDepositCostTotal = totalDeposits * ((Number(channel.feeDepositPct) || 0) / 100);

  return {
    channelId: channel.id,
    name: channel.name,
    type: channel.type,
    totalDeposits,
    currentBalance,
    balanceMonth: bal.month,
    balanceIsExactMonth: bal.exact,
    grossGain,
    taxable,
    taxableGain,
    tax,
    netAfterTax,
    feeDepositPct: Number(channel.feeDepositPct) || 0,
    feeAccumPct: Number(channel.feeAccumPct) || 0,
    feeAccumAnnualCost,
    feeDepositCostTotal,
    active: heToBool(channel.active),
  };
}

function computeDashboard(channels, deposits, balances, month, taxRate) {
  const activeChannels = channels.filter((c) => heToBool(c.active));
  const items = activeChannels.map((c) => computeChannelSummary(c, deposits, balances, month, taxRate));
  const totals = items.reduce(
    (acc, it) => {
      acc.totalDeposits += it.totalDeposits;
      acc.currentBalance += it.currentBalance;
      acc.grossGain += it.grossGain;
      acc.tax += it.tax;
      acc.netAfterTax += it.netAfterTax;
      acc.feeAccumAnnualCost += it.feeAccumAnnualCost;
      return acc;
    },
    { totalDeposits: 0, currentBalance: 0, grossGain: 0, tax: 0, netAfterTax: 0, feeAccumAnnualCost: 0 }
  );
  return { month, taxRate: Number(taxRate), channels: items, totals };
}

function computeCompleteness(channels, balances, month) {
  const activeChannels = channels.filter((c) => heToBool(c.active));
  const filled = [];
  const missing = [];
  activeChannels.forEach((c) => {
    const has = balances.some((b) => String(b.channelId) === String(c.id) && String(b.month) === String(month));
    if (has) filled.push({ id: c.id, name: c.name });
    else missing.push({ id: c.id, name: c.name });
  });
  return {
    month,
    total: activeChannels.length,
    filledCount: filled.length,
    missingCount: missing.length,
    complete: missing.length === 0,
    filled,
    missing,
  };
}

function monthsWithBalances(balances) {
  return [...new Set(balances.map((b) => String(b.month)))].sort();
}

module.exports = {
  monthEnd,
  totalDepositsUpTo,
  balanceForMonth,
  computeChannelSummary,
  computeDashboard,
  computeCompleteness,
  monthsWithBalances,
};
