window.APP = window.APP || {};

APP.pools = (function () {
  var U = APP.util;

  var TRAIT_ORDER = ['strength', 'dexterity', 'fineMotor', 'responsibility', 'leadership'];
  var TRAIT_LABELS = {
    strength: 'חוזק פיזי', dexterity: 'זריזות ידיים', fineMotor: 'מוטוריקה עדינה',
    responsibility: 'אחראיות', leadership: 'הנהגה'
  };

  function render() {
    renderTrainees();
    renderLeaders();
    renderFarmers();
  }

  // A rating cell is a button, not free text/a dropdown - clicking it always
  // opens the trait stepper (add-trainee's step-by-step popup, see
  // traineeStepperHtml) positioned at that trait, whether or not the
  // ratings password is set. When it is set and not yet unlocked this
  // session, the value is masked and main.js's edit-trainee-rating handler
  // asks for the password before opening the stepper.
  function ratingCellHtml(trainee, trait) {
    var locked = APP.auth.hasTraineesPassword() && !APP.auth.isTraineesUnlockedThisSession();
    return '<button type="button" class="rating-cell-btn" data-action="edit-trainee-rating" ' +
      'data-trainee-id="' + trainee.id + '" data-trait="' + trait + '" aria-label="' + U.escapeHtml(TRAIT_LABELS[trait]) + '">' +
      (locked ? '🔒' : trainee.ratings[trait]) + '</button>';
  }

  function renderTrainees() {
    var el = document.getElementById('tab-trainees');
    if (!el) return;
    // Grouped by cohort (contiguous blocks, senior cohort first) purely for
    // readability - display order only, never touches the underlying array
    // or any id the auto-assign algorithm relies on.
    var list = APP.state.get().pools.trainees.slice().sort(function (a, b) {
      return U.cohortRank(b.cohort) - U.cohortRank(a.cohort);
    });
    el.innerHTML = '<div class="card">' +
      '<h2>חניכים</h2>' +
      '<p class="muted">5 דירוגים קבועים בין 1-7 לכל חניך. משתתפים בשיבוץ האוטומטי (אלא אם נעדרים באותו יום).</p>' +
      '<div class="table-scroll"><table class="pool-table">' +
      '<thead><tr><th>שם</th><th>מחזור</th><th>מגדר</th><th>חוזק</th><th>זריזות</th><th>מוטוריקה עדינה</th><th>אחראיות</th><th>הנהגה</th><th>פעיל</th><th></th></tr></thead>' +
      '<tbody>' +
      list.map(function (t) {
        return '<tr data-id="' + t.id + '"' + (t.active === false ? ' class="inactive-row"' : '') + '>' +
          '<td><input class="pool-input" data-field="name" aria-label="שם" value="' + U.escapeHtml(t.name) + '"></td>' +
          '<td><select data-field="cohort" aria-label="מחזור">' + U.cohortOptions(t.cohort) + '</select></td>' +
          '<td><select data-field="gender" aria-label="מגדר">' + U.genderOptions(t.gender) + '</select></td>' +
          '<td>' + ratingCellHtml(t, 'strength') + '</td>' +
          '<td>' + ratingCellHtml(t, 'dexterity') + '</td>' +
          '<td>' + ratingCellHtml(t, 'fineMotor') + '</td>' +
          '<td>' + ratingCellHtml(t, 'responsibility') + '</td>' +
          '<td>' + ratingCellHtml(t, 'leadership') + '</td>' +
          '<td><input type="checkbox" data-field="active" aria-label="פעיל" ' + (t.active !== false ? 'checked' : '') + '></td>' +
          '<td><button class="btn-tiny btn-danger" data-action="delete-trainee">מחק</button></td>' +
          '</tr>';
      }).join('') +
      (list.length ? '' : '<tr><td colspan="10" class="empty-row">אין חניכים עדיין</td></tr>') +
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

  // ---- trainee trait entry wizard: one question per step ----
  // Ratings are picked from a row of 1-7 buttons rather than typed/selected
  // from a dropdown - tapping a number both sets it and (except when only
  // touching up a single trait) immediately advances to the next step, so
  // entering all 5 traits takes 5 taps total instead of opening a dropdown,
  // scrolling a list and picking an option 5 times over. It works the same
  // way with a mouse or a finger, unlike a native <select> which is fiddlier
  // to hit accurately on a touch screen.
  var traineeStepper = null;

  function startTraineeStepper(existingTrainee) {
    if (existingTrainee) {
      traineeStepper = {
        mode: 'edit',
        traineeId: existingTrainee.id,
        singleTrait: false,
        step: 0,
        name: existingTrainee.name,
        cohort: existingTrainee.cohort,
        gender: existingTrainee.gender,
        ratings: JSON.parse(JSON.stringify(existingTrainee.ratings))
      };
    } else {
      traineeStepper = {
        mode: 'add',
        traineeId: null,
        singleTrait: false,
        step: 0,
        name: '',
        cohort: 'e',
        gender: 'm',
        ratings: { strength: 4, dexterity: 4, fineMotor: 4, responsibility: 4, leadership: 4 }
      };
    }
    return traineeStepper;
  }

  // Opens the wizard already on one specific trait's step, for editing a
  // single rating cell - tapping a number there commits right away instead
  // of walking through the rest of the traits (see traineeStepSetRating).
  function startTraineeStepperAtTrait(existingTrainee, trait) {
    startTraineeStepper(existingTrainee);
    traineeStepper.singleTrait = true;
    traineeStepper.step = 1 + TRAIT_ORDER.indexOf(trait);
    return traineeStepper;
  }

  function getTraineeStepper() { return traineeStepper; }
  function cancelTraineeStepper() { traineeStepper = null; }
  function traineeStepperGoTo(n) { if (traineeStepper) traineeStepper.step = n; }

  function readTraineeStepIdentityFromDom() {
    if (!traineeStepper) return;
    var nameInp = document.getElementById('trainee-step-name');
    var cohortSel = document.getElementById('trainee-step-cohort');
    var genderSel = document.getElementById('trainee-step-gender');
    traineeStepper.name = nameInp ? nameInp.value : '';
    traineeStepper.cohort = cohortSel ? cohortSel.value : 'e';
    traineeStepper.gender = genderSel ? genderSel.value : 'm';
  }

  function traineeStepSetRating(trait, value) {
    if (!traineeStepper) return;
    traineeStepper.ratings[trait] = value;
  }

  function traineeStepperHtml() {
    var s = traineeStepper;
    if (!s) return '';
    var totalSteps = TRAIT_ORDER.length + 1;
    var body;
    if (s.step === 0) {
      body = '<h4>שלב 1 מתוך ' + totalSteps + ': פרטי החניך</h4>' +
        '<label>שם<input type="text" id="trainee-step-name" value="' + U.escapeHtml(s.name) + '"></label>' +
        '<label>מחזור<select id="trainee-step-cohort">' + U.cohortOptions(s.cohort) + '</select></label>' +
        '<label>מגדר<select id="trainee-step-gender">' + U.genderOptions(s.gender) + '</select></label>' +
        '<div class="row" style="margin-top:12px;">' +
        '<button class="btn-secondary" data-action="trainee-step-cancel">בטל</button>' +
        '<button class="btn-primary" data-action="trainee-step-next-identity">הבא</button>' +
        '</div>';
    } else {
      var trait = TRAIT_ORDER[s.step - 1];
      var val = s.ratings[trait];
      body = '<h4>שלב ' + (s.step + 1) + ' מתוך ' + totalSteps + ': ' + U.escapeHtml(TRAIT_LABELS[trait]) + '</h4>' +
        '<p class="muted">בחר/י דירוג בין 1 (נמוך) ל-7 (גבוה):</p>' +
        '<div class="rating-button-row">' +
        [1, 2, 3, 4, 5, 6, 7].map(function (n) {
          return '<button type="button" class="rating-btn' + (val === n ? ' active' : '') + '" ' +
            'data-action="trainee-step-set-rating" data-trait="' + trait + '" data-value="' + n + '">' + n + '</button>';
        }).join('') +
        '</div>' +
        '<div class="row" style="margin-top:12px;">' +
        '<button class="btn-secondary" data-action="trainee-step-cancel">בטל</button>' +
        '<button class="btn-secondary" data-action="trainee-step-back">חזור</button>' +
        '</div>';
    }
    return '<div class="stepper-card">' + body + '</div>';
  }

  function commitTraineeStepper() {
    var s = traineeStepper;
    if (!s) return false;
    if (!s.name || !s.name.trim()) { alert('יש להזין שם'); return false; }
    if (s.mode === 'add') {
      APP.state.addTrainee(s.name.trim(), s.ratings, s.cohort, s.gender);
    } else {
      var t = APP.state.findById(APP.state.get().pools.trainees, s.traineeId);
      if (t) {
        t.name = s.name.trim();
        t.cohort = s.cohort;
        t.gender = s.gender;
        t.ratings = s.ratings;
        APP.state.save();
      }
    }
    traineeStepper = null;
    return true;
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
      '<thead><tr><th>שם העבודה</th><th>חוזק</th><th>זריזות</th><th>מוטוריקה עדינה</th><th>אחראיות (רמה/כמות)</th><th>הנהגה (רמה/כמות)</th><th>מגדר מינ׳ (בנים/בנות)</th><th>מס׳ עובדים</th><th>פעיל</th><th></th></tr></thead>' +
      '<tbody>' +
      list.map(function (tpl) {
        var r = tpl.defaultRequirements;
        return '<tr data-id="' + tpl.id + '"' + (tpl.active === false ? ' class="inactive-row"' : '') + '>' +
          '<td><input class="pool-input" data-field="name" aria-label="שם העבודה" value="' + U.escapeHtml(tpl.name) + '"></td>' +
          '<td><select data-field="strength" aria-label="חוזק">' + U.ratingOptions(r.strength) + '</select></td>' +
          '<td><select data-field="dexterity" aria-label="זריזות">' + U.ratingOptions(r.dexterity) + '</select></td>' +
          '<td><select data-field="fineMotor" aria-label="מוטוריקה עדינה">' + U.ratingOptions(r.fineMotor) + '</select></td>' +
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
      (list.length ? '' : '<tr><td colspan="10" class="empty-row">אין עבודות קבועות עדיין</td></tr>') +
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
      '<label><span style="display: block; font-size: var(--fs-1); color: var(--muted); margin-bottom: 4px;">מוטוריקה עדינה נדרשת</span>' +
      '<select id="modal-jobtemplate-finemotor" style="width: 100%;">' + U.ratingOptions(4) + '</select>' +
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
    addJobTemplateModalHtml: addJobTemplateModalHtml,
    farmerPrefsModalHtml: farmerPrefsModalHtml,
    startTraineeStepper: startTraineeStepper,
    startTraineeStepperAtTrait: startTraineeStepperAtTrait,
    getTraineeStepper: getTraineeStepper,
    cancelTraineeStepper: cancelTraineeStepper,
    traineeStepperGoTo: traineeStepperGoTo,
    readTraineeStepIdentityFromDom: readTraineeStepIdentityFromDom,
    traineeStepSetRating: traineeStepSetRating,
    traineeStepperHtml: traineeStepperHtml,
    commitTraineeStepper: commitTraineeStepper
  };
})();
