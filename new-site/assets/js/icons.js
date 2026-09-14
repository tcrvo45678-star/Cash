import { ICONS } from "./icons-data.js";

export function icon(name, opts = {}) {
  const size = opts.size || 18;
  const cls = opts.className ? ` ${opts.className}` : "";
  const body = ICONS[name];
  if (!body) return "";
  return `<svg class="icon${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${opts.strokeWidth || 2}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export const TYPE_ICON = {
  stock_etf: "trending-up",
  pension_fund: "landmark",
  study_fund: "piggy-bank",
  cash_deposit: "banknote",
  crypto: "bitcoin",
  real_estate: "house",
  other: "package",
};
