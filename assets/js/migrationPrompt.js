import { store } from "./store.js";
import { detectLegacyData, alreadyMigrated, performMigration } from "./migration.js";
import { showToast } from "./ui.js";
import { icon } from "./icons.js";

export function maybeShowMigrationPrompt(onDone) {
  const legacy = detectLegacyData();
  const hasNewData = store.data.investments.length > 0;
  if (!legacy || hasNewData || alreadyMigrated()) return false;

  const overlay = document.createElement("div");
  overlay.className = "overlay-backdrop migration-backdrop";
  overlay.innerHTML = `
    <div class="migration-card">
      <div class="migration-icon">${icon("archive", { size: 32 })}</div>
      <h2>מצאנו נתונים מהגרסה הקודמת</h2>
      <p class="text-muted">אפשר להעביר אותם בבטחה למערכת החדשה. ההיסטוריה, ההפקדות והחישובים יישמרו במלואם, וגם עותק גיבוי של הנתונים הישנים יישמר אוטומטית.</p>
      <div class="migration-stats">
        <div class="migration-stat"><strong>${legacy.channelsCount}</strong><span>אפיקים</span></div>
        <div class="migration-stat"><strong>${legacy.snapshotsCount}</strong><span>נקודות מעקב</span></div>
        <div class="migration-stat"><strong>${legacy.holdingsCount}</strong><span>אחזקות</span></div>
      </div>
      <div class="migration-actions">
        <button class="btn btn-primary btn-full" id="migrate-btn">העבר לגרסה החדשה</button>
        <button class="btn btn-ghost btn-full" id="skip-migrate-btn">התחל ריק (הנתונים הישנים יישארו שמורים)</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.body.classList.add("overlay-open");

  overlay.querySelector("#migrate-btn").addEventListener("click", () => {
    const result = performMigration();
    if (result) {
      store.replaceAllData(result.newData);
      if (result.sheetsUrl) store.setSheetsUrl(result.sheetsUrl);
      showToast("הנתונים הועברו בהצלחה לגרסה החדשה");
    }
    overlay.remove();
    document.body.classList.remove("overlay-open");
    if (onDone) onDone();
  });
  overlay.querySelector("#skip-migrate-btn").addEventListener("click", () => {
    overlay.remove();
    document.body.classList.remove("overlay-open");
    if (onDone) onDone();
  });
  return true;
}
