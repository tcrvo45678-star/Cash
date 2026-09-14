import { icon } from "./icons.js";

let overlayRoot = null;
function root() {
  if (!overlayRoot) {
    overlayRoot = document.getElementById("overlay-root");
  }
  return overlayRoot;
}

export function closeAllOverlays() {
  root().innerHTML = "";
  document.body.classList.remove("overlay-open");
}

export function openModal({ title, body, footer, size = "md", onClose, className = "" }) {
  const wrap = document.createElement("div");
  wrap.className = "overlay-backdrop";
  wrap.innerHTML = `
    <div class="modal modal-${size} ${className}" role="dialog" aria-modal="true">
      <div class="modal-head">
        <h3>${title}</h3>
        <button class="icon-btn modal-close" aria-label="סגור">${icon("x")}</button>
      </div>
      <div class="modal-body">${typeof body === "string" ? body : ""}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ""}
    </div>`;
  root().appendChild(wrap);
  document.body.classList.add("overlay-open");
  if (typeof body !== "string") wrap.querySelector(".modal-body").appendChild(body);

  const close = () => {
    wrap.remove();
    if (!root().children.length) document.body.classList.remove("overlay-open");
    if (onClose) onClose();
  };
  wrap.querySelector(".modal-close").addEventListener("click", close);
  wrap.addEventListener("mousedown", (e) => { if (e.target === wrap) close(); });
  const escHandler = (e) => { if (e.key === "Escape") { close(); document.removeEventListener("keydown", escHandler); } };
  document.addEventListener("keydown", escHandler);
  return { el: wrap, close };
}

export function openDrawer({ title, body, footer, onClose }) {
  const wrap = document.createElement("div");
  wrap.className = "overlay-backdrop drawer-backdrop";
  wrap.innerHTML = `
    <aside class="drawer" role="dialog" aria-modal="true">
      <div class="drawer-head">
        <h3>${title}</h3>
        <button class="icon-btn drawer-close" aria-label="סגור">${icon("x")}</button>
      </div>
      <div class="drawer-body"></div>
      ${footer ? `<div class="drawer-foot">${footer}</div>` : ""}
    </aside>`;
  root().appendChild(wrap);
  document.body.classList.add("overlay-open");
  const bodyEl = wrap.querySelector(".drawer-body");
  if (typeof body === "string") bodyEl.innerHTML = body; else bodyEl.appendChild(body);

  requestAnimationFrame(() => wrap.classList.add("open"));

  const close = () => {
    wrap.classList.remove("open");
    setTimeout(() => {
      wrap.remove();
      if (!root().children.length) document.body.classList.remove("overlay-open");
    }, 200);
    if (onClose) onClose();
  };
  wrap.querySelector(".drawer-close").addEventListener("click", close);
  wrap.addEventListener("mousedown", (e) => { if (e.target === wrap) close(); });
  const escHandler = (e) => { if (e.key === "Escape") { close(); document.removeEventListener("keydown", escHandler); } };
  document.addEventListener("keydown", escHandler);
  return { el: wrap, close };
}

let toastContainer = null;
export function showToast(message, opts = {}) {
  if (!toastContainer) {
    toastContainer = document.createElement("div");
    toastContainer.className = "toast-stack";
    document.body.appendChild(toastContainer);
  }
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = `<span>${message}</span>${opts.actionLabel ? `<button class="toast-action">${opts.actionLabel}</button>` : ""}`;
  toastContainer.appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));

  let done = false;
  const remove = () => {
    if (done) return;
    done = true;
    t.classList.remove("show");
    setTimeout(() => t.remove(), 250);
  };
  if (opts.actionLabel && opts.onAction) {
    t.querySelector(".toast-action").addEventListener("click", () => { opts.onAction(); remove(); });
  }
  setTimeout(remove, opts.duration || 5000);
  return { remove };
}

export function openActionSheet({ title, items }) {
  const list = items.map((it) => `
    <button class="action-sheet-item" data-key="${it.key}" ${it.danger ? 'data-danger="1"' : ""}>
      ${icon(it.icon, { size: 20 })}
      <span>${it.label}</span>
    </button>`).join("");
  const wrap = document.createElement("div");
  wrap.className = "overlay-backdrop sheet-backdrop";
  wrap.innerHTML = `
    <div class="action-sheet">
      ${title ? `<div class="action-sheet-title">${title}</div>` : ""}
      ${list}
      <button class="action-sheet-item action-sheet-cancel" data-key="__cancel">${icon("x", { size: 18 })}<span>ביטול</span></button>
    </div>`;
  root().appendChild(wrap);
  document.body.classList.add("overlay-open");
  requestAnimationFrame(() => wrap.classList.add("open"));

  return new Promise((resolve) => {
    const close = (key) => {
      wrap.classList.remove("open");
      setTimeout(() => {
        wrap.remove();
        if (!root().children.length) document.body.classList.remove("overlay-open");
      }, 180);
      resolve(key === "__cancel" ? null : key);
    };
    wrap.addEventListener("click", (e) => {
      const btn = e.target.closest(".action-sheet-item");
      if (btn) close(btn.dataset.key);
      else if (e.target === wrap) close("__cancel");
    });
  });
}

export function confirmDialog({ title, message, confirmLabel = "אישור", danger = false }) {
  return new Promise((resolve) => {
    let resolved = false;
    const { el, close } = openModal({
      title,
      body: `<p class="confirm-message">${message}</p>`,
      footer: `
        <button class="btn btn-ghost" data-act="cancel">ביטול</button>
        <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-act="confirm">${confirmLabel}</button>`,
      size: "sm",
      onClose: () => { if (!resolved) { resolved = true; resolve(false); } },
    });
    el.querySelector('[data-act="confirm"]').onclick = () => { resolved = true; resolve(true); close(); };
    el.querySelector('[data-act="cancel"]').onclick = () => { close(); };
  });
}
