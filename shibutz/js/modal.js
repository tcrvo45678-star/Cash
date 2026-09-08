// Generic modal component
// Provides: APP.modal.open(html, {onDismiss}), setContent(html), close()

APP.modal = (() => {
  let currentOnDismiss = null;
  let triggerEl = null;

  const overlay = document.getElementById('modal-overlay');
  const box = document.getElementById('modal-box');

  // Focus the first focusable element inside the modal
  function focusFirst() {
    const focusable = box.querySelector('input, select, textarea, button');
    if (focusable) focusable.focus();
  }

  function getFocusable() {
    return Array.from(box.querySelectorAll('input, select, textarea, button, a[href]'))
      .filter((el) => !el.disabled && el.offsetParent !== null);
  }

  // Backdrop click (only on overlay itself, not bubbled from box)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) dismiss();
  });

  // Escape key dismisses if modal is open; Tab is trapped inside the modal
  document.addEventListener('keydown', (e) => {
    if (overlay.hidden) return;
    if (e.key === 'Escape') { dismiss(); return; }
    if (e.key === 'Tab') {
      const focusable = getFocusable();
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    }
  });

  function dismiss() {
    if (currentOnDismiss) currentOnDismiss();
    close();
  }

  return {
    open(html, opts = {}) {
      triggerEl = document.activeElement;
      currentOnDismiss = opts.onDismiss || null;
      box.innerHTML = html;
      overlay.removeAttribute('hidden');
      focusFirst();
    },

    setContent(html) {
      box.innerHTML = html;
      focusFirst();
    },

    close() {
      overlay.setAttribute('hidden', '');
      box.innerHTML = '';
      currentOnDismiss = null;
      if (triggerEl && document.body.contains(triggerEl)) triggerEl.focus();
      triggerEl = null;
    }
  };
})();
