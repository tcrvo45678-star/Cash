(function () {
  var taskActions;
  var debouncedSave = APP.util.debounce(function () { APP.state.save(); }, 400);

  // Close first so the response feels instant, then re-render, reassign,
  // and re-render again - a slow or failing reassign never leaves the
  // modal stuck open.
  function closeModalAndReassign() {
    APP.modal.close();
    APP.render.renderTaskTab();
    autoAssignIfPosts();
    APP.render.renderTaskTab();
  }

  function handleCellInput(e) {
    if (e.target && e.target.dataset && e.target.dataset.cellInput) {
      var task = APP.state.getCurrentTask();
      if (!task) return;
      var cell = APP.state.resolveCell(task, e.target.dataset.cellInput);
      if (cell) { cell.set(APP.state.textVal(e.target.value)); debouncedSave(); }
    }
  }

  function openPostModal() {
    APP.modal.open(APP.render.postStepperHtml(), { onDismiss: cancelPostModal });
  }

  function cancelPostModal() {
    APP.task.cancelStepper();
    APP.modal.close();
  }

  function enterPreview() {
    document.getElementById('print-stylesheet').media = 'all';
    document.getElementById('preview-toolbar').hidden = false;
  }

  function exitPreview() {
    document.getElementById('print-stylesheet').media = 'print';
    document.getElementById('preview-toolbar').hidden = true;
    resetPrintFit();
  }

  // Shrinks print text/padding (via the --print-scale custom property
  // print.css scales its font-size/padding rules by) until the printed
  // page's content fits one A4-landscape page height - a fixed font size
  // can't guarantee that across a variable number of posts/rows, so this
  // measures the actual rendered height and backs off until it fits.
  var PRINT_SCALE_MIN = 0.5;
  function fitPrintToPage() {
    resetPrintFit();
    var content = document.querySelector('.tab-content.active .card');
    if (!content) return;
    var mmToPx = 96 / 25.4;
    var pageHeightPx = (210 - 24) * mmToPx;
    var scale = 1;
    while (content.scrollHeight > pageHeightPx && scale > PRINT_SCALE_MIN) {
      scale = Math.round((scale - 0.05) * 100) / 100;
      document.documentElement.style.setProperty('--print-scale', scale);
    }
  }

  function resetPrintFit() {
    document.documentElement.style.removeProperty('--print-scale');
  }

  function preparePrint() {
    document.getElementById('print-stylesheet').media = 'all';
    fitPrintToPage();
  }

  function resetPasswordToggles() {
    APP.util.qsa('.password-toggle').forEach(function (btn) {
      var input = document.getElementById(btn.dataset.toggleFor);
      if (input) input.type = 'password';
      btn.textContent = 'הצג';
      btn.setAttribute('aria-pressed', 'false');
    });
  }

  function wirePasswordToggles() {
    APP.util.qsa('.password-toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var input = document.getElementById(btn.dataset.toggleFor);
        if (!input) return;
        var isHidden = input.type === 'password';
        input.type = isHidden ? 'text' : 'password';
        btn.textContent = isHidden ? 'הסתר' : 'הצג';
        btn.setAttribute('aria-pressed', String(isHidden));
      });
    });
  }

  // Ratings (not the whole "חניכים" tab - names/cohort/gender always show)
  // can be gated behind their own password, set in Settings, separate from
  // the app's main login. Opt-in: if no ratings password is configured,
  // this just runs the callback straight away. Unlocking is per-session,
  // same lightweight model as the main password.
  function ensureRatingsUnlocked(cb) {
    if (!APP.auth.hasTraineesPassword() || APP.auth.isTraineesUnlockedThisSession()) { cb(); return; }
    var pw = prompt('הזן את סיסמת הדירוגים כדי להמשיך:');
    if (pw === null) return;
    if (APP.auth.checkTraineesPassword(pw)) {
      APP.auth.markTraineesUnlocked();
      cb();
    } else {
      alert('סיסמה שגויה');
    }
  }

  function rerenderPool(key) {
    if (key === 'trainees') APP.pools.renderTrainees();
    if (key === 'leaders') APP.pools.renderLeaders();
    if (key === 'farmers') APP.pools.renderFarmers();
  }

  function buildTaskActions() {
    return {
      'create-task': function () {
        var dateInput = document.getElementById('new-task-date');
        var date = dateInput ? dateInput.value : APP.state.todayISO();
        if (!date) return;
        var result = APP.task.createTaskForDate(date);
        if (result.wasNew && result.task.posts.length > 0) {
          APP.render.renderTaskTab();
          APP.modal.open(APP.render.carriedPostsModalHtml(result.task), { onDismiss: function () { APP.modal.close(); } });
          return;
        }
        if (result.task.posts.length > 0 && !result.task.assignment) {
          autoAssignIfPosts();
        }
        APP.render.renderTaskTab();
        var task = APP.state.getCurrentTask();
        if (task && task.posts.length === 0) {
          APP.task.startStepper();
          openPostModal();
        }
      },
      'auto-assign': function () {
        var task = APP.state.getCurrentTask();
        if (!task) return;
        if (task.assignment && Object.keys(task.assignment.postAssignments).length) {
          if (!confirm('שיבוץ אוטומטי מחדש יחליף את השיבוץ הנוכחי (כולל עריכות ידניות). להמשיך?')) return;
        }
        task.assignment = APP.assign.runAutoAssign(task, APP.state.get().pools);
        task.updatedAt = Date.now();
        APP.state.save();
        APP.render.renderTaskTab();
      },
      'print': function () { preparePrint(); window.print(); },
      'task-details-start': function () {
        APP.modal.open(APP.render.taskDetailsModalHtml(APP.state.getCurrentTask()), { onDismiss: function () { APP.modal.close(); } });
      },
      'preview-open': function () { enterPreview(); preparePrint(); },
      'add-post-start': function () { APP.task.startStepper(); openPostModal(); },
      'edit-post': function (el) {
        var task = APP.state.getCurrentTask();
        var post = APP.state.findById(task.posts, el.dataset.postId);
        if (!post) return;
        APP.task.startStepper(post);
        openPostModal();
      },
      'delete-post': function (el) {
        APP.task.deletePost(el.dataset.postId);
        rerunAutoAssignIfNeeded();
        APP.render.renderTaskTab();
      },
      'toggle-absent': function (el) {
        APP.task.toggleAbsent(el.dataset.traineeId);
        rerunAutoAssignIfNeeded();
        APP.render.renderTaskTab();
      },
      'add-guest': function () {
        var inp = document.getElementById('new-guest-name');
        var genderSel = document.getElementById('new-guest-gender');
        if (!inp || !inp.value.trim()) return;
        var guest = APP.task.addGuest(inp.value.trim(), genderSel ? genderSel.value : 'm');
        APP.render.renderTaskTab();
        var task = APP.state.getCurrentTask();
        if (guest && task && task.posts.length) {
          APP.modal.open(APP.render.assignGuestModalHtml(task, guest), { onDismiss: function () { APP.modal.close(); } });
        }
      },
      'remove-guest': function (el) {
        APP.task.removeGuest(el.dataset.guestId);
        rerunAutoAssignIfNeeded();
        APP.render.renderTaskTab();
      }
    };
  }

  // Runs auto-assign unconditionally as long as the task has posts, even if
  // no assignment exists yet - used when a task first becomes visible with
  // posts already on it (carried over from the previous day), so people are
  // filled in immediately instead of waiting for a manual "שבץ אוטומטית".
  function autoAssignIfNeeded(shouldRun) {
    var task = APP.state.getCurrentTask();
    if (task && shouldRun(task)) {
      try {
        task.assignment = APP.assign.runAutoAssign(task, APP.state.get().pools);
        task.updatedAt = Date.now();
        APP.state.save();
      } catch (err) {
        alert('אירעה שגיאה בשיבוץ האוטומטי, נסה שוב.');
      }
    }
  }
  function autoAssignIfPosts() { autoAssignIfNeeded(function (t) { return t.posts.length; }); }
  function rerunAutoAssignIfNeeded() { autoAssignIfNeeded(function (t) { return t.assignment; }); }

  function wireFarmerPrefs() {
    var el = document.getElementById('tab-farmers');
    el.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action="edit-farmer-prefs"]');
      if (!btn) return;
      var farmer = APP.state.findById(APP.state.get().pools.farmers, btn.dataset.farmerId);
      if (!farmer) return;
      APP.modal.open(APP.pools.farmerPrefsModalHtml(farmer), { onDismiss: function () { APP.modal.close(); } });
    });
  }

  function wireModal() {
    var overlay = document.getElementById('modal-overlay');
    overlay.addEventListener('click', function (e) {
      // Stepper/post actions
      if (e.target.closest('[data-action="stepper-next-1"]')) {
        APP.task.readStep1FromDom();
        var s = APP.task.getStepper();
        if (!s.farmerId && !s.newFarmerName.trim()) { alert('בחר חקלאי קיים או הזן שם לחקלאי חדש'); return; }
        APP.task.stepperGoTo(2);
        APP.modal.setContent(APP.render.postStepperHtml());
        return;
      }
      if (e.target.closest('[data-action="stepper-next-2"]')) {
        APP.task.readStep2FromDom();
        var s = APP.task.getStepper();
        if (!s.leaderId) { alert('בחר איש צוות מוביל'); return; }
        APP.task.stepperGoTo(3);
        APP.modal.setContent(APP.render.postStepperHtml());
        return;
      }
      if (e.target.closest('[data-action="stepper-back"]')) {
        var s = APP.task.getStepper();
        if (s.step === 2) APP.task.readStep2FromDom();
        if (s.step === 3) APP.task.readStep3FromDom();
        APP.task.stepperGoTo(Math.max(1, s.step - 1));
        APP.modal.setContent(APP.render.postStepperHtml());
        return;
      }
      if (e.target.closest('[data-action="stepper-cancel"]')) {
        cancelPostModal();
        return;
      }
      if (e.target.closest('[data-action="stepper-commit"]')) {
        APP.task.readStep3FromDom();
        if (APP.task.commitStepper() !== false) {
          closeModalAndReassign();
        }
        return;
      }
      if (e.target.closest('[data-action="assign-guest-confirm"]')) {
        var confirmBtn = e.target.closest('[data-action="assign-guest-confirm"]');
        var guestId = confirmBtn.dataset.guestId;
        var postSel = document.getElementById('assign-guest-post-select');
        var chosenPostId = postSel ? postSel.value : '';
        var guestTask = APP.state.getCurrentTask();
        APP.modal.close();
        APP.render.renderTaskTab();
        if (guestTask && chosenPostId) {
          try {
            APP.state.assignGuestToPost(guestTask, guestId, chosenPostId);
            APP.assign.recomputeResponsibleRoles(guestTask, APP.state.get().pools, guestTask.assignment.postAssignments);
            APP.state.save();
          } catch (err) {
            alert('אירעה שגיאה בשיבוץ האורח, נסה שוב.');
          }
        } else {
          rerunAutoAssignIfNeeded();
        }
        APP.render.renderTaskTab();
        return;
      }
      if (e.target.closest('[data-action="carried-posts-done"]')) {
        var carriedTask = APP.state.getCurrentTask();
        if (carriedTask) {
          APP.util.qsa('#modal-box input[type="checkbox"][data-post-id]').forEach(function (cb) {
            if (!cb.checked) APP.task.deletePost(cb.dataset.postId, true);
          });
        }
        closeModalAndReassign();
        var afterCarried = APP.state.getCurrentTask();
        if (afterCarried && afterCarried.posts.length === 0) {
          APP.task.startStepper();
          openPostModal();
        }
        return;
      }
      // Trainee trait-entry wizard actions
      if (e.target.closest('[data-action="trainee-step-next-identity"]')) {
        APP.pools.readTraineeStepIdentityFromDom();
        var ts = APP.pools.getTraineeStepper();
        if (!ts.name || !ts.name.trim()) { alert('הזן שם'); return; }
        APP.pools.traineeStepperGoTo(1);
        APP.modal.setContent(APP.pools.traineeStepperHtml());
        return;
      }
      if (e.target.closest('[data-action="trainee-step-back"]')) {
        var tsBack = APP.pools.getTraineeStepper();
        APP.pools.traineeStepperGoTo(Math.max(0, tsBack.step - 1));
        APP.modal.setContent(APP.pools.traineeStepperHtml());
        return;
      }
      if (e.target.closest('[data-action="trainee-step-cancel"]')) {
        APP.pools.cancelTraineeStepper();
        APP.modal.close();
        APP.pools.renderTrainees();
        return;
      }
      if (e.target.closest('[data-action="trainee-step-set-rating"]')) {
        var ratingBtn = e.target.closest('[data-action="trainee-step-set-rating"]');
        var tsRate = APP.pools.getTraineeStepper();
        APP.pools.traineeStepSetRating(ratingBtn.dataset.trait, parseInt(ratingBtn.dataset.value, 10));
        var TRAIT_ORDER_LEN = 5; // strength, dexterity, fineMotor, responsibility, leadership
        var isLastTrait = tsRate.step === TRAIT_ORDER_LEN;
        if (tsRate.singleTrait || isLastTrait) {
          if (APP.pools.commitTraineeStepper() !== false) {
            APP.modal.close();
            APP.pools.renderTrainees();
            APP.render.renderTaskTab();
          }
        } else {
          APP.pools.traineeStepperGoTo(tsRate.step + 1);
          APP.modal.setContent(APP.pools.traineeStepperHtml());
        }
        return;
      }
      // Job-template modal actions
      if (e.target.closest('[data-action="add-jobtemplate-commit"]')) {
        var tplName = document.getElementById('modal-jobtemplate-name').value.trim();
        if (!tplName) { alert('הזן שם לעבודה'); return; }
        var tplWorkerCountStr = document.getElementById('modal-jobtemplate-workercount').value;
        APP.state.addPostTemplate({
          name: tplName,
          defaultWorkerCount: tplWorkerCountStr ? parseInt(tplWorkerCountStr, 10) : null,
          defaultRequirements: {
            strength: parseInt(document.getElementById('modal-jobtemplate-strength').value, 10),
            dexterity: parseInt(document.getElementById('modal-jobtemplate-dexterity').value, 10),
            fineMotor: parseInt(document.getElementById('modal-jobtemplate-finemotor').value, 10),
            responsibilityMinCount: { level: 5, count: 0 },
            leadershipMinCount: { level: 5, count: 0 },
            genderMinCount: { male: 0, female: 0 }
          },
          specialistTraineeIds: []
        });
        APP.modal.close();
        APP.pools.renderJobTemplates();
        return;
      }
      if (e.target.closest('[data-action="add-jobtemplate-cancel"]')) {
        APP.modal.close();
        return;
      }
      if (e.target.closest('[data-action="jobtemplate-squad-cancel"]')) {
        APP.modal.close();
        return;
      }
      if (e.target.closest('[data-action="jobtemplate-squad-save"]')) {
        var squadSaveBtn = e.target.closest('[data-action="jobtemplate-squad-save"]');
        var squadTpl = APP.state.findById(APP.state.get().pools.postTemplates, squadSaveBtn.dataset.templateId);
        if (squadTpl) {
          squadTpl.specialistTraineeIds = APP.util.qsa('#modal-box input[type="checkbox"][data-trainee-id]')
            .filter(function (cb) { return cb.checked; })
            .map(function (cb) { return cb.dataset.traineeId; });
          APP.state.save();
        }
        APP.modal.close();
        APP.pools.renderJobTemplates();
        return;
      }
      if (e.target.closest('[data-action="task-details-close"]')) {
        APP.modal.close();
        return;
      }
      if (e.target.closest('[data-action="farmer-prefs-cancel"]')) {
        APP.modal.close();
        return;
      }
      if (e.target.closest('[data-action="farmer-prefs-save"]')) {
        var saveBtn = e.target.closest('[data-action="farmer-prefs-save"]');
        var farmer = APP.state.findById(APP.state.get().pools.farmers, saveBtn.dataset.farmerId);
        if (farmer) {
          farmer.preferredTraineeIds = APP.util.qsa('#modal-box input[type="checkbox"][data-trainee-id]')
            .filter(function (cb) { return cb.checked; })
            .map(function (cb) { return cb.dataset.traineeId; });
          APP.state.save();
        }
        APP.modal.close();
        APP.pools.renderFarmers();
        return;
      }
    });
    overlay.addEventListener('input', handleCellInput);
    overlay.addEventListener('change', function (e) {
      if (e.target && e.target.id === 'stepper-template-select') {
        // Sync whatever's already typed in step 1 (farmer name/location/
        // jobType) into the stepper state first - re-rendering the step to
        // show/hide the squad-percent field would otherwise wipe those
        // fields back to their last-saved (empty) value.
        APP.task.readStep1FromDom();
        APP.task.applyTemplate(e.target.value);
        APP.modal.setContent(APP.render.postStepperHtml());
      }
    });
  }

  function wireTaskTab() {
    taskActions = buildTaskActions();
    var el = document.getElementById('tab-task');
    el.addEventListener('click', function (e) {
      var actionEl = e.target.closest('[data-action]');
      if (!actionEl) return;
      var fn = taskActions[actionEl.dataset.action];
      if (fn) fn(actionEl, e);
    });
    el.addEventListener('input', handleCellInput);
  }

  function wirePostRequirementsTab() {
    var el = document.getElementById('tab-post-requirements');
    el.addEventListener('click', function (e) {
      var actionEl = e.target.closest('[data-action]');
      if (!actionEl) return;
      var fn = taskActions[actionEl.dataset.action];
      if (fn) fn(actionEl, e);
    });
  }

  function wirePreviewToolbar() {
    var toolbar = document.getElementById('preview-toolbar');
    toolbar.addEventListener('click', function (e) {
      if (e.target.closest('[data-action="preview-print"]')) { window.print(); return; }
      if (e.target.closest('[data-action="preview-close"]')) { exitPreview(); return; }
    });
    window.addEventListener('afterprint', exitPreview);
  }

  function wireHistory() {
    var el = document.getElementById('tab-history');
    el.addEventListener('click', function (e) {
      var openBtn = e.target.closest('[data-action="open-task"]');
      if (openBtn) {
        APP.task.openTask(openBtn.dataset.taskId);
        document.querySelector('.tab-btn[data-tab="task"]').click();
        return;
      }
      var delBtn = e.target.closest('[data-action="delete-task"]');
      if (delBtn) {
        if (!confirm('למחוק את המשימה לצמיתות?')) return;
        APP.state.deleteTask(delBtn.dataset.taskId);
        APP.history.render();
      }
    });
  }

  function wireTrainees() {
    var el = document.getElementById('tab-trainees');
    el.addEventListener('change', function (e) {
      var tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      var t = APP.state.findById(APP.state.get().pools.trainees, tr.dataset.id);
      if (!t) return;
      var f = e.target.dataset.field;
      if (f === 'name') t.name = e.target.value;
      else if (f === 'active') { t.active = e.target.checked; tr.classList.toggle('inactive-row', !e.target.checked); }
      else if (f === 'cohort') t.cohort = e.target.value;
      else if (f === 'gender') t.gender = e.target.value;
      APP.state.save();
      APP.render.renderTaskTab();
    });
    el.addEventListener('click', function (e) {
      if (e.target.closest('[data-action="add-trainee-start"]')) {
        ensureRatingsUnlocked(function () {
          APP.pools.startTraineeStepper();
          APP.modal.open(APP.pools.traineeStepperHtml(), { onDismiss: function () { APP.pools.cancelTraineeStepper(); APP.modal.close(); APP.pools.renderTrainees(); } });
          APP.pools.renderTrainees();
        });
        return;
      }
      var ratingBtn = e.target.closest('[data-action="edit-trainee-rating"]');
      if (ratingBtn) {
        var traineeId = ratingBtn.dataset.traineeId;
        var trait = ratingBtn.dataset.trait;
        ensureRatingsUnlocked(function () {
          var trainee = APP.state.findById(APP.state.get().pools.trainees, traineeId);
          if (!trainee) return;
          APP.pools.startTraineeStepperAtTrait(trainee, trait);
          APP.modal.open(APP.pools.traineeStepperHtml(), { onDismiss: function () { APP.pools.cancelTraineeStepper(); APP.modal.close(); APP.pools.renderTrainees(); } });
          APP.pools.renderTrainees();
        });
        return;
      }
      var delBtn = e.target.closest('[data-action="delete-trainee"]');
      if (delBtn) {
        var tr = delBtn.closest('tr[data-id]');
        if (!confirm('למחוק את החניך לצמיתות?')) return;
        var d = APP.state.get();
        d.pools.trainees = d.pools.trainees.filter(function (x) { return x.id !== tr.dataset.id; });
        APP.state.save();
        APP.pools.renderTrainees();
      }
    });
  }

  function wireJobTemplates() {
    var el = document.getElementById('tab-jobtemplates');
    el.addEventListener('change', function (e) {
      var tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      var tpl = APP.state.findById(APP.state.get().pools.postTemplates, tr.dataset.id);
      if (!tpl) return;
      var r = tpl.defaultRequirements;
      var f = e.target.dataset.field;
      if (f === 'name') tpl.name = e.target.value;
      else if (f === 'active') { tpl.active = e.target.checked; tr.classList.toggle('inactive-row', !e.target.checked); }
      else if (f === 'strength' || f === 'dexterity' || f === 'fineMotor') r[f] = parseInt(e.target.value, 10);
      else if (f === 'resp-level') r.responsibilityMinCount.level = parseInt(e.target.value, 10);
      else if (f === 'resp-count') r.responsibilityMinCount.count = parseInt(e.target.value, 10) || 0;
      else if (f === 'lead-level') r.leadershipMinCount.level = parseInt(e.target.value, 10);
      else if (f === 'lead-count') r.leadershipMinCount.count = parseInt(e.target.value, 10) || 0;
      else if (f === 'gender-male') r.genderMinCount.male = parseInt(e.target.value, 10) || 0;
      else if (f === 'gender-female') r.genderMinCount.female = parseInt(e.target.value, 10) || 0;
      else if (f === 'workerCount') tpl.defaultWorkerCount = e.target.value ? parseInt(e.target.value, 10) : null;
      APP.state.save();
    });
    el.addEventListener('click', function (e) {
      if (e.target.closest('[data-action="add-jobtemplate-start"]')) {
        APP.modal.open(APP.pools.addJobTemplateModalHtml(), { onDismiss: function () { APP.modal.close(); } });
        return;
      }
      var squadBtn = e.target.closest('[data-action="edit-jobtemplate-squad"]');
      if (squadBtn) {
        var tpl = APP.state.findById(APP.state.get().pools.postTemplates, squadBtn.dataset.templateId);
        if (!tpl) return;
        APP.modal.open(APP.pools.jobTemplateSquadModalHtml(tpl), { onDismiss: function () { APP.modal.close(); } });
        return;
      }
      var delBtn = e.target.closest('[data-action="delete-jobtemplate"]');
      if (delBtn) {
        var tr = delBtn.closest('tr[data-id]');
        if (!confirm('למחוק את העבודה הקבועה לצמיתות?')) return;
        var d = APP.state.get();
        d.pools.postTemplates = d.pools.postTemplates.filter(function (x) { return x.id !== tr.dataset.id; });
        APP.state.save();
        APP.pools.renderJobTemplates();
      }
    });
  }

  function wireSimplePool(containerId, poolKey, addFn) {
    var el = document.getElementById(containerId);
    el.addEventListener('change', function (e) {
      var tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      var item = APP.state.findById(APP.state.get().pools[poolKey], tr.dataset.id);
      if (!item) return;
      var f = e.target.dataset.field;
      if (f === 'active') { item.active = e.target.checked; tr.classList.toggle('inactive-row', !e.target.checked); }
      else if (f) item[f] = e.target.value;
      APP.state.save();
      APP.render.renderTaskTab();
    });
    el.addEventListener('click', function (e) {
      if (e.target.closest('[data-action="add-' + poolKey + '"]')) {
        var inp = document.getElementById('new-' + poolKey + '-name');
        var name = inp.value.trim();
        if (!name) return;
        addFn(name);
        inp.value = '';
        rerenderPool(poolKey);
        return;
      }
      var delBtn = e.target.closest('[data-action="delete-' + poolKey + '"]');
      if (delBtn) {
        var tr = delBtn.closest('tr[data-id]');
        if (!confirm('למחוק לצמיתות?')) return;
        var d = APP.state.get();
        d.pools[poolKey] = d.pools[poolKey].filter(function (x) { return x.id !== tr.dataset.id; });
        APP.state.save();
        rerenderPool(poolKey);
      }
    });
  }

  function renderSettings() {
    var el = document.getElementById('tab-settings');
    if (!el) return;
    el.innerHTML = '<div class="card">' +
      '<h2>הגדרות וגיבוי</h2>' +
      '<p>הנתונים נשמרים בדפדפן הזה בלבד (localStorage) - אין סנכרון בין מכשירים. מומלץ לייצא גיבוי JSON מעת לעת.</p>' +
      '<div class="row">' +
      '<button class="btn-primary" data-action="export-data">ייצוא גיבוי (JSON)</button>' +
      '<label class="btn-secondary file-label">ייבוא גיבוי<input type="file" id="import-file" accept="application/json" hidden></label>' +
      '</div>' +
      '<div class="row" style="margin-top:20px;">' +
      '<button class="btn-secondary" data-action="change-password">שינוי סיסמה</button>' +
      '<button class="btn-secondary" data-action="change-trainees-password">סיסמת דירוגי חניכים</button>' +
      '<button class="btn-secondary" data-action="lock-now">נעילה</button>' +
      '</div>' +
      '<p class="disclaimer">⚠️ הגנת הסיסמה כאן בסיסית בלבד (אתר סטטי, ללא שרת) ואינה מהווה אבטחת מידע אמיתית - אין להזין באתר זה מידע רגיש.</p>' +
      '<h3 style="margin-top:20px;">גיבוי אוטומטי ל-Google Sheets</h3>' +
      '<p class="muted">הדבק כאן את כתובת ה-Web App שקיבלת אחרי פריסת ה-Apps Script (ראה google-apps-script/README.md בפרויקט). לאחר שמירת הכתובת, כל שינוי באתר יגובה אוטומטית תוך כמה שניות.</p>' +
      '<div class="row">' +
      '<input type="text" id="backup-url-input" placeholder="כתובת Web App" value="' + APP.util.escapeHtml(APP.backup.getUrl()) + '" style="flex:1;min-width:240px;">' +
      '<button class="btn-secondary" data-action="save-backup-url">שמור כתובת</button>' +
      '</div>' +
      '<div class="row" style="margin-top:8px;">' +
      '<button class="btn-secondary" data-action="test-backup-connection">בדוק חיבור</button>' +
      '<button class="btn-secondary" data-action="backup-now">גבה עכשיו</button>' +
      '<button class="btn-secondary" data-action="pull-backup">משוך עדכונים ממכשיר אחר</button>' +
      '<span id="backup-status" class="muted"></span>' +
      '</div>' +
      '<p class="muted">"משוך עדכונים" מחליף את החניכים/אנשי הצוות/חקלאים במכשיר הזה בגרסה שנשמרה לגיליון - להשתמש רק אחרי שהמכשיר האחר גיבה קודם.</p>' +
      '</div>';
  }

  function wireSettings() {
    var el = document.getElementById('tab-settings');
    el.addEventListener('click', function (e) {
      if (e.target.closest('[data-action="export-data"]')) {
        APP.storage.exportJSON(APP.state.get());
      }
      if (e.target.closest('[data-action="change-password"]')) {
        var p1 = prompt('הזן סיסמה חדשה:');
        if (p1 && p1.length >= 3) { APP.auth.setPassword(p1); alert('הסיסמה עודכנה'); }
        else if (p1) { alert('סיסמה קצרה מדי'); }
      }
      if (e.target.closest('[data-action="change-trainees-password"]')) {
        var tp1 = prompt('הזן סיסמה חדשה להצגת דירוגי החניכים (השאר ריק לביטול ההגנה):');
        if (tp1 === null) { /* cancelled */ }
        else if (tp1 === '') {
          APP.state.get().auth = APP.state.get().auth || {};
          delete APP.state.get().auth.traineesPasswordHash;
          APP.state.save();
          APP.pools.renderTrainees();
          alert('ההגנה בוטלה - דירוגי החניכים יהיו גלויים לכולם');
        } else if (tp1.length >= 3) {
          APP.auth.setTraineesPassword(tp1);
          APP.pools.renderTrainees();
          alert('סיסמת דירוגי החניכים עודכנה');
        } else {
          alert('סיסמה קצרה מדי');
        }
      }
      if (e.target.closest('[data-action="lock-now"]')) {
        APP.auth.lock();
        location.reload();
      }
      if (e.target.closest('[data-action="save-backup-url"]')) {
        var urlInput = document.getElementById('backup-url-input');
        APP.backup.setUrl(urlInput ? urlInput.value.trim() : '');
        var statusEl = document.getElementById('backup-status');
        if (statusEl) { statusEl.textContent = 'הכתובת נשמרה'; statusEl.className = 'muted'; }
      }
      if (e.target.closest('[data-action="test-backup-connection"]')) {
        var testStatusEl = document.getElementById('backup-status');
        var testUrlInput = document.getElementById('backup-url-input');
        var testUrl = testUrlInput ? testUrlInput.value.trim() : '';
        if (testStatusEl) { testStatusEl.textContent = 'בודק...'; testStatusEl.className = 'muted'; }
        APP.backup.testConnection(testUrl, function (ok) {
          if (testStatusEl) {
            testStatusEl.textContent = ok ? '✓ החיבור תקין' : '✗ החיבור נכשל - בדוק את הכתובת';
            testStatusEl.className = ok ? 'text-success' : 'error-text';
          }
        });
      }
      if (e.target.closest('[data-action="backup-now"]')) {
        var nowStatusEl = document.getElementById('backup-status');
        APP.backup.sendNow();
        if (nowStatusEl) { nowStatusEl.textContent = 'גיבוי נשלח'; nowStatusEl.className = 'muted'; }
      }
      if (e.target.closest('[data-action="pull-backup"]')) {
        var pullStatusEl = document.getElementById('backup-status');
        if (!APP.backup.getUrl()) { alert('יש להגדיר ולשמור כתובת Web App קודם'); return; }
        if (!confirm('פעולה זו תחליף את רשימות החניכים, אנשי הצוות והחקלאים במכשיר הזה בגרסה השמורה בגיליון. להמשיך?')) return;
        if (pullStatusEl) { pullStatusEl.textContent = 'מושך נתונים...'; pullStatusEl.className = 'muted'; }
        APP.backup.pullFromBackup(function (err) {
          if (err) {
            if (pullStatusEl) { pullStatusEl.textContent = '✗ המשיכה נכשלה - בדוק את הכתובת והחיבור'; pullStatusEl.className = 'error-text'; }
            return;
          }
          if (pullStatusEl) { pullStatusEl.textContent = '✓ הנתונים עודכנו'; pullStatusEl.className = 'text-success'; }
          APP.pools.renderTrainees();
          APP.pools.renderLeaders();
          APP.pools.renderFarmers();
          APP.render.renderTaskTab();
        });
      }
    });
    el.addEventListener('change', function (e) {
      if (e.target.id === 'import-file' && e.target.files[0]) {
        APP.storage.importJSON(e.target.files[0], function (err, data) {
          if (err) { alert('קובץ לא תקין'); return; }
          if (!confirm('ייבוא יחליף את כל הנתונים הקיימים באתר זה. להמשיך?')) return;
          APP.storage.save(data);
          location.reload();
        });
      }
    });
  }

  function wireTabs() {
    APP.util.qsa('.tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        APP.util.qsa('.tab-btn').forEach(function (b) { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
        APP.util.qsa('.tab-content').forEach(function (c) { c.classList.remove('active'); });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
        if (btn.dataset.tab === 'task') APP.render.renderTaskTab();
        if (btn.dataset.tab === 'post-requirements') APP.render.renderPostRequirementsTab();
        if (btn.dataset.tab === 'history') APP.history.render();
        if (btn.dataset.tab === 'trainees') APP.pools.renderTrainees();
        if (btn.dataset.tab === 'leaders') APP.pools.renderLeaders();
        if (btn.dataset.tab === 'farmers') APP.pools.renderFarmers();
        if (btn.dataset.tab === 'jobtemplates') APP.pools.renderJobTemplates();
        if (btn.dataset.tab === 'settings') renderSettings();
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    APP.state.init();
    APP.seedData.seedInitialTeamIfNeeded();
    APP.task.ensureCurrentTaskLoaded();

    var loginScreen = document.getElementById('login-screen');
    var appShell = document.getElementById('app-shell');

    function showLogin() {
      loginScreen.hidden = false;
      appShell.hidden = true;
      var setupMode = !APP.auth.hasPassword();
      document.getElementById('login-mode-label').textContent = setupMode
        ? 'זו הכניסה הראשונה - הגדר סיסמה חדשה לאתר:'
        : 'הזן סיסמה כדי להיכנס:';
      document.getElementById('login-password-confirm-field').hidden = !setupMode;
      document.getElementById('login-submit').textContent = setupMode ? 'הגדר סיסמה' : 'כניסה';
      document.getElementById('login-password').value = '';
      document.getElementById('login-password-confirm').value = '';
      document.getElementById('login-error').hidden = true;
      resetPasswordToggles();
      document.getElementById('login-password').focus();
    }

    var appShown = false;
    function showApp() {
      loginScreen.hidden = true;
      appShell.hidden = false;
      if (appShown) return;
      appShown = true;
      APP.render.renderTaskTab();
      APP.history.render();
      APP.pools.renderLeaders();
      APP.pools.renderFarmers();
      APP.pools.renderJobTemplates();
      APP.pools.renderTrainees();
      renderSettings();
      wireTaskTab();
      wirePostRequirementsTab();
      wireHistory();
      wireTrainees();
      wireSimplePool('tab-leaders', 'leaders', APP.state.addLeader);
      wireSimplePool('tab-farmers', 'farmers', APP.state.addFarmer);
      wireJobTemplates();
      wireFarmerPrefs();
      wireSettings();
      wireModal();
      wireTabs();
      wirePreviewToolbar();
    }

    function submitLogin() {
      var pw = document.getElementById('login-password').value;
      var errEl = document.getElementById('login-error');
      errEl.hidden = true;
      if (!APP.auth.hasPassword()) {
        var confirmPw = document.getElementById('login-password-confirm').value;
        if (!pw || pw.length < 3) { errEl.textContent = 'סיסמה קצרה מדי (לפחות 3 תווים)'; errEl.hidden = false; return; }
        if (pw !== confirmPw) { errEl.textContent = 'הסיסמאות אינן תואמות'; errEl.hidden = false; return; }
        APP.auth.setPassword(pw);
        APP.auth.markUnlocked();
        showApp();
      } else if (APP.auth.checkPassword(pw)) {
        APP.auth.markUnlocked();
        showApp();
      } else {
        errEl.textContent = 'סיסמה שגויה';
        errEl.hidden = false;
      }
    }

    wirePasswordToggles();

    document.getElementById('login-submit').addEventListener('click', submitLogin);
    document.getElementById('login-password').addEventListener('keydown', function (e) { if (e.key === 'Enter') submitLogin(); });
    document.getElementById('login-password-confirm').addEventListener('keydown', function (e) { if (e.key === 'Enter') submitLogin(); });

    if (APP.auth.hasPassword() && APP.auth.isUnlockedThisSession()) {
      showApp();
    } else {
      showLogin();
    }
  });
})();
