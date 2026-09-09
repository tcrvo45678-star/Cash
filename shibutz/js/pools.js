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
      '<thead><tr><th>שם</th><th>מחזור</th><th>מגדר</th><th>חוזק</th><th>זריזות</th><th>אחראיות</th><th>הנהגה</th><th>פעיל</th><th></th></tr></thead>' +
      '<tbody>' +
      list.map(function (t) {
        return '<tr data-id="' + t.id + '"' + (t.active === false ? ' class="inactive-row"' : '') + '>' +
          '<td><input class="pool-input" data-field="name" aria-label="שם" value="' + U.escapeHtml(t.name) + '"></td>' +
          '<td><select data-field="cohort" aria-label="מחזור">' + U.cohortOptions(t.cohort) + '</select></td>' +
          '<td><select data-field="gender" aria-label="מגדר">' + U.genderOptions(t.gender) + '</select></td>' +
          '<td><select data-field="strength" aria-label="חוזק">' + U.ratingOptions(t.ratings.strength) + '</select></td>' +
          '<td><select data-field="dexterity" aria-label="זריזות">' + U.ratingOptions(t.ratings.dexterity) + '</select></td>' +
          '<td><select data-field="responsibility" aria-label="אחראיות">' + U.ratingOptions(t.ratings.responsibility) + '</select></td>' +
          '<td><select data-field="leadership" aria-label="הנהגה">' + U.ratingOptions(t.ratings.leadership) + '</select></td>' +
          '<td><input type="checkbox" data-field="active" aria-label="פעיל" ' + (t.active !== false ? 'checked' : '') + '></td>' +
          '<td><button class="btn-tiny btn-danger" data-action="delete-trainee">מחק</button></td>' +
          '</tr>';
      }).join('') +
      (list.length ? '' : '<tr><td colspan="9" class="empty-row">אין חניכים עדיין</td></tr>') +
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
        return '<tr data-id="' + x.id + '"' + (x.active === false ? ' class="inactive-row"' : '') + '>' +
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
      '<thead><tr><th>שם</th><th>טלפון</th><th>מיקום</th><th>סוג עבודה</th><th>חניכים מועדפים</th><th>פעיל</th><th></th></tr></thead>' +
      '<tbody>' +
      list.map(function (f) {
        var prefNames = (f.preferredTraineeIds || [])
          .map(function (id) { var t = traineesById[id]; return t ? U.escapeHtml(t.name) : null; })
          .filter(Boolean).join(', ');
        return '<tr data-id="' + f.id + '"' + (f.active === false ? ' class="inactive-row"' : '') + '>' +
          '<td><input class="pool-input" data-field="name" aria-label="שם" value="' + U.escapeHtml(f.name) + '"></td>' +
          '<td><input class="pool-input" data-field="phone" aria-label="טלפון" value="' + U.escapeHtml(f.phone || '') + '"></td>' +
          '<td><input class="pool-input" data-field="location" aria-label="מיקום" value="' + U.escapeHtml(f.location || '') + '"></td>' +
          '<td><input class="pool-input" data-field="jobType" aria-label="סוג עבודה" value="' + U.escapeHtml(f.jobType || '') + '"></td>' +
          '<td><span class="muted">' + (prefNames || '-') + '</span> ' +
            '<button class="btn-tiny" data-action="edit-farmer-prefs" data-farmer-id="' + f.id + '">ערוך</button></td>' +
          '<td><input type="checkbox" data-field="active" aria-label="פעיל" ' + (f.active !== false ? 'checked' : '') + '></td>' +
          '<td><button class="btn-tiny btn-danger" data-action="delete-farmers">מחק</button></td>' +
          '</tr>';
      }).join('') +
      (list.length ? '' : '<tr><td colspan="7" class="empty-row">אין חקלאים עדיין</td></tr>') +
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
      '<label><span style="display: block; font-size: var(--fs-1); color: var(--muted); margin-bottom: 4px;">מחזור</span>' +
      '<select id="modal-trainee-cohort" style="width: 100%;">' + U.cohortOptions('e') + '</select>' +
      '</label>' +
      '<label><span style="display: block; font-size: var(--fs-1); color: var(--muted); margin-bottom: 4px;">מגדר</span>' +
      '<select id="modal-trainee-gender" style="width: 100%;">' + U.genderOptions('m') + '</select>' +
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

  // A library of recurring job profiles ("עבודות קבועות") - the user
  // decides once what qualities a given job needs, then picks it from the
  // post stepper instead of re-entering the same requirements every time.
  function renderJobTemplates() {
    var el = document.getElementById('tab-jobtemplates');
    if (!el) return;
    var list = APP.state.get().pools.postTemplates;
    el.innerHTML = '<div class="card">' +
      '<h2>עבודות קבועות</h2>' +
      '<p class="muted">הגדר/י כאן פרופילי עבודה קבועים (הדרישות שחניך צריך לעמוד בהן) - בעת הוספת עמדה חדשה אפשר לבחור עבודה קבועה ולמלא אוטומטית את הדרישות.</p>' +
      '<div class="table-scroll"><table class="pool-table">' +
      '<thead><tr><th>שם העבודה</th><th>חוזק</th><th>זריזות</th><th>אחראיות (רמה/כמות)</th><th>הנהגה (רמה/כמות)</th><th>מגדר מינ׳ (בנים/בנות)</th><th>מס׳ עובדים</th><th>פעיל</th><th></th></tr></thead>' +
      '<tbody>' +
      list.map(function (tpl) {
        var r = tpl.defaultRequirements;
        return '<tr data-id="' + tpl.id + '"' + (tpl.active === false ? ' class="inactive-row"' : '') + '>' +
          '<td><input class="pool-input" data-field="name" aria-label="שם העבודה" value="' + U.escapeHtml(tpl.name) + '"></td>' +
          '<td><select data-field="strength" aria-label="חוזק">' + U.ratingOptions(r.strength) + '</select></td>' +
          '<td><select data-field="dexterity" aria-label="זריזות">' + U.ratingOptions(r.dexterity) + '</select></td>' +
          '<td class="req-pair"><select data-field="resp-level" aria-label="אחראיות רמה">' + U.ratingOptions(r.responsibilityMinCount.level) + '</select>' +
            '<input type="number" min="0" data-field="resp-count" aria-label="אחראיות כמות" value="' + r.responsibilityMinCount.count + '"></td>' +
          '<td class="req-pair"><select data-field="lead-level" aria-label="הנהגה רמה">' + U.ratingOptions(r.leadershipMinCount.level) + '</select>' +
            '<input type="number" min="0" data-field="lead-count" aria-label="הנהגה כמות" value="' + r.leadershipMinCount.count + '"></td>' +
          '<td class="req-pair"><input type="number" min="0" data-field="gender-male" aria-label="מינ׳ בנים" value="' + r.genderMinCount.male + '">' +
            '<input type="number" min="0" data-field="gender-female" aria-label="מינ׳ בנות" value="' + r.genderMinCount.female + '"></td>' +
          '<td><input type="number" min="1" data-field="workerCount" aria-label="מספר עובדים" placeholder="גמיש" value="' + (tpl.defaultWorkerCount == null ? '' : tpl.defaultWorkerCount) + '"></td>' +
          '<td><input type="checkbox" data-field="active" aria-label="פעיל" ' + (tpl.active !== false ? 'checked' : '') + '></td>' +
          '<td><button class="btn-tiny btn-danger" data-action="delete-jobtemplate">מחק</button></td>' +
          '</tr>';
      }).join('') +
      (list.length ? '' : '<tr><td colspan="9" class="empty-row">אין עבודות קבועות עדיין</td></tr>') +
      '</tbody></table></div>' +
      '<div class="row add-row">' +
      '<button class="btn-primary" data-action="add-jobtemplate-start">+ הוסף עבודה קבועה</button>' +
      '</div>' +
      '</div>';
  }

  function addJobTemplateModalHtml() {
    return '<h2>עבודה קבועה חדשה</h2>' +
      '<div style="display: flex; flex-direction: column; gap: 10px;">' +
      '<label><span style="display: block; font-size: var(--fs-1); color: var(--muted); margin-bottom: 4px;">שם העבודה</span>' +
      '<input type="text" id="modal-jobtemplate-name" placeholder="לדוגמה: עבודה בלול" style="width: 100%;">' +
      '</label>' +
      '<label><span style="display: block; font-size: var(--fs-1); color: var(--muted); margin-bottom: 4px;">חוזק פיזי נדרש</span>' +
      '<select id="modal-jobtemplate-strength" style="width: 100%;">' + U.ratingOptions(4) + '</select>' +
      '</label>' +
      '<label><span style="display: block; font-size: var(--fs-1); color: var(--muted); margin-bottom: 4px;">זריזות ידיים נדרשת</span>' +
      '<select id="modal-jobtemplate-dexterity" style="width: 100%;">' + U.ratingOptions(4) + '</select>' +
      '</label>' +
      '<label><span style="display: block; font-size: var(--fs-1); color: var(--muted); margin-bottom: 4px;">מספר עובדים (השאר ריק לגמיש)</span>' +
      '<input type="number" min="1" id="modal-jobtemplate-workercount" style="width: 100%;">' +
      '</label>' +
      '<div class="row" style="margin-top: 12px;">' +
      '<button class="btn-secondary" data-action="add-jobtemplate-cancel">בטל</button>' +
      '<button class="btn-primary" data-action="add-jobtemplate-commit">הוסף</button>' +
      '</div>' +
      '<p class="muted">אפשר לכוון דרישות אחראיות/הנהגה/מגדר מדויקות בטבלה אחרי ההוספה.</p>' +
      '</div>';
  }

  return {
    render: render,
    renderTrainees: renderTrainees,
    renderLeaders: renderLeaders,
    renderFarmers: renderFarmers,
    renderJobTemplates: renderJobTemplates,
    addTraineeModalHtml: addTraineeModalHtml,
    addJobTemplateModalHtml: addJobTemplateModalHtml,
    farmerPrefsModalHtml: farmerPrefsModalHtml
  };
})();
