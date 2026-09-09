(function () {
  var taskActions;
  var debouncedSave = APP.util.debounce(function () { APP.state.save(); }, 400);

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

  // The "חניכים" tab can be gated behind its own password (set in
  // Settings), separate from the app's main login - opt-in: if no
  // trainees password is configured, this behaves exactly like before.
  function renderTraineesTabGated() {
    var el = document.getElementById('tab-trainees');
    if (!el) return;
    if (!APP.auth.hasTraineesPassword() || APP.auth.isTraineesUnlockedThisSession()) {
      APP.pools.renderTrainees();
      return;
    }
    el.innerHTML = '<div class="card">' +
      '<h2>לשונית חניכים נעולה</h2>' +
      '<p class="muted">הזן/י את סיסמת לשונית החניכים כדי להציג את הרשימה.</p>' +
      '<div class="row">' +
      '<input type="password" id="trainees-lock-password" placeholder="סיסמה">' +
      '<button class="btn-primary" data-action="trainees-unlock">פתח</button>' +
      '</div>' +
      '<p id="trainees-lock-error" class="error-text" hidden>סיסמה שגויה</p>' +
      '</div>';
  }

  function rerenderPool(key) {
    if (key === 'trainees') renderTraineesTabGated();
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
      'print': function () { window.print(); },
      'task-details-start': function () {
        APP.modal.open(APP.render.taskDetailsModalHtml(APP.state.getCurrentTask()), { onDismiss: function () { APP.modal.close(); } });
      },
      'preview-open': function () { enterPreview(); },
      'add-post-start': function () { APP.task.startStepper(); openPostModal(); },
      'edit-post': function (el) {
        var task = APP.state.getCurrentTask();
        var post = task.posts.filter(function (p) { return p.id === el.dataset.postId; })[0];
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
  function autoAssignIfPosts() {
    var task = APP.state.getCurrentTask();
    if (task && task.posts.length) {
      try {
        task.assignment = APP.assign.runAutoAssign(task, APP.state.get().pools);
        task.updatedAt = Date.now();
        APP.state.save();
      } catch (err) {
        alert('אירעה שגיאה בשיבוץ האוטומטי, נסה שוב.');
      }
    }
  }

  function rerunAutoAssignIfNeeded() {
    var task = APP.state.getCurrentTask();
    if (task && task.assignment) {
      try {
        task.assignment = APP.assign.runAutoAssign(task, APP.state.get().pools);
        task.updatedAt = Date.now();
        APP.state.save();
      } catch (err) {
        alert('אירעה שגיאה בשיבוץ האוטומטי, נסה שוב.');
      }
    }
  }

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
          // Close and render immediately so the response feels instant -
          // the post is already saved at this point. The (usually near-
          // instant, but try/catch-guarded) auto-reassign runs after, with
          // its own render once it's done, so a slow or failing recompute
          // never leaves the modal stuck open.
          APP.modal.close();
          APP.render.renderTaskTab();
          autoAssignIfPosts();
          APP.render.renderTaskTab();
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
            APP.assign.recomputePhoneCarriers(guestTask, APP.state.get().pools, guestTask.assignment.postAssignments);
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
            if (!cb.checked) APP.task.deletePostNoConfirm(cb.dataset.postId);
          });
        }
        APP.modal.close();
        APP.render.renderTaskTab();
        autoAssignIfPosts();
        APP.render.renderTaskTab();
        var afterCarried = APP.state.getCurrentTask();
        if (afterCarried && afterCarried.posts.length === 0) {
          APP.task.startStepper();
          openPostModal();
        }
        return;
      }
      // Trainee modal actions
      if (e.target.closest('[data-action="add-trainee-commit"]')) {
        var name = document.getElementById('modal-trainee-name').value.trim();
        if (!name) { alert('הזן שם'); return; }
        var ratings = {
          strength: parseInt(document.getElementById('modal-trainee-strength').value, 10),
          dexterity: parseInt(document.getElementById('modal-trainee-dexterity').value, 10),
          responsibility: parseInt(document.getElementById('modal-trainee-responsibility').value, 10),
          leadership: parseInt(document.getElementById('modal-trainee-leadership').value, 10)
        };
        var cohort = document.getElementById('modal-trainee-cohort').value;
        var gender = document.getElementById('modal-trainee-gender').value;
        APP.state.addTrainee(name, ratings, cohort, gender);
        APP.modal.close();
        renderTraineesTabGated();
        return;
      }
      if (e.target.closest('[data-action="add-trainee-cancel"]')) {
        APP.modal.close();
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
            responsibilityMinCount: { level: 5, count: 0 },
            leadershipMinCount: { level: 5, count: 0 },
            genderMinCount: { male: 0, female: 0 }
          }
        });
        APP.modal.close();
        APP.pools.renderJobTemplates();
        return;
      }
      if (e.target.closest('[data-action="add-jobtemplate-cancel"]')) {
        APP.modal.close();
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
    overlay.addEventListener('input', function (e) {
      if (e.target && e.target.dataset && e.target.dataset.cellInput) {
        var task = APP.state.getCurrentTask();
        if (!task) return;
        var cell = APP.state.resolveCell(task, e.target.dataset.cellInput);
        if (cell) { cell.set(APP.state.textVal(e.target.value)); debouncedSave(); }
      }
    });
    overlay.addEventListener('change', function (e) {
      if (e.target && e.target.id === 'stepper-template-select') {
        APP.task.applyTemplate(e.target.value);
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
    el.addEventListener('input', function (e) {
      if (e.target && e.target.dataset && e.target.dataset.cellInput) {
        var task = APP.state.getCurrentTask();
        if (!task) return;
        var cell = APP.state.resolveCell(task, e.target.dataset.cellInput);
        if (cell) { cell.set(APP.state.textVal(e.target.value)); debouncedSave(); }
      }
    });
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
      else if (['strength', 'dexterity', 'responsibility', 'leadership'].indexOf(f) >= 0) {
        t.ratings[f] = parseInt(e.target.value, 10);
      }
      APP.state.save();
      APP.render.renderTaskTab();
    });
    el.addEventListener('click', function (e) {
      if (e.target.closest('[data-action="trainees-unlock"]')) {
        var pwInput = document.getElementById('trainees-lock-password');
        var errorEl = document.getElementById('trainees-lock-error');
        if (pwInput && APP.auth.checkTraineesPassword(pwInput.value)) {
          APP.auth.markTraineesUnlocked();
          renderTraineesTabGated();
        } else if (errorEl) {
          errorEl.hidden = false;
        }
        return;
      }
      if (e.target.closest('[data-action="add-trainee-start"]')) {
        APP.modal.open(APP.pools.addTraineeModalHtml(), { onDismiss: function () { APP.modal.close(); } });
        return;
      }
      var delBtn = e.target.closest('[data-action="delete-trainee"]');
      if (delBtn) {
        var tr = delBtn.closest('tr[data-id]');
        if (!confirm('למחוק את החניך לצמיתות?')) return;
        var d = APP.state.get();
        d.pools.trainees = d.pools.trainees.filter(function (x) { return x.id !== tr.dataset.id; });
        APP.state.save();
        renderTraineesTabGated();
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
      else if (f === 'strength' || f === 'dexterity') r[f] = parseInt(e.target.value, 10);
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
      '<button class="btn-secondary" data-action="change-trainees-password">סיסמת לשונית חניכים</button>' +
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
      '<span id="backup-status" class="muted"></span>' +
      '</div>' +
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
        var tp1 = prompt('הזן סיסמה חדשה ללשונית חניכים (השאר ריק לביטול הנעילה):');
        if (tp1 === null) { /* cancelled */ }
        else if (tp1 === '') {
          APP.state.get().auth = APP.state.get().auth || {};
          delete APP.state.get().auth.traineesPasswordHash;
          APP.state.save();
          alert('הנעילה בוטלה - הלשונית תהיה פתוחה לכולם');
        } else if (tp1.length >= 3) {
          APP.auth.setTraineesPassword(tp1);
          alert('סיסמת לשונית החניכים עודכנה');
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
        if (btn.dataset.tab === 'trainees') renderTraineesTabGated();
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
      renderTraineesTabGated();
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
