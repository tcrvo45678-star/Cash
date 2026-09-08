window.APP = window.APP || {};

APP.util = (function () {
  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function ratingOptions(selected) {
    var out = '';
    for (var i = 1; i <= 7; i++) {
      out += '<option value="' + i + '"' + (Number(selected) === i ? ' selected' : '') + '>' + i + '</option>';
    }
    return out;
  }

  return { escapeHtml: escapeHtml, qs: qs, qsa: qsa, ratingOptions: ratingOptions };
})();
