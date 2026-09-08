window.APP = window.APP || {};

APP.pools = (function () {
  var U = APP.util;

  function render() {
    renderTrainees();
    renderLeaders();
    renderFarmers();
  }

  function renderTrainees() {
    var el = document.getElementById('tab-trainees');
    if (!el) return;
    var list = APP.state.get().pools.trainees;
    el.innerHTML = '<div class="card">' +
      '<h2>חניכים</h2>' +
      '<p class="muted">4 דירוגים קבועים בין 1-7 לכל חניך. משתתפים בשיבוץ האוטומטי (אלא אם נעדרים באותו יום).</p>' +
      '<div class="table-scroll"><table class="pool-table">' +
      '<thead><tr><th>שם</th><th>חוזק</th><th>זריזות</th><th>אחראיות</th><th>הנהגה</th><th>פעיל</th><th></th></tr></thead>' +
      '<tbody>' +
      list.map(function (t) {
        return '<tr data-id="' + t.id + '">' +
          '<td><input class="pool-input" data-field="name" aria-label="שם" value="' + U.escapeHtml(t.name) + '"></td>' +
          '<td><select data-field="strength" aria-label="חוזק">' + U.ratingOptions(t.ratings.strength) + '</select></td>' +
          '<td><select data-field="dexterity" aria-label="זריזות">' + U.ratingOptions(t.ratings.dexterity) + '</select></td>' +
          '<td><select data-field="responsibility" aria-label="אחראיות">' + U.ratingOptions(t.ratings.responsibility) + '</select></td>' +
          '<td><select data-field="leadership" aria-label="הנהגה">' + U.ratingOptions(t.ratings.leadership) + '</select></td>' +
          '<td><input type="checkbox" data-field="active" aria-label="פעיל" ' + (t.active !== false ? 'checked' : '') + '></td>' +
          '<td><button class="btn-tiny btn-danger" data-action="delete-trainee">מחק</button></td>' +
          '</tr>';
      }).join('') +
      (list.length ? '' : '<tr><td colspan="7" class="empty-row">אין חניכים עדיין</td></tr>') +
      '</tbody></table></div>' +
      '<div class="row add-row">' +
      '<button class="btn-primary" data-action="add-trainee-start">+ הוסף חניך</button>' +
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
          '<td><input class="pool-input" data-field="name" aria-label="שם" value="' + U.escapeHtml(x.name) + '"></td>' +
          '<td><input type="checkbox" data-field="active" aria-label="פעיל" ' + (x.active !== false ? 'checked' : '') + '></td>' +
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

  function renderFarmers() {
    var el = document.getElementById('tab-farmers');
    if (!el) return;
    var list = APP.state.get().pools.farmers;
    var traineesById = {};
    APP.state.get().pools.trainees.forEach(function (t) { traineesById[t.id] = t; });
    el.innerHTML = '<div class="card">' +
      '<h2>חקלאים</h2>' +
      '<div class="table-scroll"><table class="pool-table">' +
      '<thead><tr><th>שם</th><th>טלפון</th><th>מיקום</th><th>חניכים מועדפים</th><th>פעיל</th><th></th></tr></thead>' +
      '<tbody>' +
      list.map(function (f) {
        var prefNames = (f.preferredTraineeIds || [])
          .map(function (id) { var t = traineesById[id]; return t ? U.escapeHtml(t.name) : null; })
          .filter(Boolean).join(', ');
        return '<tr data-id="' + f.id + '">' +
          '<td><input class="pool-input" data-field="name" aria-label="שם" value="' + U.escapeHtml(f.name) + '"></td>' +
          '<td><input class="pool-input" data-field="phone" aria-label="טלפון" value="' + U.escapeHtml(f.phone || '') + '"></td>' +
          '<td><input class="pool-input" data-field="location" aria-label="מיקום" value="' + U.escapeHtml(f.location || '') + '"></td>' +
          '<td><span class="muted">' + (prefNames || '-') + '</span> ' +
            '<button class="btn-tiny" data-action="edit-farmer-prefs" data-farmer-id="' + f.id + '">ערוך</button></td>' +
          '<td><input type="checkbox" data-field="active" aria-label="פעיל" ' + (f.active !== false ? 'checked' : '') + '></td>' +
          '<td><button class="btn-tiny btn-danger" data-action="delete-farmers">מחק</button></td>' +
          '</tr>';
      }).join('') +
      (list.length ? '' : '<tr><td colspan="6" class="empty-row">אין חקלאים עדיין</td></tr>') +
      '</tbody></table></div>' +
      '<div class="row add-row">' +
      '<input type="text" id="new-farmers-name" placeholder="שם">' +
      '<button class="btn-primary" data-action="add-farmers">הוסף חקלאי</button>' +
      '</div>' +
      '</div>';
  }

  function farmerPrefsModalHtml(farmer) {
    var trainees = APP.state.get().pools.trainees;
    var selected = farmer.preferredTraineeIds || [];
    return '<h2>חניכים מועדפים עבור ' + U.escapeHtml(farmer.name) + '</h2>' +
      '<p class="muted">חניכים אלה יקבלו עדיפות בשיבוץ האוטומטי לעמדות של חקלאי זה.</p>' +
      '<div class="pref-checklist">' +
      trainees.map(function (t) {
        var checked = selected.indexOf(t.id) >= 0;
        return '<label class="absent-item"><input type="checkbox" data-trainee-id="' + t.id + '" ' +
          (checked ? 'checked' : '') + '>' + U.escapeHtml(t.name) + '</label>';
      }).join('') +
      '</div>' +
      '<div class="row" style="margin-top:12px;">' +
      '<button class="btn-secondary" data-action="farmer-prefs-cancel">בטל</button>' +
      '<button class="btn-primary" data-action="farmer-prefs-save" data-farmer-id="' + farmer.id + '">שמור</button>' +
      '</div>';
  }

  function addTraineeModalHtml() {
    return '<h2>הוסף חניך חדש</h2>' +
      '<div style="display: flex; flex-direction: column; gap: 10px;">' +
      '<label><span style="display: block; font-size: var(--fs-1); color: var(--muted); margin-bottom: 4px;">שם</span>' +
      '<input type="text" id="modal-trainee-name" placeholder="שם החניך" style="width: 100%;">' +
      '</label>' +
      '<label><span style="display: block; font-size: var(--fs-1); color: var(--muted); margin-bottom: 4px;">חוזק פיזי</span>' +
      '<select id="modal-trainee-strength" style="width: 100%;">' + U.ratingOptions(4) + '</select>' +
      '</label>' +
      '<label><span style="display: block; font-size: var(--fs-1); color: var(--muted); margin-bottom: 4px;">זריזות ידיים</span>' +
      '<select id="modal-trainee-dexterity" style="width: 100%;">' + U.ratingOptions(4) + '</select>' +
      '</label>' +
      '<label><span style="display: block; font-size: var(--fs-1); color: var(--muted); margin-bottom: 4px;">אחראיות</span>' +
      '<select id="modal-trainee-responsibility" style="width: 100%;">' + U.ratingOptions(4) + '</select>' +
      '</label>' +
      '<label><span style="display: block; font-size: var(--fs-1); color: var(--muted); margin-bottom: 4px;">הנהגה</span>' +
      '<select id="modal-trainee-leadership" style="width: 100%;">' + U.ratingOptions(4) + '</select>' +
      '</label>' +
      '<div class="row" style="margin-top: 12px;">' +
      '<button class="btn-secondary" data-action="add-trainee-cancel">בטל</button>' +
      '<button class="btn-primary" data-action="add-trainee-commit">הוסף</button>' +
      '</div>' +
      '</div>';
  }

  return {
    render: render,
    renderTrainees: renderTrainees,
    renderLeaders: renderLeaders,
    renderFarmers: renderFarmers,
    addTraineeModalHtml: addTraineeModalHtml,
    farmerPrefsModalHtml: farmerPrefsModalHtml
  };
})();
