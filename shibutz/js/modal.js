// Generic modal component
// Provides: APP.modal.open(html, {onDismiss}), setContent(html), close()

APP.modal = (() => {
  let currentOnDismiss = null;

  const overlay = document.getElementById('modal-overlay');
  const box = document.getElementById('modal-box');

  // Focus the first focusable element inside the modal
  function focusFirst() {
    const focusable = box.querySelector('input, select, textarea, button');
    if (focusable) focusable.focus();
  }

  // Backdrop click (only on overlay itself, not bubbled from box)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) dismiss();
  });

  // Escape key dismisses if modal is open
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden) dismiss();
  });

  function dismiss() {
    if (currentOnDismiss) currentOnDismiss();
    close();
  }

  return {
    open(html, opts = {}) {
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
    }
  };
})();
