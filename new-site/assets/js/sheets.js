import { store } from "./store.js";
import { showToast } from "./ui.js";
import { typeLabel, currentValue, currentNetContributions, investmentGain, investmentReturnPct, netContributionsAt, estimatedTax } from "./calc.js";

export function exportJSON() {
  const payload = { exportedAt: new Date().toISOString(), data: store.data };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  downloadBlob(blob, `wealth-backup-${new Date().toISOString().slice(0, 10)}.json`);
}

export function exportCSV() {
  const rows = [["השקעה", "סוג", "מוסד", "מטבע", "תאריך", "שווי", "הפקדות_נטו", "רווח", "מס_משוער", "נטו_אחרי_מס", "תשואה_אחוז"]];
  store.data.investments.forEach((inv) => {
    const snaps = store.snapshotsFor(inv.id);
    snaps.forEach((s) => {
      const contrib = netContributionsAt(inv.id, s.date);
      const gain = s.value - contrib;
      const tax = estimatedTax(inv.id, s.date);
      const net = s.value - tax;
      const roi = Math.abs(contrib) < 1 ? "" : ((gain / contrib) * 100).toFixed(1) + "%";
      rows.push([inv.name, typeLabel(inv.type), inv.institution || "", inv.currency, s.date, Math.round(s.value), Math.round(contrib), Math.round(gain), Math.round(tax), Math.round(net), roi]);
    });
  });
  const csv = "﻿" + rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `wealth-export-${new Date().toISOString().slice(0, 10)}.csv`);
}

function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function importJSONFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const data = parsed.data || parsed;
        if (!data.investments) throw new Error("bad format");
        store.replaceAllData(data);
        showToast("הנתונים יובאו בהצלחה");
        resolve(true);
      } catch (e) {
        showToast("שגיאה בייבוא הקובץ - פורמט לא תקין");
        reject(e);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

export function buildSheetsRows() {
  const rows = [];
  store.data.investments.forEach((inv) => {
    const value = currentValue(inv.id);
    const contrib = currentNetContributions(inv.id);
    const gain = investmentGain(inv.id);
    const tax = estimatedTax(inv.id);
    const net = value - tax;
    const ret = investmentReturnPct(inv.id);
    rows.push([
      inv.name, typeLabel(inv.type), inv.institution || "", inv.currency,
      Math.round(value), Math.round(contrib), Math.round(gain), Math.round(tax), Math.round(net),
      ret != null ? ret.toFixed(1) + "%" : "",
    ]);
  });
  return rows;
}

export async function syncToSheets() {
  const url = store.settings.sheetsUrl;
  if (!url) return;
  const rows = buildSheetsRows();
  try {
    await fetch(url, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    });
    showToast("✓ סונכרן ל-Google Sheets");
  } catch (e) {
    showToast("⚠ שגיאה בסנכרון ל-Sheets - הנתונים נשמרו מקומית");
  }
}
