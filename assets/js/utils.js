export function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function nowISO() {
  return new Date().toISOString();
}

const CURRENCY_SYMBOLS = { ILS: "₪", USD: "$", EUR: "€" };

export function currencySymbol(cur) {
  return CURRENCY_SYMBOLS[cur] || cur || "₪";
}

export function fmtMoney(n, cur = "ILS", opts = {}) {
  const v = Number(n) || 0;
  const sym = currencySymbol(cur);
  const abs = Math.abs(v);
  const rounded = opts.decimals ? abs.toFixed(opts.decimals) : Math.round(abs).toLocaleString("he-IL");
  const sign = v < 0 ? "-" : (opts.forceSign && v > 0 ? "+" : "");
  return `${sign}${sym}${rounded}`;
}

export function fmtCompact(n, cur = "ILS") {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const sym = currencySymbol(cur);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1000000) return `${sign}${sym}${(abs / 1000000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 10000) return `${sign}${sym}${Math.round(abs / 1000)}K`;
  return fmtMoney(v, cur);
}

export function fmtPct(n, opts = {}) {
  const v = Number(n);
  if (!isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(opts.decimals ?? 1)}%`;
}

export function fmtDate(iso, opts = {}) {
  if (!iso) return "";
  const d = new Date(iso + (iso.length === 7 ? "-01" : iso.length === 10 ? "T00:00:00" : ""));
  if (isNaN(d)) return iso;
  if (opts.style === "month") {
    return d.toLocaleDateString("he-IL", { month: "short", year: "numeric" });
  }
  if (opts.style === "monthYear") {
    return d.toLocaleDateString("he-IL", { month: "long", year: "numeric" });
  }
  if (opts.style === "short") {
    return d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit" });
  }
  return d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function monthKey(iso) {
  return (iso || "").slice(0, 7);
}

export function addMonthsToKey(key, n) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthKeyLabel(key) {
  const names = ["ינו", "פבר", "מרץ", "אפר", "מאי", "יונ", "יול", "אוג", "ספט", "אוק", "נוב", "דצמ"];
  const [y, m] = key.split("-");
  return `${names[parseInt(m, 10) - 1]} ${y}`;
}

export function daysAgo(iso) {
  if (!iso) return Infinity;
  const then = new Date(iso);
  const now = new Date();
  return Math.floor((now - then) / 86400000);
}

export function freshnessLabel(iso) {
  const d = daysAgo(iso);
  if (!isFinite(d)) return "אין נתונים";
  if (d <= 0) return "עודכן היום";
  if (d === 1) return "עודכן אתמול";
  if (d < 30) return `עודכן לפני ${d} ימים`;
  const months = Math.floor(d / 30);
  if (months === 1) return "עודכן לפני חודש";
  return `עודכן לפני ${months} חודשים`;
}

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function classNames(...args) {
  return args.filter(Boolean).join(" ");
}

export function parseNumberInput(v) {
  if (v === "" || v == null) return 0;
  const n = parseFloat(String(v).replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}
