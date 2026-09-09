window.APP = window.APP || {};

APP.task = (function () {
  var stepper = null; // transient in-progress "add/edit post" wizard state

  function ensureCurrentTaskLoaded() {
    var d = APP.state.get();
    if (d.currentTaskId && APP.state.getTask(d.currentTaskId)) return;
    var tasks = APP.state.sortedTasksDesc();
    d.currentTaskId = tasks.length ? tasks[0].id : null;
  }

  function createTaskForDate(dateStr) {
    var existing = APP.state.get().tasks.filter(function (t) { return t.date === dateStr; })[0];
    if (existing) {
      APP.state.get().currentTaskId = existing.id;
      APP.state.save();
      return { task: existing, wasNew: false };
    }
    return { task: APP.state.createTask(dateStr), wasNew: true };
  }

  function openTask(id) {
    APP.state.get().currentTaskId = id;
    APP.state.save();
  }

  function toggleAbsent(traineeId) {
    var t = APP.state.getCurrentTask();
    if (!t) return;
    var idx = t.absentTraineeIds.indexOf(traineeId);
    if (idx >= 0) t.absentTraineeIds.splice(idx, 1);
    else t.absentTraineeIds.push(traineeId);
    APP.state.save();
  }

  function addGuest(name, gender) {
    var t = APP.state.getCurrentTask();
    if (!t || !name) return null;
    return APP.state.addGuestToTask(t, name, gender);
  }

  function removeGuest(guestId) {
    var t = APP.state.getCurrentTask();
    if (!t) return;
    t.extraGuests = t.extraGuests.filter(function (g) { return g.id !== guestId; });
    if (t.assignment) {
      Object.keys(t.assignment.postAssignments).forEach(function (pid) {
        t.assignment.postAssignments[pid].workerIds = t.assignment.postAssignments[pid].workerIds.map(function (w) {
          return (w.t === 'ref' && w.rt === 'guest' && w.id === guestId) ? APP.state.emptyVal() : w;
        });
      });
    }
    APP.state.save();
  }

  function deletePost(postId, skipConfirm) {
    var t = APP.state.getCurrentTask();
    if (!t) return;
    if (!skipConfirm && !confirm('למחוק את העמדה?')) return;
    APP.state.removePost(t, postId);
  }

  // ---------- 3-question add/edit-post stepper ----------
  function startStepper(existingPost) {
    if (existingPost) {
      var existingFarmer = APP.state.findById(APP.state.get().pools.farmers, existingPost.farmerId);
      stepper = {
        editingPostId: existingPost.id,
        step: 1,
        farmerId: existingPost.farmerId,
        newFarmerName: '',
        location: (existingFarmer && existingFarmer.location) || '',
        jobType: (existingFarmer && existingFarmer.jobType) || '',
        leaderId: (existingPost.leader && existingPost.leader.t === 'ref' && existingPost.leader.rt === 'leader') ? existingPost.leader.id : '',
        transportMethod: existingPost.transportMethod || 'shuttle',
        templateId: existingPost.templateId || '',
        requirements: JSON.parse(JSON.stringify(existingPost.requirements)),
        workerCount: existingPost.workerCount
      };
    } else {
      stepper = {
        editingPostId: null,
        step: 1,
        farmerId: '',
        newFarmerName: '',
        location: '',
        jobType: '',
        leaderId: '',
        transportMethod: 'shuttle',
        templateId: '',
        requirements: {
          strength: 4, dexterity: 4,
          responsibilityMinCount: { level: 5, count: 1 },
          leadershipMinCount: { level: 5, count: 1 },
          genderMinCount: { male: 0, female: 0 }
        },
        workerCount: 3
      };
    }
    return stepper;
  }

  function cancelStepper() { stepper = null; }
  function getStepper() { return stepper; }
  function stepperGoTo(n) { if (stepper) stepper.step = n; }

  function applyTemplate(templateId) {
    if (!stepper) return;
    stepper.templateId = templateId;
    var tpl = APP.state.findById(APP.state.get().pools.postTemplates, templateId);
    if (tpl) {
      stepper.requirements = JSON.parse(JSON.stringify(tpl.defaultRequirements));
      stepper.workerCount = tpl.defaultWorkerCount;
    }
  }

  function readStep1FromDom() {
    if (!stepper) return;
    var sel = document.getElementById('stepper-farmer-select');
    var newName = document.getElementById('stepper-farmer-new');
    var tplSel = document.getElementById('stepper-template-select');
    var locationInp = document.getElementById('stepper-farmer-location');
    var jobTypeInp = document.getElementById('stepper-farmer-jobtype');
    stepper.farmerId = sel ? sel.value : '';
    stepper.newFarmerName = newName ? newName.value : '';
    stepper.location = locationInp ? locationInp.value : '';
    stepper.jobType = jobTypeInp ? jobTypeInp.value : '';
    if (tplSel) stepper.templateId = tplSel.value || '';
  }

  function readStep2FromDom() {
    if (!stepper) return;
    var sel = document.getElementById('stepper-leader-select');
    stepper.leaderId = sel ? sel.value : '';
    var transportSel = document.getElementById('stepper-transport-select');
    stepper.transportMethod = transportSel ? transportSel.value : 'shuttle';
  }

  function readStep3FromDom() {
    if (!stepper) return;
    stepper.requirements.strength = parseInt(document.getElementById('req-strength').value, 10);
    stepper.requirements.dexterity = parseInt(document.getElementById('req-dexterity').value, 10);
    stepper.requirements.responsibilityMinCount.level = parseInt(document.getElementById('req-resp-level').value, 10);
    stepper.requirements.responsibilityMinCount.count = parseInt(document.getElementById('req-resp-count').value, 10) || 0;
    stepper.requirements.leadershipMinCount.level = parseInt(document.getElementById('req-lead-level').value, 10);
    stepper.requirements.leadershipMinCount.count = parseInt(document.getElementById('req-lead-count').value, 10) || 0;
    stepper.requirements.genderMinCount.male = parseInt(document.getElementById('req-gender-male').value, 10) || 0;
    stepper.requirements.genderMinCount.female = parseInt(document.getElementById('req-gender-female').value, 10) || 0;
    var workerCountStr = document.getElementById('req-worker-count').value;
    stepper.workerCount = workerCountStr ? parseInt(workerCountStr, 10) : null;
  }

  function commitStepper() {
    var t = APP.state.getCurrentTask();
    if (!t || !stepper) return false;
    var farmerId = stepper.farmerId;
    if (!farmerId && stepper.newFarmerName && stepper.newFarmerName.trim()) {
      farmerId = APP.state.addFarmer(stepper.newFarmerName.trim()).id;
    }
    if (!farmerId || !stepper.leaderId) {
      alert('יש לבחור חקלאי ואיש צוות מוביל לפני השמירה');
      return false;
    }
    var farmer = APP.state.findById(APP.state.get().pools.farmers, farmerId);
    if (farmer) {
      farmer.location = stepper.location || '';
      farmer.jobType = stepper.jobType || '';
    }
    if (stepper.editingPostId) {
      var post = APP.state.findById(t.posts, stepper.editingPostId);
      if (post) {
        post.farmerId = farmerId;
        post.leader = APP.state.refVal('leader', stepper.leaderId);
        post.transportMethod = stepper.transportMethod;
        post.requirements = stepper.requirements;
        post.workerCount = stepper.workerCount;
        post.templateId = stepper.templateId || null;
        t.updatedAt = Date.now();
        APP.state.save();
      }
    } else {
      APP.state.addPost(t, farmerId, stepper.leaderId, stepper.requirements, stepper.workerCount, stepper.templateId || null, stepper.transportMethod);
    }
    stepper = null;
    return true;
  }

  return {
    ensureCurrentTaskLoaded: ensureCurrentTaskLoaded,
    createTaskForDate: createTaskForDate,
    openTask: openTask,
    toggleAbsent: toggleAbsent,
    addGuest: addGuest,
    removeGuest: removeGuest,
    deletePost: deletePost,
    startStepper: startStepper,
    cancelStepper: cancelStepper,
    getStepper: getStepper,
    stepperGoTo: stepperGoTo,
    applyTemplate: applyTemplate,
    readStep1FromDom: readStep1FromDom,
    readStep2FromDom: readStep2FromDom,
    readStep3FromDom: readStep3FromDom,
    commitStepper: commitStepper
  };
})();
