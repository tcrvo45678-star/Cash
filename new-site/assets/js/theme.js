import { store } from "./store.js";

const mql = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

export function applyTheme() {
  const theme = store.settings.theme || "system";
  const root = document.documentElement;
  if (theme === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme);
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const isDark = theme === "dark" || (theme === "system" && mql && mql.matches);
    meta.setAttribute("content", isDark ? "#0F1712" : "#F5F6F2");
  }
}

export function initTheme() {
  applyTheme();
  if (mql) mql.addEventListener("change", () => { if ((store.settings.theme || "system") === "system") applyTheme(); });
}
