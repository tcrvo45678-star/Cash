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

  var COHORTS = [
    { key: 'b', label: 'מחזור ב (יב)', rank: 4 },
    { key: 'c', label: 'מחזור ג (יא)', rank: 3 },
    { key: 'd', label: 'מחזור ד (י)', rank: 2 },
    { key: 'e', label: 'מחזור ה (ט)', rank: 1 },
    { key: 'guest', label: 'אורח', rank: 0 }
  ];
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
    genderOptions: genderOptions
  };
})();
