import { store } from "./store.js";
import { icon, TYPE_ICON } from "./icons.js";
import { navigate } from "./router.js";
import * as workflows from "./workflows.js";

let paletteEl = null;

function staticCommands() {
  return [
    { label: "עבור לסקירה כללית", icon: "layout-dashboard", action: () => navigate("/overview") },
    { label: "עבור להשקעות", icon: "wallet", action: () => navigate("/investments") },
    { label: "עבור לעדכון חודשי", icon: "pencil", action: () => navigate("/monthly-update") },
    { label: "עבור לפעילות", icon: "activity", action: () => navigate("/activity") },
    { label: "עבור לניתוח", icon: "chart-column", action: () => navigate("/analysis") },
    { label: "עבור ליעדים", icon: "target", action: () => navigate("/goals") },
    { label: "עבור להגדרות", icon: "settings", action: () => navigate("/settings") },
    { label: "הוסף השקעה חדשה", icon: "plus", action: () => workflows.openAddInvestmentFlow() },
    { label: "הוסף הפקדה", icon: "arrow-down-right", action: () => workflows.quickDeposit() },
    { label: "משוך כסף", icon: "arrow-up-right", action: () => workflows.quickWithdraw() },
  ];
}

function investmentCommands() {
  return store.activeInvestments().map((inv) => ({
    label: `עדכן ${inv.name}`,
    icon: TYPE_ICON[inv.type] || "package",
    group: "investments",
    action: () => workflows.openInvestmentQuickActions(inv.id),
  })).concat(store.activeInvestments().map((inv) => ({
    label: `פתח ${inv.name}`,
    icon: TYPE_ICON[inv.type] || "package",
    group: "investments",
    action: () => navigate(`/investments/${inv.id}`),
  })));
}

export function openCommandPalette() {
  closeCommandPalette();
  const commands = [...staticCommands(), ...investmentCommands()];
  paletteEl = document.createElement("div");
  paletteEl.className = "overlay-backdrop palette-backdrop";
  paletteEl.innerHTML = `
    <div class="command-palette">
      <div class="command-palette-input">
        ${icon("search", { size: 18 })}
        <input type="text" placeholder="חפש השקעה, פעולה, מסך..." id="cp-input">
      </div>
      <div class="command-palette-list" id="cp-list"></div>
    </div>`;
  document.body.appendChild(paletteEl);
  document.body.classList.add("overlay-open");
  const input = paletteEl.querySelector("#cp-input");
  const list = paletteEl.querySelector("#cp-list");
  let activeIndex = 0;
  let filtered = commands;

  function renderList() {
    list.innerHTML = filtered.slice(0, 40).map((c, i) => `
      <button class="cp-item ${i === activeIndex ? "active" : ""}" data-idx="${i}">
        ${icon(c.icon, { size: 16 })}<span>${c.label}</span>
      </button>`).join("") || `<p class="text-muted cp-empty">אין תוצאות</p>`;
    list.querySelectorAll(".cp-item").forEach((btn) => {
      btn.addEventListener("click", () => runCommand(filtered[Number(btn.dataset.idx)]));
      btn.addEventListener("mouseenter", () => { activeIndex = Number(btn.dataset.idx); updateActive(); });
    });
  }
  function updateActive() {
    list.querySelectorAll(".cp-item").forEach((b) => b.classList.toggle("active", Number(b.dataset.idx) === activeIndex));
    const activeEl = list.querySelector(".cp-item.active");
    if (activeEl) activeEl.scrollIntoView({ block: "nearest" });
  }
  function runCommand(cmd) {
    if (!cmd) return;
    closeCommandPalette();
    cmd.action();
  }

  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    filtered = q ? commands.filter((c) => c.label.toLowerCase().includes(q)) : commands;
    activeIndex = 0;
    renderList();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); activeIndex = Math.min(activeIndex + 1, filtered.length - 1); updateActive(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); activeIndex = Math.max(activeIndex - 1, 0); updateActive(); }
    else if (e.key === "Enter") { e.preventDefault(); runCommand(filtered[activeIndex]); }
    else if (e.key === "Escape") { closeCommandPalette(); }
  });
  paletteEl.addEventListener("mousedown", (e) => { if (e.target === paletteEl) closeCommandPalette(); });

  renderList();
  requestAnimationFrame(() => input.focus());
}

export function closeCommandPalette() {
  if (paletteEl) {
    paletteEl.remove();
    paletteEl = null;
    if (!document.getElementById("overlay-root")?.children.length) document.body.classList.remove("overlay-open");
  }
}
