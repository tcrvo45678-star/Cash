window.APP = window.APP || {};

APP.render = (function () {
  var U = APP.util;
  var dragAttached = false;

  function renderTaskTab() {
    var el = document.getElementById('tab-task');
    var task = APP.state.getCurrentTask();
    el.innerHTML = task ? renderTaskCard(task) : renderNoTask();

    if (!dragAttached) {
      APP.dragswap.attach(el, function (a, b) {
        var t = APP.state.getCurrentTask();
        if (!t) return;
        APP.state.swapCells(t, a, b);
        if (t.assignment) {
          t.assignment.spare = t.assignment.spare.filter(function (v) { return v.t !== 'empty'; });
          APP.state.save();
        }
        renderTaskTab();
      });
      dragAttached = true;
    }
  }

  function renderNoTask() {
    var today = APP.state.todayISO();
    return '' +
      '<div class="card">' +
      '<h2>אין משימה פתוחה</h2>' +
      '<p>בחר תאריך ליצירת משימה חדשה (עמדות היום הקודם ייטענו אוטומטית כברירת מחדל, אם קיימות):</p>' +
      '<div class="row">' +
      '<input type="date" id="new-task-date" value="' + today + '">' +
      '<button class="btn-primary" data-action="create-task">צור / פתח משימה</button>' +
      '</div>' +
      '</div>';
  }

  function metaRowsHtml(task) {
    return task.meta.map(function (m) {
      var cellId = 'meta:' + m.key;
      var val = m.value;
      var inner = (val.t === 'text')
        ? '<input class="cell-input" data-cell-input="' + cellId + '" value="' + U.escapeHtml(val.v) + '">'
        : '<span class="cell-text">' + U.escapeHtml(APP.state.cellDisplay(val, task)) + '</span>';
      return '<tr>' +
        '<th>' + U.escapeHtml(m.label) + '</th>' +
        '<td class="cell" data-cell-id="' + cellId + '">' + inner + '</td>' +
        '</tr>';
    }).join('');
  }

  function postHeaderHtml(task, post) {
    var cellId = 'post:' + post.id + ':header';
    var name = APP.state.cellDisplay(post.leader, task);
    return '<div class="cell post-header" data-cell-id="' + cellId + '">' +
      '<div class="post-leader-name">' + U.escapeHtml(name || '(ריק)') + '</div>' +
      '</div>';
  }

  function postMetaLine(task, post) {
    var farmer = APP.state.findById(APP.state.get().pools.farmers, post.farmerId);
    var r = post.requirements;
    return '<div class="post-sub">' +
      '<div>חקלאי: ' + U.escapeHtml(farmer ? farmer.name : '-') + '</div>' +
      '<div>חוזק: ' + r.strength + ' | זריזות: ' + r.dexterity + '</div>' +
      '<div>אחראיות: ≥' + r.responsibilityMinCount.level + ' x' + r.responsibilityMinCount.count + '</div>' +
      '<div>הנהגה: ≥' + r.leadershipMinCount.level + ' x' + r.leadershipMinCount.count + '</div>' +
      '<div class="post-actions no-print">' +
      '<button class="btn-tiny" data-action="edit-post" data-post-id="' + post.id + '">ערוך</button>' +
      '<button class="btn-tiny btn-danger" data-action="delete-post" data-post-id="' + post.id + '">מחק</button>' +
      '</div>' +
      '</div>';
  }

  function gridHtml(task) {
    if (!task.posts.length) {
      return '<p class="muted">אין עדיין עמדות עבודה למשימה זו. הוסף עמדה כדי להתחיל.</p>';
    }
    var maxSlots = task.assignment
      ? Math.max.apply(null, task.posts.map(function (p) { return p.workerCount; }).concat([0]))
      : 0;

    var head = '<tr>' + task.posts.map(function (post) {
      return '<th>' + postHeaderHtml(task, post) + postMetaLine(task, post) + '</th>';
    }).join('') + '</tr>';

    var bodyRows = '';
    for (var i = 0; i < maxSlots; i++) {
      bodyRows += '<tr>' + task.posts.map(function (post) {
        if (i >= post.workerCount) return '<td class="grid-cell empty-cell"></td>';
        var cellId = 'post:' + post.id + ':slot:' + i;
        var pa = task.assignment.postAssignments[post.id];
        var val = (pa && pa.workerIds[i]) ? pa.workerIds[i] : APP.state.emptyVal();
        var text = APP.state.cellDisplay(val, task);
        var kindClass = val.t === 'ref' ? (' kind-' + val.rt) : '';
        return '<td class="grid-cell cell' + kindClass + '" data-cell-id="' + cellId + '">' +
          '<span class="cell-text">' + U.escapeHtml(text) + '</span>' +
          '</td>';
      }).join('') + '</tr>';
    }

    return '<div class="grid-scroll"><table class="assign-table">' +
      '<thead>' + head + '</thead>' +
      '<tbody>' + bodyRows + '</tbody>' +
      '</table></div>';
  }

  function spareHtml(task) {
    if (!task.assignment || !task.assignment.spare.length) return '';
    var items = task.assignment.spare.map(function (v, i) {
      return '<div class="cell spare-chip" data-cell-id="spare:' + i + '">' +
        U.escapeHtml(APP.state.cellDisplay(v, task)) + '</div>';
    }).join('');
    return '<div class="spare-panel"><h3>ספייר (עודפים)</h3><div class="spare-list">' + items + '</div></div>';
  }

  function absentPanel(task) {
    var trainees = APP.state.activeOnly(APP.state.get().pools.trainees);
    if (!trainees.length) return '<p class="muted">אין חניכים במאגר. הוסף חניכים בלשונית "חניכים".</p>';
    return '<div class="absent-list">' + trainees.map(function (t) {
      var checked = task.absentTraineeIds.indexOf(t.id) >= 0;
      return '<label class="absent-item">' +
        '<input type="checkbox" data-action="toggle-absent" data-trainee-id="' + t.id + '" ' + (checked ? 'checked' : '') + '>' +
        U.escapeHtml(t.name) +
        '</label>';
    }).join('') + '</div>';
  }

  function guestsHtml(task) {
    var list = task.extraGuests.map(function (g) {
      return '<span class="guest-chip">' + U.escapeHtml(g.name) +
        ' <button class="chip-x" data-action="remove-guest" data-guest-id="' + g.id + '">×</button></span>';
    }).join('');
    return '<div class="guests-row">' +
      '<div class="guests-list">' + list + '</div>' +
      '<div class="row">' +
      '<input type="text" id="new-guest-name" placeholder="שם אורח">' +
      '<button class="btn-secondary" data-action="add-guest">הוסף אורח</button>' +
      '</div>' +
      '</div>';
  }

  function postStepperHtml() {
    var s = APP.task.getStepper();
    if (!s) return "";
    var farmers = APP.state.get().pools.farmers;
    var leaders = APP.state.activeOnly(APP.state.get().pools.leaders);
    var templates = APP.state.get().pools.postTemplates;
    var body = "";

    if (s.step === 1) {
      body = "<h4>שלב 1 מתוך 3: חקלאי</h4>" +
        "<select id=\"stepper-farmer-select\">" +
        "<option value=\"\">-- בחר חקלאי קיים --</option>" +
        farmers.map(function (f) {
          return "<option value=\"" + f.id + "\"" + (s.farmerId === f.id ? " selected" : "") + ">" + U.escapeHtml(f.name) + "</option>";
        }).join("") +
        "</select>" +
        "<div class=\"or-sep\">או הוסף חקלאי חדש:</div>" +
        "<input type=\"text\" id=\"stepper-farmer-new\" placeholder=\"שם חקלאי חדש\" value=\"" + U.escapeHtml(s.newFarmerName) + "\">" +
        (templates.length ? (
          "<div class=\"or-sep\">תבנית עמדה (אופציונלי - ימלא ברירות מחדל בשלב 3):</div>" +
          "<select id=\"stepper-template-select\">" +
          "<option value=\"\">-- ללא תבנית --</option>" +
          templates.map(function (tp) {
            return "<option value=\"" + tp.id + "\"" + (s.templateId === tp.id ? " selected" : "") + ">" + U.escapeHtml(tp.name) + "</option>";
          }).join("") +
          "</select>"
        ) : "") +
        "<div class=\"row\">" +
        "<button class=\"btn-secondary\" data-action=\"stepper-cancel\">בטל</button>" +
        "<button class=\"btn-primary\" data-action=\"stepper-next-1\">הבא</button>" +
        "</div>";
    } else if (s.step === 2) {
      body = "<h4>שלב 2 מתוך 3: איש צוות מוביל</h4>" +
        "<select id=\"stepper-leader-select\">" +
        "<option value=\"\">-- בחר איש צוות --</option>" +
        leaders.map(function (l) {
          return "<option value=\"" + l.id + "\"" + (s.leaderId === l.id ? " selected" : "") + ">" + U.escapeHtml(l.name) + "</option>";
        }).join("") +
        "</select>" +
        "<div class=\"row\">" +
        "<button class=\"btn-secondary\" data-action=\"stepper-back\">חזור</button>" +
        "<button class=\"btn-primary\" data-action=\"stepper-next-2\">הבא</button>" +
        "</div>";
    } else {
      var r = s.requirements;
      body = "<h4>שלב 3 מתוך 3: דרישות העמדה</h4>" +
        "<div class=\"req-grid\">" +
        "<label>חוזק פיזי נדרש<select id=\"req-strength\">" + U.ratingOptions(r.strength) + "</select></label>" +
        "<label>זריזות ידיים נדרשת<select id=\"req-dexterity\">" + U.ratingOptions(r.dexterity) + "</select></label>" +
        "<label>אחראיות - רמה<select id=\"req-resp-level\">" + U.ratingOptions(r.responsibilityMinCount.level) + "</select></label>" +
        "<label>אחראיות - כמות מינ<input type=\"number\" min=\"0\" id=\"req-resp-count\" value=\"" + r.responsibilityMinCount.count + "\"></label>" +
        "<label>הנהגה - רמה<select id=\"req-lead-level\">" + U.ratingOptions(r.leadershipMinCount.level) + "</select></label>" +
        "<label>הנהגה - כמות מינ<input type=\"number\" min=\"0\" id=\"req-lead-count\" value=\"" + r.leadershipMinCount.count + "\"></label>" +
        "<label>מספר עובדים נדרש בעמדה<input type=\"number\" min=\"1\" id=\"req-worker-count\" value=\"" + s.workerCount + "\"></label>" +
        "</div>" +
        "<div class=\"row\">" +
        "<button class=\"btn-secondary\" data-action=\"stepper-back\">חזור</button>" +
        "<button class=\"btn-primary\" data-action=\"stepper-commit\">" + (s.editingPostId ? "שמור שינויים" : "הוסף עמדה") + "</button>" +
        "</div>";
    }
    return "<div class=\"stepper-card\">" + body + "</div>";
  }

  function renderTaskCard(task) {
    return '' +
      '<div class="card task-card">' +
      '<div class="task-top-bar no-print">' +
      '<div><strong>תאריך המשימה:</strong> ' + task.date + '</div>' +
      '<div class="row">' +
      '<input type="date" id="new-task-date" value="' + APP.state.todayISO() + '">' +
      '<button class="btn-secondary" data-action="create-task">משימה חדשה / פתח תאריך</button>' +
      '<button class="btn-primary" data-action="auto-assign">שבץ אוטומטית</button>' +
      '<button class="btn-secondary" data-action="task-details-start">פרטי המשימה</button>' +
      '<button class="btn-secondary" data-action="preview-open">תצוגה מקדימה</button>' +
      '<button class="btn-secondary" data-action="print">הדפס</button>' +
      '</div>' +
      '</div>' +

      '<div class="section no-print">' +
      '<div class="section-title-row">' +
      '<h3>עמדות עבודה</h3>' +
      '<button class="btn-secondary" data-action="add-post-start">+ הוסף עמדה</button>' +
      '</div>' +
      '</div>' +

      '<div class="section no-print">' +
      '<h3>נעדרים היום</h3>' + absentPanel(task) +
      '</div>' +

      '<div class="section no-print">' +
      '<h3>אורחים</h3>' + guestsHtml(task) +
      '</div>' +

      '<div class="section">' +
      gridHtml(task) +
      spareHtml(task) +
      '</div>' +

      '<p class="drag-hint no-print">טיפ: אפשר לגרור כל תא (שם עובד או כותרת עמדה) ולהחליף אותו עם כל תא אחר.</p>' +
      '</div>';
  }

  function taskDetailsModalHtml(task) {
    return '' +
      '<h2>פרטי המשימה</h2>' +
      '<table class="meta-table">' + metaRowsHtml(task) + '</table>' +
      '<div class="row" style="margin-top:12px;">' +
      '<button class="btn-primary" data-action="task-details-close">סגור</button>' +
      '</div>';
  }

  return { renderTaskTab: renderTaskTab, postStepperHtml: postStepperHtml, taskDetailsModalHtml: taskDetailsModalHtml };
})();
