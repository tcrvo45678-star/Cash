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
          APP.assign.recomputePhoneCarriers(t, APP.state.get().pools, t.assignment.postAssignments);
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
        ? '<input class="cell-input" data-cell-input="' + cellId + '" aria-label="' + U.escapeHtml(m.label) + '" value="' + U.escapeHtml(val.v) + '">'
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
    var farmer = APP.state.findById(APP.state.get().pools.farmers, post.farmerId);
    var detailsLine = [farmer && farmer.jobType, farmer && farmer.location].filter(Boolean).join(' · ');
    return '<div class="cell post-header" tabindex="0" data-cell-id="' + cellId + '">' +
      '<div class="post-farmer-name">' + U.escapeHtml(farmer ? farmer.name : '(ללא חקלאי)') + '</div>' +
      (detailsLine ? '<div class="post-farmer-details">' + U.escapeHtml(detailsLine) + '</div>' : '') +
      '<div class="post-leader-name">' + U.escapeHtml(name || '(ריק)') + '</div>' +
      '<div class="post-worker-count">' + workerCountBadge(task, post) + '</div>' +
      '</div>';
  }

  function workerCountBadge(task, post) {
    var pa = task.assignment && task.assignment.postAssignments[post.id];
    var assignedCount = pa ? pa.workerIds.filter(function (w) { return w.t === 'ref'; }).length : 0;
    return post.workerCount != null
      ? assignedCount + '/' + post.workerCount + ' עובדים'
      : assignedCount + ' עובדים (גמיש)';
  }

  function postActionsLine(post) {
    return '<div class="post-actions no-print">' +
      '<button class="btn-tiny" data-action="edit-post" data-post-id="' + post.id + '">ערוך</button>' +
      '<button class="btn-tiny btn-danger" data-action="delete-post" data-post-id="' + post.id + '">מחק</button>' +
      '</div>';
  }

  function assignedCountFor(task, post) {
    var pa = task.assignment && task.assignment.postAssignments[post.id];
    return pa ? pa.workerIds.filter(function (w) { return w.t === 'ref'; }).length : 0;
  }

  function taskMaxSlots(task) {
    return task.assignment
      ? Math.max.apply(null, task.posts.map(function (p) { return p.workerCount != null ? p.workerCount : assignedCountFor(task, p); }).concat([0]))
      : 0;
  }

  // Shared slot-cell data for both the desktop table (gridHtml) and the
  // mobile per-post cards (postCardsHtml) - keeps cohort/phone-badge/kind
  // logic in one place so the two layouts never drift apart.
  function slotCellData(task, post, i) {
    if (post.workerCount != null && i >= post.workerCount) return null;
    var cellId = 'post:' + post.id + ':slot:' + i;
    var pa = task.assignment.postAssignments[post.id];
    var val = (pa && pa.workerIds[i]) ? pa.workerIds[i] : APP.state.emptyVal();
    var text = APP.state.cellDisplay(val, task);
    var kindClass = val.t === 'ref' ? (' kind-' + val.rt) : '';
    var cohortClass = '';
    if (val.t === 'ref' && val.rt === 'trainee') {
      var tr = APP.state.findById(APP.state.get().pools.trainees, val.id);
      if (tr && tr.cohort) cohortClass = ' cohort-' + tr.cohort;
      if (pa && pa.phoneCarrierId && pa.phoneCarrierId === val.id) text += ' 📱';
    }
    return { cellId: cellId, text: text, kindClass: kindClass, cohortClass: cohortClass };
  }

  function gridHtml(task) {
    if (!task.posts.length) {
      return '<p class="muted">אין עדיין עמדות עבודה למשימה זו. הוסף עמדה כדי להתחיל.</p>';
    }
    var maxSlots = taskMaxSlots(task);

    var head = '<tr>' + task.posts.map(function (post) {
      return '<th>' + postHeaderHtml(task, post) + postActionsLine(post) + '</th>';
    }).join('') + '</tr>';

    var bodyRows = '';
    for (var i = 0; i < maxSlots; i++) {
      bodyRows += '<tr>' + task.posts.map(function (post) {
        var cell = slotCellData(task, post, i);
        if (!cell) return '<td class="grid-cell empty-cell"></td>';
        return '<td class="grid-cell cell' + cell.kindClass + cell.cohortClass + '" tabindex="0" data-cell-id="' + cell.cellId + '">' +
          '<span class="cell-text">' + U.escapeHtml(cell.text) + '</span>' +
          '</td>';
      }).join('') + '</tr>';
    }

    return '<div class="assign-table-wrap"><div class="grid-scroll"><table class="assign-table">' +
      '<thead>' + head + '</thead>' +
      '<tbody>' + bodyRows + '</tbody>' +
      '</table></div></div>';
  }

  function postCardsHtml(task) {
    if (!task.posts.length) return '';
    var maxSlots = taskMaxSlots(task);
    var cards = task.posts.map(function (post) {
      var rows = '';
      for (var i = 0; i < maxSlots; i++) {
        var cell = slotCellData(task, post, i);
        if (!cell) continue;
        rows += '<div class="cell post-card-cell' + cell.kindClass + cell.cohortClass + '" tabindex="0" data-cell-id="' + cell.cellId + '">' +
          '<span class="cell-text">' + U.escapeHtml(cell.text || '(ריק)') + '</span>' +
          '</div>';
      }
      return '<div class="post-card">' +
        '<div class="post-card-header">' + postHeaderHtml(task, post) + postActionsLine(post) + '</div>' +
        '<div class="post-card-slots">' + rows + '</div>' +
        '</div>';
    }).join('');
    return '<div class="post-cards">' + cards + '</div>';
  }

  function spareHtml(task) {
    if (!task.assignment || !task.assignment.spare.length) return '';
    var items = task.assignment.spare.map(function (v, i) {
      var cohortClass = '';
      if (v.t === 'ref' && v.rt === 'trainee') {
        var tr = APP.state.findById(APP.state.get().pools.trainees, v.id);
        if (tr && tr.cohort) cohortClass = ' cohort-' + tr.cohort;
      }
      return '<div class="cell spare-chip' + cohortClass + '" tabindex="0" data-cell-id="spare:' + i + '">' +
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
      '<select id="new-guest-gender">' + U.genderOptions('m') + '</select>' +
      '<button class="btn-secondary" data-action="add-guest">הוסף אורח</button>' +
      '</div>' +
      '</div>';
  }

  function postStepperHtml() {
    var s = APP.task.getStepper();
    if (!s) return "";
    var farmers = APP.state.get().pools.farmers;
    var leaders = APP.state.activeOnly(APP.state.get().pools.leaders);
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
        "<div class=\"or-sep\">דרך הגעה:</div>" +
        "<select id=\"stepper-transport-select\">" +
        "<option value=\"shuttle\"" + (s.transportMethod === "shuttle" ? " selected" : "") + ">הסעה</option>" +
        "<option value=\"transporter\"" + (s.transportMethod === "transporter" ? " selected" : "") + ">טרנספורטר</option>" +
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
        "<label>מספר עובדים נדרש בעמדה (השאר ריק לשיבוץ גמיש)<input type=\"number\" min=\"1\" id=\"req-worker-count\" value=\"" + (s.workerCount == null ? "" : s.workerCount) + "\"></label>" +
        "<label>מינ' בנים<input type=\"number\" min=\"0\" id=\"req-gender-male\" value=\"" + r.genderMinCount.male + "\"></label>" +
        "<label>מינ' בנות<input type=\"number\" min=\"0\" id=\"req-gender-female\" value=\"" + r.genderMinCount.female + "\"></label>" +
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
      '<h3>אורחים</h3>' + guestsHtml(task) +
      '</div>' +

      '<div class="section">' +
      gridHtml(task) +
      postCardsHtml(task) +
      spareHtml(task) +
      '</div>' +

      '<div class="section no-print">' +
      '<h3>נעדרים היום</h3>' + absentPanel(task) +
      '</div>' +

      '<p class="drag-hint no-print">טיפ: אפשר לגרור כל תא (שם עובד או כותרת עמדה) ולהחליף אותו עם כל תא אחר.</p>' +
      '</div>';
  }

  function carriedPostsModalHtml(task) {
    var pools = APP.state.get().pools;
    var rows = task.posts.map(function (post) {
      var farmer = APP.state.findById(pools.farmers, post.farmerId);
      var leaderName = APP.state.cellDisplay(post.leader, task);
      return '<label class="absent-item">' +
        '<input type="checkbox" data-post-id="' + post.id + '" checked>' +
        U.escapeHtml((farmer ? farmer.name : '(ללא חקלאי)') + ' - ' + (leaderName || '(ריק)')) +
        '</label>';
    }).join('');
    return '<h2>עמדות מהיום הקודם</h2>' +
      '<p class="muted">העמדות הבאות הועתקו אוטומטית מהמשימה הקודמת. סמן/י אילו להשאיר, ובטל/י סימון כדי למחוק.</p>' +
      '<div class="absent-list">' + rows + '</div>' +
      '<div class="row" style="margin-top:12px;">' +
      '<button class="btn-primary" data-action="carried-posts-done">המשך</button>' +
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

  function postRequirementCardHtml(task, post) {
    var farmer = APP.state.findById(APP.state.get().pools.farmers, post.farmerId);
    var r = post.requirements;
    var leaderName = APP.state.cellDisplay(post.leader, task);
    var pa = task.assignment && task.assignment.postAssignments[post.id];
    var phoneCarrierName = '-';
    if (pa && pa.phoneCarrierId) {
      var carrier = APP.state.findById(APP.state.get().pools.trainees, pa.phoneCarrierId);
      phoneCarrierName = carrier ? carrier.name : '-';
    }
    return '<div class="post-req-card">' +
      '<h3>' + U.escapeHtml(leaderName || '(ריק)') + '</h3>' +
      '<dl class="post-req-dl">' +
      '<div><dt>חקלאי</dt><dd>' + U.escapeHtml(farmer ? farmer.name : '-') + '</dd></div>' +
      '<div><dt>טלפון</dt><dd>' + U.escapeHtml((farmer && farmer.phone) || '-') + '</dd></div>' +
      '<div><dt>מיקום</dt><dd>' + U.escapeHtml((farmer && farmer.location) || '-') + '</dd></div>' +
      '<div><dt>מספר עובדים</dt><dd>' + (post.workerCount != null ? post.workerCount : 'גמיש') + '</dd></div>' +
      '<div><dt>חוזק</dt><dd>' + r.strength + '</dd></div>' +
      '<div><dt>זריזות</dt><dd>' + r.dexterity + '</dd></div>' +
      '<div><dt>אחראיות</dt><dd>≥' + r.responsibilityMinCount.level + ' x' + r.responsibilityMinCount.count + '</dd></div>' +
      '<div><dt>הנהגה</dt><dd>≥' + r.leadershipMinCount.level + ' x' + r.leadershipMinCount.count + '</dd></div>' +
      '<div><dt>דרך הגעה</dt><dd>' + (post.transportMethod === 'transporter' ? 'טרנספורטר' : 'הסעה') + '</dd></div>' +
      '<div><dt>אחראי טלפון</dt><dd>' + U.escapeHtml(phoneCarrierName) + '</dd></div>' +
      '</dl>' +
      postActualSummaryHtml(task, post) +
      '</div>';
  }

  function postActualSummaryHtml(task, post) {
    var pa = task.assignment && task.assignment.postAssignments[post.id];
    var trainees = pa ? pa.workerIds
      .filter(function (w) { return w.t === 'ref' && w.rt === 'trainee'; })
      .map(function (w) { return APP.state.findById(APP.state.get().pools.trainees, w.id); })
      .filter(Boolean) : [];
    if (!trainees.length) {
      return '<h4>בפועל</h4><p class="muted">טרם שובץ</p>';
    }
    var r = post.requirements;
    var sumStrength = 0, sumDexterity = 0, respCount = 0, leadCount = 0;
    trainees.forEach(function (t) {
      sumStrength += t.ratings.strength;
      sumDexterity += t.ratings.dexterity;
      if (t.ratings.responsibility >= r.responsibilityMinCount.level) respCount++;
      if (t.ratings.leadership >= r.leadershipMinCount.level) leadCount++;
    });
    var avgStrength = (sumStrength / trainees.length).toFixed(1);
    var avgDexterity = (sumDexterity / trainees.length).toFixed(1);
    return '<h4>בפועל</h4><dl class="post-req-dl">' +
      '<div><dt>חוזק ממוצע</dt><dd>' + avgStrength + '</dd></div>' +
      '<div><dt>זריזות ממוצעת</dt><dd>' + avgDexterity + '</dd></div>' +
      '<div><dt>אחראיות</dt><dd>' + respCount + ' מתוך ' + trainees.length + '</dd></div>' +
      '<div><dt>הנהגה</dt><dd>' + leadCount + ' מתוך ' + trainees.length + '</dd></div>' +
      '</dl>';
  }

  function renderPostRequirementsTab() {
    var el = document.getElementById('tab-post-requirements');
    if (!el) return;
    var task = APP.state.getCurrentTask();
    if (!task) { el.innerHTML = '<div class="card"><p class="muted">אין משימה פתוחה.</p></div>'; return; }
    if (!task.posts.length) { el.innerHTML = '<div class="card"><p class="muted">אין עדיין עמדות עבודה למשימה זו.</p></div>'; return; }
    el.innerHTML = '<div class="card">' +
      '<div class="task-top-bar no-print"><h2>דרישות מוקדי עבודה - ' + task.date + '</h2>' +
      '<div class="row">' +
      '<button class="btn-secondary" data-action="preview-open">תצוגה מקדימה</button>' +
      '<button class="btn-secondary" data-action="print">הדפס</button>' +
      '</div></div>' +
      '<div class="post-req-list">' +
      task.posts.map(function (post) { return postRequirementCardHtml(task, post); }).join('') +
      '</div></div>';
  }

  return {
    renderTaskTab: renderTaskTab,
    postStepperHtml: postStepperHtml,
    taskDetailsModalHtml: taskDetailsModalHtml,
    carriedPostsModalHtml: carriedPostsModalHtml,
    renderPostRequirementsTab: renderPostRequirementsTab
  };
})();
