window.APP = window.APP || {};

APP.state = (function () {
  var data = null;

  function init() {
    data = APP.storage.load();
    return data;
  }
  function get() { return data; }
  function save() { APP.storage.save(data); }

  // ---- generic cell-value helpers (used by the drag/swap system) ----
  // A cell value is one of:
  //   {t:'empty'}
  //   {t:'text', v:string}
  //   {t:'ref', rt:'trainee'|'leader'|'guest', id:string}
  function textVal(v) { return { t: 'text', v: v || '' }; }
  function emptyVal() { return { t: 'empty' }; }
  function refVal(rt, id) { return { t: 'ref', rt: rt, id: id }; }

  function findById(list, id) {
    return (list || []).filter(function (x) { return x.id === id; })[0];
  }

  function activeOnly(list) {
    return (list || []).filter(function (x) { return x.active !== false; });
  }

  function personName(rt, id, task) {
    if (!id) return '';
    if (rt === 'trainee') {
      var t = findById(data.pools.trainees, id);
      return t ? t.name : '(נמחק)';
    }
    if (rt === 'leader') {
      var l = findById(data.pools.leaders, id);
      return l ? l.name : '(נמחק)';
    }
    if (rt === 'guest') {
      var g = task && findById(task.extraGuests, id);
      return g ? g.name : '(אורח נמחק)';
    }
    return '';
  }

  function cellDisplay(value, task) {
    if (!value) return '';
    if (value.t === 'text') return value.v;
    if (value.t === 'ref') return personName(value.rt, value.id, task);
    return '';
  }

  // ---- pools ----
  function addTrainee(name, ratings, cohort, gender) {
    var t = { id: APP.storage.uid('t'), name: name, ratings: ratings, cohort: cohort || 'e', gender: gender || 'm', active: true };
    data.pools.trainees.push(t);
    save();
    return t;
  }
  function addLeader(name) {
    var l = { id: APP.storage.uid('l'), name: name, active: true };
    data.pools.leaders.push(l);
    save();
    return l;
  }
  function addFarmer(name) {
    var f = { id: APP.storage.uid('f'), name: name, active: true, phone: '', location: '', jobType: '', preferredTraineeIds: [] };
    data.pools.farmers.push(f);
    save();
    return f;
  }
  function addPostTemplate(tpl) {
    tpl.id = APP.storage.uid('pt');
    tpl.active = true;
    data.pools.postTemplates.push(tpl);
    save();
    return tpl;
  }

  // ---- tasks ----
  function sortedTasksDesc() {
    return data.tasks.slice().sort(function (a, b) { return b.date.localeCompare(a.date); });
  }
  function getTask(id) { return findById(data.tasks, id); }
  function getCurrentTask() {
    if (!data.currentTaskId) return null;
    return getTask(data.currentTaskId) || null;
  }
  function todayISO() { return new Date().toISOString().slice(0, 10); }

  function defaultMeta() {
    return [
      { key: 'farmer', label: 'חקלאי', value: textVal('') },
      { key: 'jobType', label: 'סוג עבודה', value: textVal('') },
      { key: 'location', label: 'מיקום', value: textVal('') },
      { key: 'vehicle', label: 'רכב', value: textVal('') },
      { key: 'pickupTime', label: 'שעת הקפצה', value: textVal('') },
      { key: 'dropoffTime', label: 'שעת איסוף', value: textVal('') },
      { key: 'water', label: 'מים', value: textVal('') },
      { key: 'notes', label: 'הערות', value: textVal('') }
    ];
  }

  function createTask(date) {
    var prev = sortedTasksDesc()[0];
    var task = {
      id: APP.storage.uid('task'),
      date: date,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      meta: defaultMeta(),
      absentTraineeIds: [],
      posts: [],
      extraGuests: [],
      assignment: null
    };
    if (prev) {
      task.posts = prev.posts.map(function (p) {
        return {
          id: APP.storage.uid('post'),
          templateId: p.templateId,
          farmerId: p.farmerId,
          leader: JSON.parse(JSON.stringify(p.leader)),
          requirements: JSON.parse(JSON.stringify(p.requirements)),
          workerCount: p.workerCount,
          order: p.order
        };
      });
      var prevFarmerMeta = prev.meta.filter(function (m) { return m.key === 'farmer'; })[0];
      if (prevFarmerMeta) {
        var newFarmerMeta = task.meta.filter(function (m) { return m.key === 'farmer'; })[0];
        newFarmerMeta.value = JSON.parse(JSON.stringify(prevFarmerMeta.value));
      }
    }
    data.tasks.push(task);
    data.currentTaskId = task.id;
    save();
    return task;
  }

  function deleteTask(id) {
    data.tasks = data.tasks.filter(function (t) { return t.id !== id; });
    if (data.currentTaskId === id) data.currentTaskId = null;
    save();
  }

  function addPost(task, farmerId, leaderId, requirements, workerCount, templateId, transportMethod) {
    var post = {
      id: APP.storage.uid('post'),
      templateId: templateId || null,
      farmerId: farmerId,
      leader: refVal('leader', leaderId),
      transportMethod: transportMethod || 'shuttle',
      requirements: requirements,
      workerCount: workerCount,
      order: task.posts.length
    };
    task.posts.push(post);
    task.updatedAt = Date.now();
    save();
    return post;
  }

  function removePost(task, postId) {
    task.posts = task.posts.filter(function (p) { return p.id !== postId; });
    if (task.assignment) delete task.assignment.postAssignments[postId];
    task.updatedAt = Date.now();
    save();
  }

  function addGuestToTask(task, name, gender) {
    var g = {
      id: APP.storage.uid('g'), name: name, gender: gender || 'm',
      ratings: { strength: 4, dexterity: 4, responsibility: 4, leadership: 4 }
    };
    task.extraGuests.push(g);
    save();
    return g;
  }

  // ---- generic cell accessors (used by dragswap.js) ----
  function resolveCell(task, cellId) {
    if (cellId.indexOf('meta:') === 0) {
      var key = cellId.slice(5);
      var entry = task.meta.filter(function (m) { return m.key === key; })[0];
      if (!entry) return null;
      return {
        get: function () { return entry.value; },
        set: function (v) { entry.value = v; }
      };
    }
    if (cellId.indexOf('spare:') === 0) {
      var idx0 = parseInt(cellId.slice(6), 10);
      if (!task.assignment) task.assignment = { postAssignments: {}, spare: [] };
      var spareArr = task.assignment.spare;
      while (spareArr.length <= idx0) spareArr.push(emptyVal());
      return {
        get: function () { return spareArr[idx0]; },
        set: function (v) { spareArr[idx0] = v; }
      };
    }
    if (cellId.indexOf('post:') === 0) {
      var rest = cellId.slice(5);
      var parts = rest.split(':'); // [postId,'header'] or [postId,'slot',idx]
      var postId = parts[0];
      var post = task.posts.filter(function (p) { return p.id === postId; })[0];
      if (!post) return null;
      if (parts[1] === 'header') {
        return {
          get: function () { return post.leader; },
          set: function (v) { post.leader = v; }
        };
      }
      if (parts[1] === 'slot') {
        var idx = parseInt(parts[2], 10);
        if (!task.assignment) task.assignment = { postAssignments: {}, spare: [] };
        if (!task.assignment.postAssignments[postId]) {
          task.assignment.postAssignments[postId] = { workerIds: [] };
        }
        var arr = task.assignment.postAssignments[postId].workerIds;
        while (arr.length <= idx) arr.push(emptyVal());
        return {
          get: function () { return arr[idx]; },
          set: function (v) { arr[idx] = v; }
        };
      }
    }
    return null;
  }

  // Direct placement of a guest into a specific post - bypasses the
  // auto-assign algorithm entirely. Reuses an existing empty slot if one
  // exists; otherwise grows a flexible post naturally, or bumps a fixed
  // post's workerCount by 1 so the new slot is visible in the grid.
  function findGuestSlotIndex(task, post) {
    var pa = task.assignment && task.assignment.postAssignments[post.id];
    var arr = pa ? pa.workerIds : [];
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].t === 'empty') return i;
    }
    var cap = APP.assign.postCapacity(post);
    if (cap != null && arr.length >= cap) {
      post.workerCount += 1;
    }
    return arr.length;
  }

  function assignGuestToPost(task, guestId, postId) {
    var post = task.posts.filter(function (p) { return p.id === postId; })[0];
    if (!post) return false;
    var idx = findGuestSlotIndex(task, post);
    var cell = resolveCell(task, 'post:' + postId + ':slot:' + idx);
    cell.set(refVal('guest', guestId));
    save();
    return true;
  }

  function swapCells(task, cellIdA, cellIdB) {
    var a = resolveCell(task, cellIdA);
    var b = resolveCell(task, cellIdB);
    if (!a || !b) return false;
    var va = a.get();
    var vb = b.get();
    a.set(vb);
    b.set(va);
    task.updatedAt = Date.now();
    save();
    return true;
  }

  return {
    init: init, get: get, save: save,
    textVal: textVal, emptyVal: emptyVal, refVal: refVal,
    cellDisplay: cellDisplay, personName: personName, findById: findById, activeOnly: activeOnly,
    addTrainee: addTrainee, addLeader: addLeader, addFarmer: addFarmer, addPostTemplate: addPostTemplate,
    sortedTasksDesc: sortedTasksDesc, getTask: getTask, getCurrentTask: getCurrentTask, todayISO: todayISO,
    createTask: createTask, deleteTask: deleteTask,
    addPost: addPost, removePost: removePost, addGuestToTask: addGuestToTask,
    resolveCell: resolveCell, swapCells: swapCells, assignGuestToPost: assignGuestToPost
  };
})();
