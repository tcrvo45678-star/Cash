(function () {
  var taskActions;

  function openPostModal() {
    APP.modal.open(APP.render.postStepperHtml(), { onDismiss: cancelPostModal });
  }

  function cancelPostModal() {
    APP.task.cancelStepper();
    APP.modal.close();
  }

  function resetPasswordToggles() {
    APP.util.qsa('.password-toggle').forEach(function (btn) {
      var input = document.getElementById(btn.dataset.toggleFor);
      if (input) input.type = 'password';
      btn.textContent = 'הצג';
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
      });
    });
  }

  function rerenderPool(key) {
    if (key === 'trainees') APP.pools.renderTrainees();
    if (key === 'leaders') APP.pools.renderLeaders();
    if (key === 'farmers') APP.pools.renderFarmers();
    if (key === 'postTemplates') APP.pools.renderTemplates();
  }

  function buildTaskActions() {
    return {
      'create-task': function () {
        var dateInput = document.getElementById('new-task-date');
        var date = dateInput ? dateInput.value : APP.state.todayISO();
        if (!date) return;
        APP.task.createTaskForDate(date);
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
      'add-post-start': function () { APP.task.startStepper(); openPostModal(); },
      'edit-post': function (el) {
        var task = APP.state.getCurrentTask();
        var post = task.posts.filter(function (p) { return p.id === el.dataset.postId; })[0];
        if (!post) return;
        APP.task.startStepper(post);
        openPostModal();
      },
      'delete-post': function (el) { APP.task.deletePost(el.dataset.postId); APP.render.renderTaskTab(); },
      'toggle-absent': function (el) { APP.task.toggleAbsent(el.dataset.traineeId); },
      'add-guest': function () {
        var inp = document.getElementById('new-guest-name');
        if (!inp || !inp.value.trim()) return;
        APP.task.addGuest(inp.value.trim());
        APP.render.renderTaskTab();
      },
      'remove-guest': function (el) { APP.task.removeGuest(el.dataset.guestId); APP.render.renderTaskTab(); }
    };
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
          APP.modal.close();
          APP.render.renderTaskTab();
        }
        return;
      }
      // Template selection in stepper
      if (e.target.id === 'stepper-template-select') {
        APP.task.readStep1FromDom();
        if (e.target.value) APP.task.applyTemplate(e.target.value);
        APP.modal.setContent(APP.render.postStepperHtml());
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
        APP.state.addTrainee(name, ratings);
        APP.modal.close();
        APP.pools.renderTrainees();
        return;
      }
      if (e.target.closest('[data-action="add-trainee-cancel"]')) {
        APP.modal.close();
        return;
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
        if (cell) { cell.set(APP.state.textVal(e.target.value)); APP.state.save(); }
      }
    });
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
      else if (f === 'active') t.active = e.target.checked;
      else if (['strength', 'dexterity', 'responsibility', 'leadership'].indexOf(f) >= 0) {
        t.ratings[f] = parseInt(e.target.value, 10);
      }
      APP.state.save();
    });
    el.addEventListener('click', function (e) {
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
        APP.pools.renderTrainees();
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
      if (e.target.dataset.field === 'name') item.name = e.target.value;
      if (e.target.dataset.field === 'active') item.active = e.target.checked;
      APP.state.save();
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

  function wireTemplates() {
    var el = document.getElementById('tab-templates');
    el.addEventListener('change', function (e) {
      var tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      var tpl = APP.state.findById(APP.state.get().pools.postTemplates, tr.dataset.id);
      if (!tpl) return;
      var f = e.target.dataset.field;
      var r = tpl.defaultRequirements;
      if (f === 'name') tpl.name = e.target.value;
      else if (f === 'active') tpl.active = e.target.checked;
      else if (f === 'strength') r.strength = parseInt(e.target.value, 10);
      else if (f === 'dexterity') r.dexterity = parseInt(e.target.value, 10);
      else if (f === 'resp-level') r.responsibilityMinCount.level = parseInt(e.target.value, 10);
      else if (f === 'resp-count') r.responsibilityMinCount.count = parseInt(e.target.value, 10) || 0;
      else if (f === 'lead-level') r.leadershipMinCount.level = parseInt(e.target.value, 10);
      else if (f === 'lead-count') r.leadershipMinCount.count = parseInt(e.target.value, 10) || 0;
      else if (f === 'workerCount') tpl.defaultWorkerCount = parseInt(e.target.value, 10) || 1;
      APP.state.save();
    });
    el.addEventListener('click', function (e) {
      if (e.target.closest('[data-action="add-postTemplates"]')) {
        var inp = document.getElementById('new-postTemplates-name');
        var name = inp.value.trim();
        if (!name) return;
        APP.state.addPostTemplate({
          name: name,
          defaultRequirements: {
            strength: 4, dexterity: 4,
            responsibilityMinCount: { level: 5, count: 1 },
            leadershipMinCount: { level: 5, count: 1 }
          },
          defaultWorkerCount: 3
        });
        inp.value = '';
        APP.pools.renderTemplates();
        return;
      }
      var delBtn = e.target.closest('[data-action="delete-postTemplates"]');
      if (delBtn) {
        var tr = delBtn.closest('tr[data-id]');
        if (!confirm('למחוק לצמיתות?')) return;
        var d = APP.state.get();
        d.pools.postTemplates = d.pools.postTemplates.filter(function (x) { return x.id !== tr.dataset.id; });
        APP.state.save();
        APP.pools.renderTemplates();
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
      '<button class="btn-secondary" data-action="lock-now">נעילה</button>' +
      '</div>' +
      '<p class="disclaimer">⚠️ הגנת הסיסמה כאן בסיסית בלבד (אתר סטטי, ללא שרת) ואינה מהווה אבטחת מידע אמיתית - אין להזין באתר זה מידע רגיש.</p>' +
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
      if (e.target.closest('[data-action="lock-now"]')) {
        APP.auth.lock();
        location.reload();
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
        APP.util.qsa('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
        APP.util.qsa('.tab-content').forEach(function (c) { c.classList.remove('active'); });
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
        if (btn.dataset.tab === 'task') APP.render.renderTaskTab();
        if (btn.dataset.tab === 'history') APP.history.render();
        if (btn.dataset.tab === 'trainees') APP.pools.renderTrainees();
        if (btn.dataset.tab === 'leaders') APP.pools.renderLeaders();
        if (btn.dataset.tab === 'farmers') APP.pools.renderFarmers();
        if (btn.dataset.tab === 'templates') APP.pools.renderTemplates();
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

    function showApp() {
      loginScreen.hidden = true;
      appShell.hidden = false;
      APP.render.renderTaskTab();
      APP.history.render();
      APP.pools.render();
      renderSettings();
      wireTaskTab();
      wireHistory();
      wireTrainees();
      wireSimplePool('tab-leaders', 'leaders', APP.state.addLeader);
      wireSimplePool('tab-farmers', 'farmers', APP.state.addFarmer);
      wireTemplates();
      wireSettings();
      wireModal();
      wireTabs();
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
