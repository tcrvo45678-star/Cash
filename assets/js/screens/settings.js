import { store } from "./../store.js";
import { icon } from "./../icons.js";
import { showToast, confirmDialog } from "./../ui.js";
import { exportJSON, exportCSV, importJSONFile, syncToSheets } from "./../sheets.js";
import { detectLegacyData, downloadLegacyBackup } from "./../migration.js";
import { applyTheme } from "./../theme.js";

export function renderSettings(container) {
  const legacy = detectLegacyData();
  container.innerHTML = `
    <div class="screen settings-screen">
      <div class="screen-head"><h2>הגדרות</h2></div>

      <div class="card">
        <h3>מראה</h3>
        <div class="theme-picker">
          ${themeBtn("light", "sun", "בהיר")}
          ${themeBtn("dark", "moon", "כהה")}
          ${themeBtn("system", "monitor", "לפי המערכת")}
        </div>
      </div>

      <div class="card">
        <h3>גיבוי וייצוא</h3>
        <p class="text-muted">שמור עותק של הנתונים שלך במחשב, או ייבא גיבוי קודם.</p>
        <div class="settings-actions">
          <button class="btn btn-outline" id="export-json">${icon("download", { size: 15 })} ייצוא גיבוי (JSON)</button>
          <button class="btn btn-outline" id="export-csv">${icon("file-text", { size: 15 })} ייצוא ל-CSV</button>
          <label class="btn btn-outline file-btn">${icon("upload", { size: 15 })} ייבוא גיבוי<input type="file" id="import-file" accept="application/json" hidden></label>
        </div>
      </div>

      <div class="card">
        <h3>סנכרון Google Sheets</h3>
        <p class="text-muted">כתובת Web App של Apps Script. לאחר שמירת הכתובת, כל פעולה (הפקדה, משיכה, עדכון שווי, הוספת/עריכת השקעה) תסונכרן אוטומטית לגיליון המחובר - בדיוק כמו באתר הקודם.</p>
        <div class="field"><input type="url" id="sheets-url" placeholder="https://script.google.com/macros/s/.../exec" value="${store.settings.sheetsUrl || ""}"></div>
        <div class="settings-actions">
          <button class="btn btn-outline btn-small" id="save-sheets-url">שמור כתובת</button>
          <button class="btn btn-outline btn-small" id="sync-now">סנכרן עכשיו</button>
        </div>
      </div>

      <div class="card">
        <h3>שער דולר-שקל</h3>
        <p class="text-muted">משמש להמרת השקעות דולריות לשקלים בפילוחים (שוק/תחום/מטבע) ובגרף רווח/הפסד משער חליפין.</p>
        <div class="field"><input type="number" step="0.001" id="fx-rate" value="${store.settings.fxRateUsdIls || 3.7}"></div>
        <button class="btn btn-outline btn-small" id="save-fx-rate">שמור שער</button>
      </div>

      ${legacy ? `
      <div class="card">
        <h3>נתונים מהגרסה הקודמת</h3>
        <p class="text-muted">זוהו נתונים מהמערכת הישנה (${legacy.channelsCount} אפיקים, ${legacy.snapshotsCount} נקודות מעקב, ${legacy.holdingsCount} אחזקות). הם נשמרים בבטחה במכשיר ולא נמחקים.</p>
        <button class="btn btn-outline btn-small" id="download-legacy">${icon("download", { size: 15 })} הורד גיבוי של הנתונים הישנים</button>
      </div>` : ""}

      <div class="card">
        <h3>מחיקת נתונים</h3>
        <p class="text-muted">מחיקה מלאה של כל הנתונים במכשיר זה. פעולה זו אינה הפיכה - מומלץ לייצא גיבוי קודם.</p>
        <button class="btn btn-danger btn-small" id="wipe-data">מחק את כל הנתונים</button>
      </div>
    </div>
  `;

  container.querySelectorAll("[data-theme]").forEach((b) => b.addEventListener("click", () => {
    store.setTheme(b.dataset.theme);
    applyTheme();
    renderSettings(container);
  }));

  container.querySelector("#export-json").addEventListener("click", exportJSON);
  container.querySelector("#export-csv").addEventListener("click", exportCSV);
  container.querySelector("#import-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const ok = await confirmDialog({ title: "ייבוא גיבוי", message: "ייבוא יחליף את כל הנתונים הנוכחיים בנתוני הגיבוי. להמשיך?", confirmLabel: "ייבא והחלף", danger: true });
    if (ok) { await importJSONFile(file); location.hash = "#/overview"; location.reload(); }
  });

  container.querySelector("#save-sheets-url").addEventListener("click", () => {
    const url = container.querySelector("#sheets-url").value.trim();
    store.setSheetsUrl(url);
    showToast(url ? "הכתובת נשמרה" : "הכתובת הוסרה");
  });
  container.querySelector("#sync-now").addEventListener("click", () => {
    if (!store.settings.sheetsUrl) { showToast("קודם יש להזין ולשמור כתובת Web App"); return; }
    syncToSheets();
  });

  container.querySelector("#save-fx-rate").addEventListener("click", () => {
    store.setFxRateUsdIls(container.querySelector("#fx-rate").value);
    showToast("השער נשמר");
  });

  container.querySelector("#download-legacy")?.addEventListener("click", downloadLegacyBackup);

  container.querySelector("#wipe-data").addEventListener("click", async () => {
    const ok = await confirmDialog({ title: "מחיקת כל הנתונים", message: "כל ההשקעות, העסקאות וההיסטוריה יימחקו לצמיתות ממכשיר זה. פעולה זו אינה הפיכה.", confirmLabel: "מחק הכל", danger: true });
    if (ok) {
      store.replaceAllData({ investments: [], transactions: [], snapshots: [], goals: [] });
      showToast("כל הנתונים נמחקו");
      location.hash = "#/overview";
    }
  });
}

function themeBtn(key, iconName, label) {
  const active = (store.settings.theme || "system") === key;
  return `<button class="theme-btn ${active ? "active" : ""}" data-theme="${key}">${icon(iconName, { size: 18 })}<span>${label}</span></button>`;
}
