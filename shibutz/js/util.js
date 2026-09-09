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

  function debounce(fn, ms) {
    var timer = null;
    return function () {
      var args = arguments;
      var ctx = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

  function ratingOptions(selected) {
    var out = '';
    for (var i = 1; i <= 7; i++) {
      out += '<option value="' + i + '"' + (Number(selected) === i ? ' selected' : '') + '>' + i + '</option>';
    }
    return out;
  }

  var COHORTS = [
    { key: 'b', label: 'מחזור ב (יב)', rank: 4, short: 'ב' },
    { key: 'c', label: 'מחזור ג (יא)', rank: 3, short: 'ג' },
    { key: 'd', label: 'מחזור ד (י)', rank: 2, short: 'ד' },
    { key: 'e', label: 'מחזור ה (ט)', rank: 1, short: 'ה' },
    { key: 'guest', label: 'אורח', rank: 0, short: 'אור' }
  ];
  // Text fallback for cohort color-coding - background color alone isn't
  // enough for colorblind users or grayscale printing.
  function cohortShortLabel(key) {
    var c = COHORTS.filter(function (x) { return x.key === key; })[0];
    return c ? c.short : '';
  }
  function cohortOptions(selected) {
    return COHORTS.map(function (c) {
      return '<option value="' + c.key + '"' + (c.key === selected ? ' selected' : '') + '>' + c.label + '</option>';
    }).join('');
  }
  function cohortRank(key) {
    var c = COHORTS.filter(function (x) { return x.key === key; })[0];
    return c ? c.rank : 0;
  }

  function genderOptions(selected) {
    var opts = [{ key: 'm', label: 'בן' }, { key: 'f', label: 'בת' }];
    return opts.map(function (o) {
      return '<option value="' + o.key + '"' + (o.key === selected ? ' selected' : '') + '>' + o.label + '</option>';
    }).join('');
  }

  return {
    escapeHtml: escapeHtml, qs: qs, qsa: qsa, ratingOptions: ratingOptions,
    COHORTS: COHORTS, cohortOptions: cohortOptions, cohortRank: cohortRank,
    cohortShortLabel: cohortShortLabel,
    genderOptions: genderOptions, debounce: debounce
  };
})();
