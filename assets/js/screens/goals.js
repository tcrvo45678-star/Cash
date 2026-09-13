import { store } from "./../store.js";
import { icon } from "./../icons.js";
import { fmtMoney, escapeHtml, fmtDate, parseNumberInput } from "./../utils.js";
import { currentPortfolioStats } from "./../calc.js";
import { openModal, showToast, confirmDialog } from "./../ui.js";
import { el } from "./../utils.js";

export function renderGoals(container) {
  const stats = currentPortfolioStats();
  const goals = store.data.goals;

  container.innerHTML = `
    <div class="screen goals-screen">
      <div class="screen-head">
        <h2>יעדים</h2>
        <button class="btn btn-primary btn-icon-label" id="add-goal-btn">${icon("plus", { size: 16 })}<span>יעד חדש</span></button>
      </div>

      ${goals.length ? `<div class="goals-grid">${goals.map((g) => goalCardHtml(g, stats.value)).join("")}</div>` :
        `<div class="card empty-state-card"><div class="empty-state-icon">${icon("target", { size: 36 })}</div><h3>אין עדיין יעדים</h3><p class="text-muted">הגדר יעד הון ועקוב אחרי ההתקדמות שלך.</p></div>`}

      <div class="card">
        <h3>סימולציית תחזית <span class="badge badge-muted">סימולציה בלבד</span></h3>
        <form class="stack-form forecast-form" id="forecast-form">
          <div class="field-row">
            <div class="field"><label>הון נוכחי</label><input type="number" name="current" value="${Math.round(stats.value)}"></div>
            <div class="field"><label>הפקדה חודשית</label><input type="number" name="monthly" value="2000"></div>
          </div>
          <div class="field-row">
            <div class="field"><label>תשואה שנתית משוערת (%)</label><input type="number" step="0.1" name="rate" value="7"></div>
            <div class="field"><label>מספר שנים</label><input type="number" name="years" value="20"></div>
          </div>
        </form>
        <div id="forecast-result"></div>
      </div>
    </div>
  `;

  container.querySelector("#add-goal-btn").addEventListener("click", () => openAddGoalDialog(container));
  container.querySelectorAll("[data-del-goal]").forEach((b) => b.addEventListener("click", async () => {
    const ok = await confirmDialog({ title: "מחיקת יעד", message: "למחוק את היעד?", confirmLabel: "מחק", danger: true });
    if (ok) { store.deleteGoal(b.dataset.delGoal); renderGoals(container); }
  }));

  const form = container.querySelector("#forecast-form");
  const drawForecast = () => {
    const fd = new FormData(form);
    const current = parseNumberInput(fd.get("current"));
    const monthly = parseNumberInput(fd.get("monthly"));
    const rate = parseNumberInput(fd.get("rate")) / 100;
    const years = parseNumberInput(fd.get("years"));
    const monthlyRate = rate / 12;
    let value = current;
    const points = [{ year: 0, value }];
    for (let y = 1; y <= years; y++) {
      for (let m = 0; m < 12; m++) value = value * (1 + monthlyRate) + monthly;
      points.push({ year: y, value });
    }
    const result = container.querySelector("#forecast-result");
    const final = points[points.length - 1];
    result.innerHTML = `
      <div class="forecast-summary">
        <div class="perf-row perf-row-highlight"><span>הון משוער בעוד ${years} שנים</span><strong>${fmtMoney(final.value)}</strong></div>
      </div>
      <div class="forecast-bars">
        ${points.filter((_, i) => i % Math.max(1, Math.floor(years / 10)) === 0 || i === points.length - 1).map((p) => `
          <div class="forecast-bar-col">
            <div class="forecast-bar" style="height:${Math.max(4, (p.value / final.value) * 140)}px"></div>
            <span class="text-muted small">${p.year === 0 ? "היום" : "+" + p.year}</span>
          </div>`).join("")}
      </div>
    `;
  };
  form.addEventListener("input", drawForecast);
  drawForecast();
}

function goalCardHtml(g, currentValue) {
  const pct = g.targetAmount ? Math.min(100, (currentValue / g.targetAmount) * 100) : 0;
  return `<div class="card goal-card">
    <div class="card-head"><h3>${escapeHtml(g.name)}</h3><button class="icon-btn" data-del-goal="${g.id}">${icon("trash-2", { size: 15 })}</button></div>
    <div class="goal-progress-label">${fmtMoney(currentValue)} / ${fmtMoney(g.targetAmount)}</div>
    <div class="goal-progress-track"><div class="goal-progress-fill" style="width:${pct}%"></div></div>
    <div class="goal-progress-pct">${pct.toFixed(1)}%</div>
    ${g.targetDate ? `<div class="text-muted small">יעד לתאריך: ${fmtDate(g.targetDate)}</div>` : ""}
  </div>`;
}

function openAddGoalDialog(container) {
  const body = el(`<form class="stack-form">
    <div class="field"><label>שם היעד</label><input type="text" name="name" placeholder="לדוגמה: קרן חירום" autofocus></div>
    <div class="field"><label>סכום יעד</label><input type="number" inputmode="decimal" name="targetAmount" placeholder="0"></div>
    <div class="field"><label>תאריך יעד (אופציונלי)</label><input type="date" name="targetDate"></div>
  </form>`);
  const { close, el: modalEl } = openModal({
    title: "יעד חדש", size: "sm", body,
    footer: `<button class="btn btn-ghost" data-act="cancel">ביטול</button><button class="btn btn-primary" data-act="save">שמור</button>`,
  });
  modalEl.querySelector('[data-act="cancel"]').onclick = () => close();
  modalEl.querySelector('[data-act="save"]').onclick = () => {
    const fd = new FormData(body);
    const name = (fd.get("name") || "").trim();
    if (!name || !fd.get("targetAmount")) { showToast("צריך להזין שם וסכום יעד"); return; }
    store.addGoal({ name, targetAmount: fd.get("targetAmount"), targetDate: fd.get("targetDate") || null });
    close();
    renderGoals(container);
  };
}
