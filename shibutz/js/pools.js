window.APP = window.APP || {};

APP.pools = (function () {
  var U = APP.util;

  function render() {
    renderTrainees();
    renderLeaders();
    renderFarmers();
    renderTemplates();
  }

  function renderTrainees() {
    var el = document.getElementById('tab-trainees');
    if (!el) return;
    var list = APP.state.get().pools.trainees;
    el.innerHTML = '<div class="card">' +
      '<h2>מתאמנים</h2>' +
      '<p class="muted">4 דירוגים קבועים בין 1-7 לכל מתאמן. משתתפים בשיבוץ האוטומטי (אלא אם נעדרים באותו יום).</p>' +
      '<div class="table-scroll"><table class="pool-table">' +
      '<thead><tr><th>שם</th><th>חוזק</th><th>זריזות</th><th>אחראיות</th><th>הנהגה</th><th>פעיל</th><th></th></tr></thead>' +
      '<tbody>' +
      list.map(function (t) {
        return '<tr data-id="' + t.id + '">' +
          '<td><input class="pool-input" data-field="name" value="' + U.escapeHtml(t.name) + '"></td>' +
          '<td><select data-field="strength">' + U.ratingOptions(t.ratings.strength) + '</select></td>' +
          '<td><select data-field="dexterity">' + U.ratingOptions(t.ratings.dexterity) + '</select></td>' +
          '<td><select data-field="responsibility">' + U.ratingOptions(t.ratings.responsibility) + '</select></td>' +
          '<td><select data-field="leadership">' + U.ratingOptions(t.ratings.leadership) + '</select></td>' +
          '<td><input type="checkbox" data-field="active" ' + (t.active !== false ? 'checked' : '') + '></td>' +
          '<td><button class="btn-tiny btn-danger" data-action="delete-trainee">מחק</button></td>' +
          '</tr>';
      }).join('') +
      (list.length ? '' : '<tr><td colspan="7" class="empty-row">אין מתאמנים עדיין</td></tr>') +
      '</tbody></table></div>' +
      '<div class="row add-row">' +
      '<input type="text" id="new-trainee-name" placeholder="שם מתאמן חדש">' +
      '<select id="new-trainee-strength" title="חוזק">' + U.ratingOptions(4) + '</select>' +
      '<select id="new-trainee-dexterity" title="זריזות">' + U.ratingOptions(4) + '</select>' +
      '<select id="new-trainee-responsibility" title="אחראיות">' + U.ratingOptions(4) + '</select>' +
      '<select id="new-trainee-leadership" title="הנהגה">' + U.ratingOptions(4) + '</select>' +
      '<button class="btn-primary" data-action="add-trainee">הוסף מתאמן</button>' +
      '</div>' +
      '</div>';
  }

  function renderSimplePool(containerId, poolKey, title, addLabel) {
    var el = document.getElementById(containerId);
    if (!el) return;
    var list = APP.state.get().pools[poolKey];
    el.innerHTML = '<div class="card">' +
      '<h2>' + title + '</h2>' +
      '<div class="table-scroll"><table class="pool-table">' +
      '<thead><tr><th>שם</th><th>פעיל</th><th></th></tr></thead>' +
      '<tbody>' +
      list.map(function (x) {
        return '<tr data-id="' + x.id + '">' +
          '<td><input class="pool-input" data-field="name" value="' + U.escapeHtml(x.name) + '"></td>' +
          '<td><input type="checkbox" data-field="active" ' + (x.active !== false ? 'checked' : '') + '></td>' +
          '<td><button class="btn-tiny btn-danger" data-action="delete-' + poolKey + '">מחק</button></td>' +
          '</tr>';
      }).join('') +
      (list.length ? '' : '<tr><td colspan="3" class="empty-row">אין רשומות עדיין</td></tr>') +
      '</tbody></table></div>' +
      '<div class="row add-row">' +
      '<input type="text" id="new-' + poolKey + '-name" placeholder="שם">' +
      '<button class="btn-primary" data-action="add-' + poolKey + '">' + addLabel + '</button>' +
      '</div>' +
      '</div>';
  }

  function renderLeaders() { renderSimplePool('tab-leaders', 'leaders', 'אנשי צוות', 'הוסף איש צוות'); }
  function renderFarmers() { renderSimplePool('tab-farmers', 'farmers', 'חקלאים', 'הוסף חקלאי'); }

  function renderTemplates() {
    var el = document.getElementById('tab-templates');
    if (!el) return;
    var list = APP.state.get().pools.postTemplates;
    el.innerHTML = '<div class="card">' +
      '<h2>תבניות עמדות עבודה</h2>' +
      '<p class="muted">דרישות ברירת מחדל שאפשר לבחור בהן בזמן הוספת עמדה למשימה יומית.</p>' +
      '<div class="table-scroll"><table class="pool-table">' +
      '<thead><tr><th>שם</th><th>חוזק</th><th>זריזות</th><th>אחראיות (רמה x כמות)</th><th>הנהגה (רמה x כמות)</th><th>מס\' עובדים</th><th>פעיל</th><th></th></tr></thead>' +
      '<tbody>' +
      list.map(function (tp) {
        var r = tp.defaultRequirements;
        return '<tr data-id="' + tp.id + '">' +
          '<td><input class="pool-input" data-field="name" value="' + U.escapeHtml(tp.name) + '"></td>' +
          '<td><select data-field="strength">' + U.ratingOptions(r.strength) + '</select></td>' +
          '<td><select data-field="dexterity">' + U.ratingOptions(r.dexterity) + '</select></td>' +
          '<td><select data-field="resp-level">' + U.ratingOptions(r.responsibilityMinCount.level) + '</select> x ' +
          '<input type="number" min="0" class="num-mini" data-field="resp-count" value="' + r.responsibilityMinCount.count + '"></td>' +
          '<td><select data-field="lead-level">' + U.ratingOptions(r.leadershipMinCount.level) + '</select> x ' +
          '<input type="number" min="0" class="num-mini" data-field="lead-count" value="' + r.leadershipMinCount.count + '"></td>' +
          '<td><input type="number" min="1" class="num-mini" data-field="workerCount" value="' + tp.defaultWorkerCount + '"></td>' +
          '<td><input type="checkbox" data-field="active" ' + (tp.active !== false ? 'checked' : '') + '></td>' +
          '<td><button class="btn-tiny btn-danger" data-action="delete-postTemplates">מחק</button></td>' +
          '</tr>';
      }).join('') +
      (list.length ? '' : '<tr><td colspan="8" class="empty-row">אין תבניות עדיין</td></tr>') +
      '</tbody></table></div>' +
      '<div class="row add-row">' +
      '<input type="text" id="new-postTemplates-name" placeholder="שם תבנית">' +
      '<button class="btn-primary" data-action="add-postTemplates">הוסף תבנית</button>' +
      '</div>' +
      '</div>';
  }

  return {
    render: render,
    renderTrainees: renderTrainees,
    renderLeaders: renderLeaders,
    renderFarmers: renderFarmers,
    renderTemplates: renderTemplates
  };
})();
